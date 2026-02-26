"""
Usage forecasting routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, UsageForecast
from services.ml_service import MLService
from datetime import datetime

forecasts_bp = Blueprint('forecasts', __name__)
ml_service = MLService()

@forecasts_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate_forecast():
    """Generate usage forecast for customer"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        data = request.get_json() or {}
        
        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customer_id = user.customer.id
        else:
            customer_id = data.get('customer_id')
            if not customer_id:
                return jsonify({'error': 'customer_id required'}), 400
        
        months = data.get('months', 12)
        
        print(f"Generating forecast for customer {customer_id}, months: {months}")
        
        # Generate forecast
        forecasts = ml_service.generate_forecast(customer_id, months)
        
        print(f"Forecast result: {forecasts}")
        
        if isinstance(forecasts, dict) and 'error' in forecasts:
            return jsonify(forecasts), 400
        
        return jsonify({
            'forecasts': forecasts,
            'customer_id': customer_id,
            'months': months,
            'message': f'Generated {len(forecasts) if isinstance(forecasts, list) else 0} forecasts'
        }), 200
        
    except Exception as e:
        print(f"Forecast generation error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@forecasts_bp.route('/generate-system', methods=['POST'])
@jwt_required()
def generate_system_forecast():
    """Generate system-wide forecast aggregating all customers (admin/billing only)"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        data = request.get_json() or {}
        months = data.get('months', 12)

        result = ml_service.generate_system_forecast(months)

        if isinstance(result, dict) and 'error' in result:
            return jsonify(result), 400

        return jsonify({
            'forecasts': result,
            'system_wide': True,
            'months': months,
            'message': f'Generated {len(result)} system-wide forecast data points'
        }), 200

    except Exception as e:
        print(f"System forecast error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@forecasts_bp.route('/', methods=['GET'])
@jwt_required()
def get_forecasts():
    """Get existing forecasts"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customer_id = user.customer.id
        else:
            customer_id = request.args.get('customer_id', type=int)
        
        query = UsageForecast.query
        if customer_id:
            query = query.filter_by(customer_id=customer_id)
        
        forecasts = query.order_by(UsageForecast.forecast_date).all()
        
        return jsonify({
            'forecasts': [f.to_dict() for f in forecasts]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
