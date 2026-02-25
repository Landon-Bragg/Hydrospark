"""
Water usage data routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, WaterUsage
from datetime import datetime, timedelta
from sqlalchemy import func

usage_bp = Blueprint('usage', __name__)

@usage_bp.route('/', methods=['GET'])
@jwt_required()
def get_usage():
    """Get water usage data with filters"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        # Get query parameters
        customer_id = request.args.get('customer_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = WaterUsage.query

        # Apply customer filter based on role
        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            query = query.filter_by(customer_id=user.customer.id)
        elif customer_id:
            query = query.filter_by(customer_id=customer_id)

        # Apply date filters
        if start_date:
            query = query.filter(WaterUsage.usage_date >= datetime.fromisoformat(start_date))
        if end_date:
            query = query.filter(WaterUsage.usage_date <= datetime.fromisoformat(end_date))

        # Order by date
        usage_data = query.order_by(WaterUsage.usage_date.desc()).limit(1000).all()

        if user.role in ['admin', 'billing']:
            def record_with_customer(u):
                d = u.to_dict()
                if u.customer:
                    d['customer_name'] = u.customer.customer_name
                    d['customer_email'] = u.customer.user.email if u.customer.user else None
                return d
            return jsonify({'usage': [record_with_customer(u) for u in usage_data], 'count': len(usage_data)}), 200

        return jsonify({
            'usage': [u.to_dict() for u in usage_data],
            'count': len(usage_data)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@usage_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_usage_summary():
    """Get usage summary statistics"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customer_id = user.customer.id
        else:
            customer_id = request.args.get('customer_id', type=int)
            if not customer_id:
                return jsonify({'error': 'customer_id required'}), 400

        # Get date range (default: last 30 days)
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=30)

        if request.args.get('start_date'):
            start_date = datetime.fromisoformat(request.args.get('start_date')).date()
        if request.args.get('end_date'):
            end_date = datetime.fromisoformat(request.args.get('end_date')).date()

        total_usage = db.session.query(func.sum(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).scalar() or 0

        avg_daily = db.session.query(func.avg(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).scalar() or 0

        max_daily = db.session.query(func.max(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).scalar() or 0

        # Include rate and estimated cost for customers
        rate_per_ccf = None
        estimated_cost = None
        customer_obj = Customer.query.get(customer_id)
        if customer_obj:
            from services.billing_service import BillingService
            bs = BillingService()
            rate_per_ccf = bs._resolve_rate(customer_obj)
            estimated_cost = float(total_usage) * rate_per_ccf

        return jsonify({
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_usage_ccf': float(total_usage),
                'average_daily_ccf': float(avg_daily),
                'max_daily_ccf': float(max_daily),
                'days_count': (end_date - start_date).days + 1,
                'rate_per_ccf': rate_per_ccf,
                'estimated_cost': estimated_cost
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@usage_bp.route('/top-customers', methods=['GET'])
@jwt_required()
def get_top_customers():
    """Get top customers by usage for a period (admin only)"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = request.args.get('limit', 15, type=int)

        query = db.session.query(
            WaterUsage.customer_id,
            func.sum(WaterUsage.daily_usage_ccf).label('total_usage'),
            func.count(WaterUsage.id).label('record_count')
        )

        if start_date:
            query = query.filter(WaterUsage.usage_date >= start_date)
        if end_date:
            query = query.filter(WaterUsage.usage_date <= end_date)

        results = query.group_by(WaterUsage.customer_id).order_by(
            func.sum(WaterUsage.daily_usage_ccf).desc()
        ).limit(limit).all()

        output = []
        for row in results:
            customer = Customer.query.get(row.customer_id)
            output.append({
                'customer_id': row.customer_id,
                'customer_name': customer.customer_name if customer else f'Customer {row.customer_id}',
                'customer_email': customer.user.email if customer and customer.user else None,
                'customer_type': customer.customer_type if customer else None,
                'total_usage_ccf': float(row.total_usage),
                'record_count': int(row.record_count)
            })

        return jsonify({'top_customers': output}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
