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
        page = request.args.get('page', 1, type=int)
        per_page = 25

        query = (
            db.session.query(Bill, Customer, User)
            .join(Customer, Bill.customer_id == Customer.id)
            .join(User, Customer.user_id == User.id)
        )

        if search:
            query = query.filter(
                or_(
                    Customer.customer_name.ilike(f'%{search}%'),
                    User.email.ilike(f'%{search}%'),
                    Customer.location_id.ilike(f'%{search}%'),
                )
            )

        if status:
            query = query.filter(Bill.status == status)

        total = query.count()
        results = query.order_by(Bill.billing_period_end.desc()).offset((page - 1) * per_page).limit(per_page).all()

        bills = []
        for bill, customer, u in results:
            d = bill.to_dict()
            d['customer_name'] = customer.customer_name
            d['customer_email'] = u.email
            d['customer_type'] = customer.customer_type
            d['location_id'] = customer.location_id
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

        bill.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({'message': 'Bill updated', 'bill': bill.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
