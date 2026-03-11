"""
Admin routes - User management, data import
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, AuditLog, Bill, ZipCodeRate, WaterUsage
from services.data_import_service import DataImportService
from datetime import datetime, timedelta
from sqlalchemy import func, case
import bcrypt
import secrets

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
    """Invite a new user (admin only). Creates account and returns an invite token."""
    try:
        current_user_id = int(get_jwt_identity())
        current_user = User.query.get(current_user_id)

        if not current_user or current_user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        data = request.get_json()

        if not data.get('email'):
            return jsonify({'error': 'Email is required'}), 400

        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already exists'}), 400

        invite_token = secrets.token_urlsafe(32)

        user = User(
            email=data['email'],
            password_hash='',  # set by user when they accept the invite
            role=data.get('role', 'customer'),
            first_name=data.get('first_name'),
            last_name=data.get('last_name'),
            phone=data.get('phone'),
            is_active=False,
            is_approved=False,
            invite_token=invite_token,
        )
        db.session.add(user)
        db.session.flush()

        if data.get('role', 'customer') == 'customer':
            customer = Customer(
                user_id=user.id,
                customer_name=data.get('customer_name') or f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or data['email'],
                mailing_address=data.get('mailing_address', ''),
                location_id=data.get('location_id'),
                customer_type=data.get('customer_type', 'Residential'),
            )
            db.session.add(customer)

        db.session.commit()

        return jsonify({
            'message': 'Invite created successfully',
            'invite_token': invite_token,
            'user': user.to_dict(),
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

        # Single query: aggregate bill stats per customer with user email via JOIN
        agg = (
            db.session.query(
                Customer.id,
                Customer.customer_name,
                Customer.customer_type,
                Customer.location_id,
                Customer.zip_code,
                Customer.custom_rate_per_ccf,
                User.email,
                func.count(Bill.id).label('bill_count'),
                func.coalesce(func.sum(Bill.total_amount), 0).label('total_amount'),
                func.sum(case((Bill.status == 'paid', 1), else_=0)).label('paid'),
                func.sum(case((Bill.status == 'pending', 1), else_=0)).label('pending'),
                func.sum(case((Bill.status == 'overdue', 1), else_=0)).label('overdue'),
                func.sum(case((Bill.status == 'sent', 1), else_=0)).label('sent'),
            )
            .outerjoin(Bill, Bill.customer_id == Customer.id)
            .outerjoin(User, User.id == Customer.user_id)
            .group_by(Customer.id, User.email)
            .order_by(Customer.customer_name)
            .all()
        )

        result = []
        for row in agg:
            status_counts = {}
            for s in ('paid', 'pending', 'overdue', 'sent'):
                v = int(getattr(row, s) or 0)
                if v:
                    status_counts[s] = v
            result.append({
                'customer_id': row.id,
                'customer_name': row.customer_name,
                'email': row.email,
                'customer_type': row.customer_type,
                'location_id': row.location_id,
                'zip_code': row.zip_code,
                'custom_rate_per_ccf': float(row.custom_rate_per_ccf) if row.custom_rate_per_ccf else None,
                'bill_count': int(row.bill_count),
                'total_amount': round(float(row.total_amount), 2),
                'status_counts': status_counts,
            })

        return jsonify({'customers': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/delinquent', methods=['GET'])
@jwt_required()
def get_delinquent_customers():
    """Customers with unpaid bills older than 90 days."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        cutoff = datetime.utcnow().date() - timedelta(days=90)

        # Customers with at least one unpaid bill past the 90-day cutoff
        rows = (
            db.session.query(
                Customer.id,
                Customer.customer_name,
                Customer.customer_type,
                Customer.location_id,
                Customer.zip_code,
                Customer.water_status,
                Customer.shutoff_notice_at,
                Customer.shutoff_at,
                User.email,
                func.count(Bill.id).label('unpaid_count'),
                func.sum(Bill.total_amount).label('unpaid_total'),
                func.min(Bill.due_date).label('oldest_due'),
            )
            .join(Bill, Bill.customer_id == Customer.id)
            .outerjoin(User, User.id == Customer.user_id)
            .filter(
                Bill.status.in_(['overdue', 'pending', 'sent']),
                Bill.due_date < cutoff,
            )
            .group_by(Customer.id, User.email)
            .order_by(func.min(Bill.due_date))
            .all()
        )

        result = [
            {
                'customer_id': r.id,
                'customer_name': r.customer_name,
                'customer_type': r.customer_type,
                'location_id': r.location_id,
                'zip_code': r.zip_code,
                'email': r.email,
                'water_status': r.water_status or 'active',
                'shutoff_notice_at': r.shutoff_notice_at.isoformat() if r.shutoff_notice_at else None,
                'shutoff_at': r.shutoff_at.isoformat() if r.shutoff_at else None,
                'unpaid_count': int(r.unpaid_count),
                'unpaid_total': round(float(r.unpaid_total), 2),
                'oldest_due': r.oldest_due.isoformat() if r.oldest_due else None,
            }
            for r in rows
        ]

        return jsonify({'delinquent': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/customers/<int:customer_id>/shutoff', methods=['POST'])
@jwt_required()
def shutoff_water(customer_id):
    """Mark a customer's water as shut off and send notification."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404

        now = datetime.utcnow()
        action = request.get_json(silent=True) or {}
        mode = action.get('mode', 'shutoff')  # 'notice' or 'shutoff'

        if mode == 'notice':
            customer.water_status = 'pending_shutoff'
            customer.shutoff_notice_at = now
        else:
            customer.water_status = 'shutoff'
            customer.shutoff_at = now
            if not customer.shutoff_notice_at:
                customer.shutoff_notice_at = now

        db.session.add(AuditLog(
            user_id=user_id,
            action='water_shutoff' if mode == 'shutoff' else 'shutoff_notice',
            entity_type='customer',
            entity_id=customer_id,
            details=f'Water {"shut off" if mode == "shutoff" else "shutoff notice sent"} for customer {customer.customer_name}',
            ip_address=request.remote_addr,
        ))
        db.session.commit()

        return jsonify({
            'message': f'Water {"shut off" if mode == "shutoff" else "shutoff notice sent"} successfully.',
            'customer': customer.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/customers/<int:customer_id>/restore', methods=['POST'])
@jwt_required()
def restore_water(customer_id):
    """Restore water service for a customer."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404

        customer.water_status = 'active'
        customer.shutoff_at = None
        customer.shutoff_notice_at = None

        db.session.add(AuditLog(
            user_id=user_id,
            action='water_restored',
            entity_type='customer',
            entity_id=customer_id,
            details=f'Water service restored for customer {customer.customer_name}',
            ip_address=request.remote_addr,
        ))
        db.session.commit()

        return jsonify({'message': 'Water service restored.', 'customer': customer.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/customers/<int:customer_id>/rate', methods=['PUT'])
@jwt_required()
def set_customer_rate(customer_id):
    """Set or clear a per-customer CCF rate override"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404

        data = request.get_json()
        rate = data.get('custom_rate_per_ccf')
        zip_code = data.get('zip_code')

        if rate is not None:
            customer.custom_rate_per_ccf = float(rate) if rate != '' else None
        if zip_code is not None:
            customer.zip_code = zip_code.strip() if zip_code else None

        db.session.commit()
        return jsonify({'message': 'Customer rate updated', 'customer': customer.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/zip-rates', methods=['GET'])
@jwt_required()
def get_zip_rates():
    """Get all zip code rates"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        rates = ZipCodeRate.query.order_by(ZipCodeRate.zip_code).all()
        return jsonify({'zip_rates': [r.to_dict() for r in rates]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/zip-rates', methods=['POST'])
@jwt_required()
def create_zip_rate():
    """Create a zip code rate"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        data = request.get_json()
        if ZipCodeRate.query.filter_by(zip_code=data['zip_code']).first():
            return jsonify({'error': 'Rate for this zip code already exists'}), 400

        rate = ZipCodeRate(
            zip_code=data['zip_code'].strip(),
            rate_per_ccf=float(data['rate_per_ccf']),
            description=data.get('description', ''),
            is_active=True
        )
        db.session.add(rate)
        db.session.commit()
        return jsonify({'message': 'Zip code rate created', 'zip_rate': rate.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/zip-rates/<int:rate_id>', methods=['PUT'])
@jwt_required()
def update_zip_rate(rate_id):
    """Update a zip code rate"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        rate = ZipCodeRate.query.get(rate_id)
        if not rate:
            return jsonify({'error': 'Zip code rate not found'}), 404

        data = request.get_json()
        if 'rate_per_ccf' in data:
            rate.rate_per_ccf = float(data['rate_per_ccf'])
        if 'description' in data:
            rate.description = data['description']
        if 'is_active' in data:
            rate.is_active = bool(data['is_active'])

        db.session.commit()
        return jsonify({'message': 'Zip code rate updated', 'zip_rate': rate.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/zip-rates/<int:rate_id>', methods=['DELETE'])
@jwt_required()
def delete_zip_rate(rate_id):
    """Delete a zip code rate"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        rate = ZipCodeRate.query.get(rate_id)
        if not rate:
            return jsonify({'error': 'Zip code rate not found'}), 404

        db.session.delete(rate)
        db.session.commit()
        return jsonify({'message': 'Zip code rate deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/zip-analytics', methods=['GET'])
@jwt_required()
def get_zip_analytics():
    """
    Return billing and usage stats grouped by zip code and customer type (admin only).
    Used for the admin zip code analytics dashboard.
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        rows = (
            db.session.query(
                Customer.zip_code,
                Customer.customer_type,
                func.count(func.distinct(Customer.id)).label('customer_count'),
                func.avg(Bill.total_amount).label('avg_monthly_bill'),
                func.avg(Bill.total_usage_ccf).label('avg_monthly_usage_ccf'),
                func.sum(Bill.total_amount).label('total_revenue'),
            )
            .join(Bill, Bill.customer_id == Customer.id)
            .filter(Customer.zip_code.isnot(None))
            .group_by(Customer.zip_code, Customer.customer_type)
            .order_by(Customer.zip_code, Customer.customer_type)
            .all()
        )

        # Group by zip code so the response is [{zip_code, types: [...]}, ...]
        zip_map = {}
        for r in rows:
            zc = r.zip_code
            if zc not in zip_map:
                zip_map[zc] = {'zip_code': zc, 'types': []}
            zip_map[zc]['types'].append({
                'customer_type': r.customer_type,
                'customer_count': int(r.customer_count),
                'avg_monthly_bill': round(float(r.avg_monthly_bill), 2),
                'avg_monthly_usage_ccf': round(float(r.avg_monthly_usage_ccf), 2),
                'total_revenue': round(float(r.total_revenue), 2),
            })

        return jsonify({'zip_analytics': list(zip_map.values())}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/detect', methods=['POST'])
@jwt_required()
def detect_anomalies():
    """Run anomaly detection for all customers (admin only)"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        from services.ml_service import MLService
        ml_service = MLService()

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
        print(f"Anomaly detection error: {str(e)}")
        import traceback
        traceback.print_exc()
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


@admin_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_stats():
    """Return high-level system stats for the admin dashboard."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        record_count = db.session.query(func.count(WaterUsage.id)).scalar() or 0
        customer_count = db.session.query(func.count(Customer.id)).scalar() or 0
        unique_name_count = db.session.query(func.count(func.distinct(Customer.customer_name))).scalar() or 0
        min_year = db.session.query(func.min(WaterUsage.year)).scalar()
        max_year = db.session.query(func.max(WaterUsage.year)).scalar()

        return jsonify({
            'record_count': record_count,
            'customer_count': customer_count,
            'unique_customer_names': unique_name_count,
            'min_year': min_year,
            'max_year': max_year,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500