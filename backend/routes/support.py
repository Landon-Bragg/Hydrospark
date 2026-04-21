"""
Support/Billing inbox: staff ↔ customer messaging and notifications
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, SupportMessage, Notification

support_bp = Blueprint('support', __name__)


# ── Staff: list all customer threads ─────────────────────────────────────────

@support_bp.route('/threads', methods=['GET'])
@jwt_required()
def get_threads():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role not in ['admin', 'billing']:
        return jsonify({'error': 'Access denied'}), 403

    customers = Customer.query.join(User, Customer.user_id == User.id)\
        .filter(User.is_active == True).all()

    threads = []
    for customer in customers:
        messages = SupportMessage.query.filter_by(customer_id=customer.id)\
            .order_by(SupportMessage.created_at.desc()).all()
        unread = sum(
            1 for m in messages
            if m.sender_role == 'customer' and not m.read_by_staff
        )
        last = messages[0] if messages else None
        threads.append({
            'customer_id': customer.id,
            'user_id': customer.user_id,
            'customer_name': customer.customer_name,
            'location_id': customer.location_id,
            'message_count': len(messages),
            'unread_count': unread,
            'last_message': last.to_dict() if last else None,
        })

    threads.sort(
        key=lambda t: t['last_message']['created_at'] if t['last_message'] else '',
        reverse=True
    )
    return jsonify({'threads': threads})


# ── Staff: get + send messages for a specific customer thread ─────────────────

@support_bp.route('/threads/<int:customer_id>/messages', methods=['GET'])
@jwt_required()
def get_thread_messages(customer_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role not in ['admin', 'billing']:
        return jsonify({'error': 'Access denied'}), 403

    messages = SupportMessage.query.filter_by(customer_id=customer_id)\
        .order_by(SupportMessage.created_at.asc()).all()

    # Mark all customer-sent messages as read by staff
    for m in messages:
        if m.sender_role == 'customer' and not m.read_by_staff:
            m.read_by_staff = True
    db.session.commit()

    return jsonify({'messages': [m.to_dict() for m in messages]})


@support_bp.route('/threads/<int:customer_id>/messages', methods=['POST'])
@jwt_required()
def send_to_customer(customer_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role not in ['admin', 'billing']:
        return jsonify({'error': 'Access denied'}), 403

    customer = Customer.query.get(customer_id)
    if not customer:
        return jsonify({'error': 'Customer not found'}), 404

    data = request.get_json()
    content = (data or {}).get('content', '').strip()
    if not content:
        return jsonify({'error': 'Message content required'}), 400

    msg = SupportMessage(
        customer_id=customer_id,
        sender_id=user_id,
        sender_role=user.role,
        content=content,
        read_by_staff=True,
        read_by_customer=False,
    )
    db.session.add(msg)
    db.session.commit()
    return jsonify({'message': msg.to_dict()}), 201


# ── Customer: get + send their own messages ───────────────────────────────────

@support_bp.route('/messages', methods=['GET'])
@jwt_required()
def get_my_messages():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'customer':
        return jsonify({'error': 'Access denied'}), 403

    customer = user.customer
    if not customer:
        return jsonify({'messages': []})

    messages = SupportMessage.query.filter_by(customer_id=customer.id)\
        .order_by(SupportMessage.created_at.asc()).all()

    # Mark staff-sent messages as read by customer
    for m in messages:
        if m.sender_role in ['admin', 'billing'] and not m.read_by_customer:
            m.read_by_customer = True
    db.session.commit()

    return jsonify({'messages': [m.to_dict() for m in messages]})


@support_bp.route('/messages', methods=['POST'])
@jwt_required()
def send_from_customer():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role != 'customer':
        return jsonify({'error': 'Access denied'}), 403

    customer = user.customer
    if not customer:
        return jsonify({'error': 'Customer profile not found'}), 404

    data = request.get_json()
    content = (data or {}).get('content', '').strip()
    if not content:
        return jsonify({'error': 'Message content required'}), 400

    msg = SupportMessage(
        customer_id=customer.id,
        sender_id=user_id,
        sender_role='customer',
        content=content,
        read_by_staff=False,
        read_by_customer=True,
    )
    db.session.add(msg)
    db.session.commit()
    return jsonify({'message': msg.to_dict()}), 201


# ── Notifications ─────────────────────────────────────────────────────────────

@support_bp.route('/notifications', methods=['POST'])
@jwt_required()
def send_notification():
    """Staff sends a notification to all customers or a specific user."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role not in ['admin', 'billing']:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}
    title = data.get('title', '').strip()
    message = data.get('message', '').strip()
    target_user_id = data.get('user_id')  # None = all customers

    if not title or not message:
        return jsonify({'error': 'Title and message are required'}), 400

    if target_user_id:
        target = User.query.get(target_user_id)
        if not target:
            return jsonify({'error': 'Target user not found'}), 404
        notif = Notification(
            user_id=target_user_id,
            created_by=user_id,
            title=title,
            message=message,
        )
        db.session.add(notif)
        count = 1
    else:
        # Broadcast to all active, approved customers
        customers = User.query.filter_by(role='customer', is_active=True, is_approved=True).all()
        count = 0
        for c in customers:
            notif = Notification(
                user_id=c.id,
                created_by=user_id,
                title=title,
                message=message,
            )
            db.session.add(notif)
            count += 1

    db.session.commit()
    return jsonify({'sent_to': count}), 201


