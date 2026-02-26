"""
Billing routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, Bill, WaterUsage, BillingRate
from datetime import datetime, timedelta
from sqlalchemy import func

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
