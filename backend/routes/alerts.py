"""
Anomaly detection and alerts routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, AnomalyAlert
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

        alerts = query.order_by(AnomalyAlert.alert_date.desc()).all()

        def alert_dict(alert):
            d = alert.to_dict()
            if alert.customer:
                d['customer_name'] = alert.customer.customer_name
                d['customer_email'] = alert.customer.user.email if alert.customer.user else None
            else:
                d['customer_name'] = None
                d['customer_email'] = None
            return d

        return jsonify({
            'alerts': [alert_dict(a) for a in alerts]
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
