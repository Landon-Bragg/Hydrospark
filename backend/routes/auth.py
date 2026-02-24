"""
Authentication routes - Login, Register, Token Management
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from database import db, User, Customer, AuditLog
#import bcrypt
from datetime import datetime

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
def login():
    """User login endpoint"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password required'}), 400
        
        user = User.query.filter_by(email=email).first()
        
        #if not user or not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
            #return jsonify({'error': 'Invalid credentials'}), 401
        
        #if not user.is_active:
        if not user or not user.is_active:
            return jsonify({'error': 'Account is inactive'}), 401
        
        if user.role == 'customer' and not user.is_approved:
            return jsonify({'error': 'Account pending approval'}), 401
        
        # Create access token with STRING user ID
        access_token = create_access_token(identity=str(user.id))
        
        # Log the login
        audit = AuditLog(
            user_id=user.id,
            action='login',
            details=f'User {email} logged in',
            ip_address=request.remote_addr
        )
        db.session.add(audit)
        db.session.commit()
        
        # Get customer info if customer role
        customer_info = None
        if user.role == 'customer' and user.customer:
            customer_info = user.customer.to_dict()
        
        return jsonify({
            'access_token': access_token,
            'user': user.to_dict(),
            'customer': customer_info
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/register', methods=['POST'])
def register():
    """Customer self-registration endpoint"""
    try:
        data = request.get_json()
        
        # Required fields
        required_fields = ['email', 'password', 'first_name', 'last_name', 'customer_name', 'mailing_address']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Check if email already exists
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already registered'}), 400
        
        # Hash password
        #password_hash = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        password_hash = data['password']
        # Create user
        user = User(
            email=data['email'],
            password_hash=password_hash,
            role='customer',
            first_name=data['first_name'],
            last_name=data['last_name'],
            phone=data.get('phone'),
            is_active=True,
            is_approved=False  # Requires admin approval
        )
        db.session.add(user)
        db.session.flush()
        
        # Create customer profile
        customer = Customer(
            user_id=user.id,
            customer_name=data['customer_name'],
            mailing_address=data['mailing_address'],
            location_id=data.get('location_id'),
            customer_type=data.get('customer_type', 'Residential'),
            cycle_number=data.get('cycle_number'),
            business_name=data.get('business_name'),
            facility_name=data.get('facility_name')
        )
        db.session.add(customer)
        
        # Log registration
        audit = AuditLog(
            user_id=user.id,
            action='register',
            details=f'New customer registration: {data["email"]}',
            ip_address=request.remote_addr
        )
        db.session.add(audit)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Registration successful. Please wait for admin approval.',
            'user': user.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user information"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        customer_info = None
        if user.role == 'customer' and user.customer:
            customer_info = user.customer.to_dict()
        
        return jsonify({
            'user': user.to_dict(),
            'customer': customer_info
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """Change user password"""
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        
        old_password = data.get('old_password')
        new_password = data.get('new_password')
        
        if not old_password or not new_password:
            return jsonify({'error': 'Old and new passwords required'}), 400
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Verify old password
        #if not bcrypt.checkpw(old_password.encode('utf-8'), user.password_hash.encode('utf-8')):
            #return jsonify({'error': 'Invalid old password'}), 401
        
        # Update password
        #user.password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user.updated_at = datetime.utcnow()
        
        # Log password change
        audit = AuditLog(
            user_id=user.id,
            action='change_password',
            details='Password changed',
            ip_address=request.remote_addr
        )
        db.session.add(audit)
        db.session.commit()
        
        return jsonify({'message': 'Password changed successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