@support_bp.route('/notifications', methods=['GET'])
@jwt_required()
def get_notifications():
    """Get notifications for the current user."""
    user_id = int(get_jwt_identity())
    notifs = Notification.query.filter_by(user_id=user_id)\
        .order_by(Notification.created_at.desc()).all()
    return jsonify({'notifications': [n.to_dict() for n in notifs]})


@support_bp.route('/notifications/<int:notif_id>/read', methods=['PATCH'])
@jwt_required()
def mark_notification_read(notif_id):
    user_id = int(get_jwt_identity())
    notif = Notification.query.get(notif_id)
    if not notif or notif.user_id != user_id:
        return jsonify({'error': 'Not found'}), 404
    notif.is_read = True
    db.session.commit()
    return jsonify({'ok': True})


@support_bp.route('/notifications/<int:notif_id>', methods=['DELETE'])
@jwt_required()
def delete_notification(notif_id):
    user_id = int(get_jwt_identity())
    notif = Notification.query.get(notif_id)
    if not notif or notif.user_id != user_id:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(notif)
    db.session.commit()
    return jsonify({'ok': True})


@support_bp.route('/notifications/unread-count', methods=['GET'])
@jwt_required()
def unread_count():
    user_id = int(get_jwt_identity())
    count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    return jsonify({'count': count})


@support_bp.route('/sent-notifications', methods=['GET'])
@jwt_required()
def get_sent_notifications():
    """Staff: history of all notifications they have sent, grouped by send batch."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or user.role not in ['admin', 'billing']:
        return jsonify({'error': 'Access denied'}), 403

    notifs = Notification.query.filter_by(created_by=user_id)\
        .order_by(Notification.created_at.desc()).all()

    # Group rows that share the same title + message + minute (broadcast sends
    # one row per recipient; we surface them as a single sent item with a count).
    groups = {}
    for n in notifs:
        minute_key = n.created_at.replace(second=0, microsecond=0).isoformat() \
            if n.created_at else ''
        key = (n.title, n.message, minute_key)
        if key not in groups:
            groups[key] = {
                'title': n.title,
                'message': n.message,
                'created_at': n.created_at.isoformat() if n.created_at else None,
                'recipient_count': 0,
            }
        groups[key]['recipient_count'] += 1

    result = sorted(groups.values(), key=lambda x: x['created_at'] or '', reverse=True)
    return jsonify({'sent_notifications': result})

@support_bp.route('/messages/<int:message_id>', methods=['DELETE'])
@jwt_required()
def delete_message(message_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    msg = SupportMessage.query.get(message_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404

    # Sender can always delete their own message
    is_sender = msg.sender_id == user_id
    # Staff can delete any staff-sent message
    is_staff = user and user.role in ['admin', 'billing']
    is_staff_message = msg.sender_role in ['admin', 'billing']

    if not (is_sender or (is_staff and is_staff_message)):
        return jsonify({'error': 'Access denied'}), 403

    db.session.delete(msg)
    db.session.commit()
    return jsonify({'ok': True}), 200