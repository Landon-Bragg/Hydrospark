"""
Admin routes - User management, data import
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, AuditLog, Bill
from services.data_import_service import DataImportService
from datetime import datetime
import bcrypt

admin_bp = Blueprint('admin', __name__)
import_service = DataImportService()

@admin_bp.route('/users', methods=['GET'])
@jwt_required()
def get_users():
    """Get all users"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403
        
        users = User.query.all()
        return jsonify({
            'users': [u.to_dict() for u in users]
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/users/<int:user_id>/approve', methods=['POST'])
@jwt_required()
def approve_user(user_id):
    """Approve pending user"""
    try:
        current_user_id = int(get_jwt_identity())
        current_user = User.query.get(current_user_id)
        
        if not current_user or current_user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user.is_approved = True
        db.session.commit()
        
        return jsonify({
            'message': 'User approved',
            'user': user.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/users', methods=['POST'])
@jwt_required()
def create_user():
    """Create new user (admin only)"""
    try:
        current_user_id = int(get_jwt_identity())
        current_user = User.query.get(current_user_id)
        
        if not current_user or current_user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403
        
        data = request.get_json()
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already exists'}), 400
        
        password_hash = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        user = User(
            email=data['email'],
            password_hash=password_hash,
            role=data.get('role', 'customer'),
            first_name=data.get('first_name'),
            last_name=data.get('last_name'),
            phone=data.get('phone'),
            is_active=True,
            is_approved=True
        )
        db.session.add(user)
        db.session.flush()
        
        if data.get('role') == 'customer':
            customer = Customer(
                user_id=user.id,
                customer_name=data.get('customer_name', f"{data.get('first_name')} {data.get('last_name')}"),
                mailing_address=data.get('mailing_address'),
                location_id=data.get('location_id'),
                customer_type=data.get('customer_type', 'Residential')
            )
            db.session.add(customer)
        
        db.session.commit()
        
        return jsonify({
            'message': 'User created successfully',
            'user': user.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/charges', methods=['GET'])
@jwt_required()
def get_charges_by_user():
    """Get all bills grouped by customer/user"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        customers = Customer.query.all()
        result = []
        for customer in customers:
            bills = Bill.query.filter_by(customer_id=customer.id).order_by(Bill.billing_period_end.desc()).all()
            total_amount = sum(float(b.total_amount) for b in bills)
            status_counts = {}
            for b in bills:
                status_counts[b.status] = status_counts.get(b.status, 0) + 1

            email = customer.user.email if customer.user else None

            result.append({
                'customer_id': customer.id,
                'customer_name': customer.customer_name,
                'email': email,
                'customer_type': customer.customer_type,
                'location_id': customer.location_id,
                'bill_count': len(bills),
                'total_amount': round(total_amount, 2),
                'status_counts': status_counts,
                'bills': [b.to_dict() for b in bills],
            })

        result.sort(key=lambda c: c['customer_name'] or '')

        return jsonify({'customers': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/import/usage', methods=['POST'])
@jwt_required()
def import_usage_data():
    """Import usage data from CSV/XLSX"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        print(f"User ID: {user_id}")
        print(f"User: {user}")
        print(f"User role: {user.role if user else 'None'}")
        
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403
        
        print(f"Request files: {request.files}")
        print(f"Request form: {request.form}")
        print(f"Request content type: {request.content_type}")
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        print(f"Starting import of file: {file.filename}")
        result = import_service.import_usage_data(file)
        print(f"Import completed: {result}")
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Import error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@admin_bp.route('/generate-historical-bills', methods=['POST'])
@jwt_required()
def generate_historical_bills():
    """Generate historical bills for all customers (admin only)"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403
        
        from services.billing_service import BillingService
        billing_service = BillingService()
        
        print("Starting historical bill generation...")
        result = billing_service.generate_historical_bills()
        print(f"Bill generation completed: {result}")
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Historical bill generation error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500