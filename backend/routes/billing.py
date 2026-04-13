"""
Billing routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, Bill, WaterUsage, BillingRate
from datetime import datetime, timedelta
from sqlalchemy import func, or_

billing_bp = Blueprint('billing', __name__)

@billing_bp.route('/bills', methods=['GET'])
@jwt_required()
def get_bills():
    """Get bills for customer"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customer_id = user.customer.id
        else:
            customer_id = request.args.get('customer_id', type=int)
        
        query = Bill.query
        if customer_id:
            query = query.filter_by(customer_id=customer_id)
        
        today = datetime.now().date()
        bills = query.filter(Bill.billing_period_end <= today).order_by(Bill.billing_period_end.desc()).all()
        
        return jsonify({
            'bills': [b.to_dict() for b in bills]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@billing_bp.route('/bills/<int:bill_id>', methods=['GET'])
@jwt_required()
def get_bill(bill_id):
    """Get specific bill"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        bill = Bill.query.get(bill_id)
        if not bill:
            return jsonify({'error': 'Bill not found'}), 404
        
        # Check permissions
        if user.role == 'customer':
            if not user.customer or bill.customer_id != user.customer.id:
                return jsonify({'error': 'Access denied'}), 403
        
        return jsonify({'bill': bill.to_dict()}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@billing_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate_bill():
    """Generate bill for customer (admin/billing only)"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403
        
        data = request.get_json()
        customer_id = data.get('customer_id')
        start_date = datetime.fromisoformat(data.get('start_date'))
        end_date = datetime.fromisoformat(data.get('end_date'))
        
        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        
        # Calculate total usage
        total_usage = db.session.query(func.sum(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date.date(),
            WaterUsage.usage_date <= end_date.date()
        ).scalar() or 0
        
        # Get billing rate
        rate = BillingRate.query.filter_by(
            customer_type=customer.customer_type,
            is_active=True
        ).first()
        
        if not rate:
            return jsonify({'error': 'No billing rate configured'}), 400
        
        # Calculate total amount
        total_amount = float(total_usage) * float(rate.flat_rate)
        
        # Create bill
        bill = Bill(
            customer_id=customer_id,
            billing_period_start=start_date.date(),
            billing_period_end=end_date.date(),
            total_usage_ccf=total_usage,
            total_amount=total_amount,
            due_date=(end_date + timedelta(days=15)).date(),
            status='pending'
        )
        db.session.add(bill)
        db.session.commit()
        
        return jsonify({
            'message': 'Bill generated successfully',
            'bill': bill.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/admin/bills', methods=['GET'])
@jwt_required()
def admin_search_bills():
    """Admin: search and filter all bills across customers"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        search = request.args.get('search', '').strip()
        status = request.args.get('status', '')
        customer_id = request.args.get('customer_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 25, type=int)

        query = (
            db.session.query(Bill, Customer, User)
            .join(Customer, Bill.customer_id == Customer.id)
            .join(User, Customer.user_id == User.id)
        )

        date_from    = request.args.get('date_from', '').strip()
        date_to      = request.args.get('date_to', '').strip()
        customer_type = request.args.get('customer_type', '').strip()

        if customer_id:
            query = query.filter(Bill.customer_id == customer_id)
        elif search:
            query = query.filter(
                or_(
                    Customer.customer_name.ilike(f'%{search}%'),
                    User.email.ilike(f'%{search}%'),
                    Customer.location_id.ilike(f'%{search}%'),
                )
            )

        if status:
            query = query.filter(Bill.status == status)
        if customer_type:
            query = query.filter(Customer.customer_type == customer_type)
        if date_from:
            query = query.filter(Bill.billing_period_end >= date_from)
        if date_to:
            query = query.filter(Bill.billing_period_end <= date_to)

        total = query.count()
        results = query.order_by(Bill.billing_period_end.desc()).offset((page - 1) * per_page).limit(per_page).all()

        bills = []
        for bill, customer, u in results:
            d = bill.to_dict()
            d['customer_name'] = customer.customer_name
            d['customer_email'] = u.email
            d['customer_type'] = customer.customer_type
            d['location_id'] = customer.location_id
            d['water_status'] = customer.water_status or 'active'
            d['user_id'] = u.id
            bills.append(d)

        return jsonify({'bills': bills, 'total': total, 'page': page, 'per_page': per_page}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_billing_stats():
    """Billing/admin: aggregate summary stats"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Access denied'}), 403

        from sqlalchemy import func
        from datetime import date

        first_of_month = date.today().replace(day=1)

        outstanding = db.session.query(
            func.count(Bill.id), func.coalesce(func.sum(Bill.total_amount), 0)
        ).filter(Bill.status.in_(['pending', 'sent'])).one()

        overdue = db.session.query(
            func.count(Bill.id), func.coalesce(func.sum(Bill.total_amount), 0)
        ).filter(Bill.status == 'overdue').one()

        paid_month = db.session.query(
            func.count(Bill.id), func.coalesce(func.sum(Bill.total_amount), 0)
        ).filter(
            Bill.status == 'paid',
            Bill.paid_at >= first_of_month
        ).one()

        return jsonify({
            'outstanding': {'count': outstanding[0], 'total': float(outstanding[1])},
            'overdue': {'count': overdue[0], 'total': float(overdue[1])},
            'paid_this_month': {'count': paid_month[0], 'total': float(paid_month[1])},
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/bills/<int:bill_id>/pay', methods=['POST'])
@jwt_required()
def pay_bill(bill_id):
    """Customer: pay their own bill"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if user.role != 'customer':
            return jsonify({'error': 'Customers only'}), 403

        if not user.customer:
            return jsonify({'error': 'Customer profile not found'}), 404

        bill = Bill.query.get(bill_id)
        if not bill:
            return jsonify({'error': 'Bill not found'}), 404

        if bill.customer_id != user.customer.id:
            return jsonify({'error': 'Access denied'}), 403

        if bill.status == 'paid':
            return jsonify({'error': 'Bill is already paid'}), 400

        bill.status = 'paid'
        bill.paid_at = datetime.utcnow()
        bill.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({'message': 'Payment successful', 'bill': bill.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/bills/<int:bill_id>/refund', methods=['POST'])
@jwt_required()
def refund_bill(bill_id):
    """Billing/admin: refund a paid bill."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Access denied'}), 403

        bill = Bill.query.get(bill_id)
        if not bill:
            return jsonify({'error': 'Bill not found'}), 404

        if bill.status != 'paid':
            return jsonify({'error': 'Only paid bills can be refunded'}), 400

        bill.status = 'refunded'
        bill.refunded_at = datetime.utcnow()
        bill.updated_at = datetime.utcnow()

        # Notify the customer
        try:
            customer = Customer.query.get(bill.customer_id)
            if customer:
                from database import Notification
                cust_user = User.query.get(customer.user_id)
                if cust_user:
                    notif = Notification(
                        user_id=cust_user.id,
                        created_by=user_id,
                        title='Refund Processed',
                        message=(
                            f'A refund of ${float(bill.total_amount):.2f} has been issued '
                            f'for your bill covering {bill.billing_period_start} to '
                            f'{bill.billing_period_end}.'
                        ),
                    )
                    db.session.add(notif)
        except Exception:
            pass

        db.session.commit()
        return jsonify({'message': 'Bill refunded', 'bill': bill.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/bills/<int:bill_id>', methods=['PUT'])
@jwt_required()
def update_bill(bill_id):
    """Admin: adjust a bill's amount, status, or due date"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        bill = Bill.query.get(bill_id)
        if not bill:
            return jsonify({'error': 'Bill not found'}), 404

        if bill.status in ('paid', 'refunded'):
            return jsonify({'error': 'Paid and refunded bills cannot be edited'}), 400

        data = request.get_json()

        if 'total_amount' in data:
            bill.total_amount = float(data['total_amount'])
        if 'status' in data:
            bill.status = data['status']
            if data['status'] == 'paid' and not bill.paid_at:
                bill.paid_at = datetime.utcnow()
            elif data['status'] != 'paid':
                bill.paid_at = None
        if 'due_date' in data:
            bill.due_date = datetime.fromisoformat(data['due_date']).date()

        # Trigger autopay if billing staff just marked this bill as sent
        if data.get('status') == 'sent':
            customer = Customer.query.get(bill.customer_id)
            if customer and customer.autopay_enabled and customer.payment_method_last4:
                bill.status = 'paid'
                bill.paid_at = datetime.utcnow()
                # Notify the customer
                try:
                    from database import User
                    from database import Notification
                    cust_user = User.query.get(customer.user_id)
                    if cust_user:
                        notif = Notification(
                            user_id=cust_user.id,
                            created_by=user_id,
                            title='Autopay Processed',
                            message=(
                                f'Your autopay has processed a payment of '
                                f'${float(bill.total_amount):.2f} for the billing period '
                                f'{bill.billing_period_start} to {bill.billing_period_end} '
                                f'using your {customer.payment_method_type.capitalize()} '
                                f'ending in {customer.payment_method_last4}.'
                            ),
                        )
                        db.session.add(notif)
                except Exception:
                    pass

        bill.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({'message': 'Bill updated', 'bill': bill.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ── Payment method & autopay ───────────────────────────────────────────────────

@billing_bp.route('/payment-method', methods=['GET'])
@jwt_required()
def get_payment_method():
    """Customer: get saved payment method and autopay status."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role != 'customer' or not user.customer:
            return jsonify({'error': 'Customer only'}), 403
        c = user.customer
        return jsonify({
            'autopay_enabled': bool(c.autopay_enabled),
            'payment_method': {
                'type': c.payment_method_type,
                'last4': c.payment_method_last4,
                'name': c.payment_method_name,
                'expiry': c.payment_method_expiry,
            } if c.payment_method_last4 else None,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/payment-method', methods=['POST'])
@jwt_required()
def save_payment_method():
    """Customer: save or replace payment method (stores last4 only)."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role != 'customer' or not user.customer:
            return jsonify({'error': 'Customer only'}), 403

        data = request.get_json() or {}
        card_number = str(data.get('card_number', '')).replace(' ', '').replace('-', '')
        name = str(data.get('name', '')).strip()
        expiry = str(data.get('expiry', '')).strip()

        if len(card_number) < 13 or not card_number.isdigit():
            return jsonify({'error': 'Invalid card number'}), 400
        if not name:
            return jsonify({'error': 'Cardholder name required'}), 400
        if not expiry or len(expiry) < 4:
            return jsonify({'error': 'Expiry required (MM/YY)'}), 400

        first = card_number[0]
        if first == '4':
            card_type = 'visa'
        elif first == '5':
            card_type = 'mastercard'
        elif first == '3':
            card_type = 'amex'
        elif first == '6':
            card_type = 'discover'
        else:
            card_type = 'card'

        c = user.customer
        c.payment_method_type = card_type
        c.payment_method_last4 = card_number[-4:]
        c.payment_method_name = name
        c.payment_method_expiry = expiry
        db.session.commit()

        return jsonify({
            'message': 'Payment method saved',
            'payment_method': {
                'type': c.payment_method_type,
                'last4': c.payment_method_last4,
                'name': c.payment_method_name,
                'expiry': c.payment_method_expiry,
            },
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/payment-method', methods=['DELETE'])
@jwt_required()
def delete_payment_method():
    """Customer: remove payment method and disable autopay."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role != 'customer' or not user.customer:
            return jsonify({'error': 'Customer only'}), 403

        c = user.customer
        c.payment_method_type = None
        c.payment_method_last4 = None
        c.payment_method_name = None
        c.payment_method_expiry = None
        c.autopay_enabled = False
        db.session.commit()

        return jsonify({'message': 'Payment method removed'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/autopay', methods=['POST'])
@jwt_required()
def toggle_autopay():
    """Customer: enable or disable autopay."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role != 'customer' or not user.customer:
            return jsonify({'error': 'Customer only'}), 403

        c = user.customer
        enabled = request.get_json(silent=True).get('enabled', False)

        if enabled and not c.payment_method_last4:
            return jsonify({'error': 'Add a payment method before enabling autopay'}), 400

        c.autopay_enabled = bool(enabled)
        db.session.commit()

        return jsonify({'autopay_enabled': c.autopay_enabled}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
