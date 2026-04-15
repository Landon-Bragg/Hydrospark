"""
Anomaly detection and alerts routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, AnomalyAlert, Bill, Notification, AuditLog
from services.ml_service import MLService
from datetime import datetime

alerts_bp = Blueprint('alerts', __name__)
ml_service = MLService()

@alerts_bp.route('/', methods=['GET'])
@jwt_required()
def get_alerts():
    """Get anomaly alerts with server-side pagination and filtering."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customer_id = user.customer.id
        else:
            customer_id = request.args.get('customer_id', type=int)

        # Pagination
        page     = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 25, type=int)

        # Filters
        status     = request.args.get('status', '').strip()
        alert_type = request.args.get('alert_type', '').strip()
        risk_level = request.args.get('risk_level', '').strip()  # high / medium / low
        date_from  = request.args.get('date_from', '').strip()
        date_to    = request.args.get('date_to', '').strip()
        search     = request.args.get('search', '').strip()      # customer name
        sort       = request.args.get('sort', 'date_desc')

        query = AnomalyAlert.query.filter(AnomalyAlert.alert_type == 'spike')
        if customer_id:
            query = query.filter(AnomalyAlert.customer_id == customer_id)
        if status:
            query = query.filter(AnomalyAlert.status == status)
        if alert_type:
            query = query.filter(AnomalyAlert.alert_type == alert_type)
        if risk_level == 'high':
            query = query.filter(
                (AnomalyAlert.usage_ccf - AnomalyAlert.expected_usage_ccf) > 5.0
            )
        elif risk_level == 'medium':
            query = query.filter(
                (AnomalyAlert.usage_ccf - AnomalyAlert.expected_usage_ccf) >= 1.0,
                (AnomalyAlert.usage_ccf - AnomalyAlert.expected_usage_ccf) <= 5.0
            )
        elif risk_level == 'low':
            query = query.filter(
                (AnomalyAlert.usage_ccf - AnomalyAlert.expected_usage_ccf) < 1.0
            )
        if date_from:
            query = query.filter(AnomalyAlert.alert_date >= date_from)
        if date_to:
            query = query.filter(AnomalyAlert.alert_date <= date_to)
        if search:
            query = (query
                .join(Customer, AnomalyAlert.customer_id == Customer.id)
                .filter(Customer.customer_name.ilike(f'%{search}%'))
            )

        # Sort
        if sort == 'date_asc':
            query = query.order_by(AnomalyAlert.alert_date.asc())
        elif sort == 'risk_desc':
            query = query.order_by(AnomalyAlert.risk_score.desc())
        elif sort == 'risk_asc':
            query = query.order_by(AnomalyAlert.risk_score.asc())
        else:
            query = query.order_by(AnomalyAlert.alert_date.desc())

        total  = query.count()
        alerts = query.offset((page - 1) * per_page).limit(per_page).all()

        # Summary counts — spikes only, scoped to customer (or global), ignoring current filters
        base_q = AnomalyAlert.query.filter(AnomalyAlert.alert_type == 'spike')
        if customer_id:
            base_q = base_q.filter(AnomalyAlert.customer_id == customer_id)
        counts = {
            'new':          base_q.filter(AnomalyAlert.status == 'new').count(),
            'acknowledged': base_q.filter(AnomalyAlert.status == 'acknowledged').count(),
            'resolved':     base_q.filter(AnomalyAlert.status == 'resolved').count(),
        }

        return jsonify({
            'alerts':   [_alert_dict(a) for a in alerts],
            'total':    total,
            'page':     page,
            'per_page': per_page,
            'counts':   counts,
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@alerts_bp.route('/<int:alert_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge_alert(alert_id):
    """Acknowledge an alert"""
    try:
        alert = db.session.query(AnomalyAlert).with_for_update().get(alert_id)
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404

        if alert.status != 'new':
            return jsonify({'error': f'Alert is already {alert.status}'}), 409

        alert.status = 'acknowledged'
        db.session.commit()

        return jsonify({
            'message': 'Alert acknowledged',
            'alert': alert.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@alerts_bp.route('/work-orders', methods=['GET'])
@jwt_required()
def get_work_orders():
    """Return dispatched alerts as work orders (open + recently completed)."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing', 'field']:
            return jsonify({'error': 'Access denied'}), 403

        status_filter = request.args.get('status', 'open')  # open | completed | all

        query = (AnomalyAlert.query
                 .filter(AnomalyAlert.action_taken == 'dispatch')
                 .order_by(AnomalyAlert.dispatched_at.desc()))

        if status_filter == 'open':
            query = query.filter(AnomalyAlert.status == 'acknowledged')
        elif status_filter == 'completed':
            query = query.filter(AnomalyAlert.status == 'resolved')

        work_orders = query.all()
        return jsonify({'work_orders': [_alert_dict(a) for a in work_orders]}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@alerts_bp.route('/<int:alert_id>/complete', methods=['POST'])
@jwt_required()
def complete_work_order(alert_id):
    """Field tech marks a dispatched work order as completed."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing', 'field']:
            return jsonify({'error': 'Access denied'}), 403

        alert = db.session.query(AnomalyAlert).with_for_update().get(alert_id)
        if not alert:
            return jsonify({'error': 'Work order not found'}), 404
        if alert.status == 'resolved':
            return jsonify({'error': 'Work order already completed'}), 409
        if alert.action_taken != 'dispatch':
            return jsonify({'error': 'This alert was not dispatched as a work order'}), 400

        data = request.get_json() or {}
        completion_notes = (data.get('completion_notes') or '').strip()

        alert.status = 'resolved'
        alert.resolved_at = datetime.utcnow()
        alert.completion_notes = completion_notes or None

        # Notify billing/admin team
        admin_users = User.query.filter(User.role.in_(['admin', 'billing'])).all()
        customer = alert.customer
        cust_name = customer.customer_name if customer else 'Unknown'
        for admin in admin_users:
            notif = Notification(
                user_id=admin.id,
                created_by=user_id,
                title='Work Order Completed',
                message=(
                    f'Field technician completed work order for {cust_name} '
                    f'(alert {alert_id}, {alert.alert_date}).'
                    + (f' Notes: {completion_notes}' if completion_notes else '')
                ),
            )
            db.session.add(notif)

        db.session.add(AuditLog(
            user_id=user_id,
            action='complete_work_order',
            entity_type='anomaly_alert',
            entity_id=alert_id,
            details=completion_notes or 'No notes provided',
        ))
        db.session.commit()

        return jsonify({'message': 'Work order completed', 'alert': _alert_dict(alert)}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@alerts_bp.route('/<int:alert_id>/resolve', methods=['POST'])
@jwt_required()
def resolve_alert(alert_id):
    """Mark an alert as resolved."""
    try:
        user_id = int(get_jwt_identity())
        alert = db.session.query(AnomalyAlert).with_for_update().get(alert_id)
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404

        if alert.status == 'resolved':
            return jsonify({'error': 'Alert is already resolved'}), 409

        alert.status = 'resolved'
        alert.resolved_at = datetime.utcnow()

        db.session.add(AuditLog(
            user_id=user_id,
            action='resolve_alert',
            entity_type='anomaly_alert',
            entity_id=alert_id,
            details='Manually resolved',
        ))
        db.session.commit()

        return jsonify({'message': 'Alert resolved', 'alert': _alert_dict(alert)}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def _alert_dict(alert):
    """Serialize alert with customer info."""
    d = alert.to_dict()
    d['resolved_at'] = alert.resolved_at.isoformat() if alert.resolved_at else None
    if alert.customer:
        d['customer_name']  = alert.customer.customer_name
        d['customer_email'] = alert.customer.user.email if alert.customer.user else None
        d['location_id']    = alert.customer.location_id
        d['customer_type']  = alert.customer.customer_type
        d['zip_code']       = alert.customer.zip_code
    else:
        d['customer_name']  = None
        d['customer_email'] = None
        d['location_id']    = None
        d['customer_type']  = None
        d['zip_code']       = None
    return d


@alerts_bp.route('/<int:alert_id>/dispatch', methods=['POST'])
@jwt_required()
def dispatch_alert(alert_id):
    """Admin: dispatch a service/investigation request for an alert."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        # Lock the row so two concurrent admins can't both dispatch the same alert
        alert = db.session.query(AnomalyAlert).with_for_update().get(alert_id)
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404

        if alert.status == 'resolved':
            return jsonify({'error': 'Alert is already resolved'}), 409

        if alert.action_taken == 'dispatch':
            return jsonify({'error': 'Investigation already dispatched by another admin'}), 409

        data = request.get_json() or {}
        notes = (data.get('notes') or '').strip()

        alert.status = 'acknowledged'
        alert.action_taken = 'dispatch'
        alert.dispatched_at = datetime.utcnow()
        alert.notes = notes or None

        # Notify the customer
        customer = alert.customer
        if customer and customer.user_id:
            alert_date_str = alert.alert_date.strftime('%B %d, %Y') if alert.alert_date else 'recently'
            cust_user = User.query.get(customer.user_id)
            if cust_user:
                notif = Notification(
                    user_id=cust_user.id,
                    created_by=user_id,
                    title='Service Investigation Dispatched',
                    message=(
                        f'Our team has been dispatched to investigate unusual water usage '
                        f'detected on {alert_date_str}. '
                        f'Usage was {float(alert.usage_ccf):.2f} CCF against an expected '
                        f'{float(alert.expected_usage_ccf):.2f} CCF. '
                        f'We will follow up with you shortly.'
                        + (f' Notes: {notes}' if notes else '')
                    ),
                )
                db.session.add(notif)

        db.session.add(AuditLog(
            user_id=user_id,
            action='dispatch_alert',
            entity_type='anomaly_alert',
            entity_id=alert_id,
            details=notes or 'No notes provided',
        ))
        db.session.commit()

        return jsonify({'message': 'Investigation dispatched', 'alert': _alert_dict(alert)}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@alerts_bp.route('/<int:alert_id>/adjust-bill', methods=['POST'])
@jwt_required()
def adjust_bill_for_alert(alert_id):
    """Admin: apply a credit/adjustment to the bill covering this alert's date."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        # Lock the alert row first — prevents two admins from both applying a credit
        alert = db.session.query(AnomalyAlert).with_for_update().get(alert_id)
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404

        if alert.status == 'resolved':
            return jsonify({'error': 'Alert already resolved by another admin'}), 409

        if alert.bill_adjustment_amount is not None:
            return jsonify({
                'error': f'A credit of ${float(alert.bill_adjustment_amount):.2f} was already applied to this alert'
            }), 409

        data = request.get_json() or {}
        try:
            amount = float(data.get('amount', 0))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid adjustment amount'}), 400

        if amount <= 0:
            return jsonify({'error': 'Adjustment amount must be greater than zero'}), 400

        note = (data.get('note') or '').strip()

        # Find the bill covering alert_date, lock it too
        bill = Bill.query.with_for_update().filter(
            Bill.customer_id == alert.customer_id,
            Bill.billing_period_start <= alert.alert_date,
            Bill.billing_period_end >= alert.alert_date,
        ).order_by(Bill.billing_period_end.desc()).first()

        if not bill:
            return jsonify({
                'error': 'No bill found covering this alert date. '
                         'Generate a bill for this period first.'
            }), 404

        if bill.status == 'refunded':
            return jsonify({'error': 'Cannot adjust a refunded bill'}), 409

        original_amount = float(bill.total_amount)
        new_amount = max(0.0, round(original_amount - amount, 2))
        bill.total_amount = new_amount
        bill.updated_at = datetime.utcnow()

        alert.status = 'resolved'
        alert.action_taken = 'bill_adjustment'
        alert.resolved_at = datetime.utcnow()
        alert.bill_adjustment_amount = amount
        alert.notes = note or None

        # Notify the customer
        customer = alert.customer
        if customer and customer.user_id:
            alert_date_str = alert.alert_date.strftime('%B %d, %Y') if alert.alert_date else 'recently'
            cust_user = User.query.get(customer.user_id)
            if cust_user:
                period_str = f'{bill.billing_period_start} to {bill.billing_period_end}'
                notif = Notification(
                    user_id=cust_user.id,
                    created_by=user_id,
                    title='Bill Credit Applied',
                    message=(
                        f'A credit of ${amount:.2f} has been applied to your bill for '
                        f'{period_str} due to unusual usage detected on {alert_date_str}. '
                        f'Your adjusted bill total is ${new_amount:.2f}.'
                        + (f' Note: {note}' if note else '')
                    ),
                )
                db.session.add(notif)

        db.session.add(AuditLog(
            user_id=user_id,
            action='bill_adjustment',
            entity_type='anomaly_alert',
            entity_id=alert_id,
            details=f'Credit ${amount:.2f} applied to bill #{bill.id}. {note}',
        ))
        db.session.commit()

        return jsonify({
            'message': f'Credit of ${amount:.2f} applied to bill #{bill.id}',
            'alert': _alert_dict(alert),
            'bill': bill.to_dict(),
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@alerts_bp.route('/detect', methods=['POST'])
@jwt_required()
def detect_anomalies():
    """Run anomaly detection (admin only)"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403
        
        data = request.get_json()
        customer_id = data.get('customer_id')
        
        if customer_id:
            results = ml_service.detect_anomalies(customer_id)
        else:
            # Run for all customers
            customers = Customer.query.all()
            results = []
            for customer in customers:
                customer_results = ml_service.detect_anomalies(customer.id)
                results.extend(customer_results)
        
        return jsonify({
            'message': f'Detected {len(results)} anomalies',
            'anomalies': results
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
