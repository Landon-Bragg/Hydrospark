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
    """Get anomaly alerts"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customer_id = user.customer.id
        else:
            customer_id = request.args.get('customer_id', type=int)
        
        query = AnomalyAlert.query
        if customer_id:
            query = query.filter_by(customer_id=customer_id)

        status = request.args.get('status')
        if status:
            query = query.filter_by(status=status)

        limit = request.args.get('limit', type=int)
        alerts = query.order_by(AnomalyAlert.alert_date.desc())
        if limit:
            alerts = alerts.limit(limit)
        alerts = alerts.all()

        return jsonify({
            'alerts': [_alert_dict(a) for a in alerts]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@alerts_bp.route('/<int:alert_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge_alert(alert_id):
    """Acknowledge an alert"""
    try:
        alert = AnomalyAlert.query.get(alert_id)
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404
        
        alert.status = 'acknowledged'
        db.session.commit()
        
        return jsonify({
            'message': 'Alert acknowledged',
            'alert': alert.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def _alert_dict(alert):
    """Serialize alert with customer info."""
    d = alert.to_dict()
    if alert.customer:
        d['customer_name'] = alert.customer.customer_name
        d['customer_email'] = alert.customer.user.email if alert.customer.user else None
    else:
        d['customer_name'] = None
        d['customer_email'] = None
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

        alert = AnomalyAlert.query.get(alert_id)
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404

        if alert.status == 'resolved':
            return jsonify({'error': 'Alert is already resolved'}), 400

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

        alert = AnomalyAlert.query.get(alert_id)
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404

        if alert.status == 'resolved':
            return jsonify({'error': 'Alert is already resolved'}), 400

        data = request.get_json() or {}
        try:
            amount = float(data.get('amount', 0))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid adjustment amount'}), 400

        if amount <= 0:
            return jsonify({'error': 'Adjustment amount must be greater than zero'}), 400

        note = (data.get('note') or '').strip()

        # Find the bill covering alert_date
        bill = Bill.query.filter(
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
            return jsonify({'error': 'Cannot adjust a refunded bill'}), 400

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
