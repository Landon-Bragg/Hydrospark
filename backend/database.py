"""
Database configuration and models
"""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from datetime import datetime
import os

db = SQLAlchemy()

def init_db(app):
    """Initialize database with app"""
    db.init_app(app)
    return db

def get_db_session():
    """Get database session"""
    engine = create_engine(os.getenv('DATABASE_URL', 'mysql+pymysql://root:password@mysql:3306/hydrospark'))
    Session = scoped_session(sessionmaker(bind=engine))
    return Session()

# User Model
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum('admin', 'billing', 'customer'), default='customer')
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    phone = db.Column(db.String(20))
    is_active = db.Column(db.Boolean, default=True)
    is_approved = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    customer = db.relationship('Customer', backref='user', uselist=False, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'role': self.role,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'phone': self.phone,
            'is_active': self.is_active,
            'is_approved': self.is_approved,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# Customer Model
class Customer(db.Model):
    __tablename__ = 'customers'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True)
    customer_name = db.Column(db.String(255), nullable=False)
    mailing_address = db.Column(db.Text)
    zip_code = db.Column(db.String(10))
    location_id = db.Column(db.String(50), unique=True)
    customer_type = db.Column(db.Enum('Residential', 'Commercial', 'Industrial'), default='Residential')
    cycle_number = db.Column(db.Integer)
    business_name = db.Column(db.String(255))
    facility_name = db.Column(db.String(255))
    custom_rate_per_ccf = db.Column(db.Numeric(10, 4), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    water_usage = db.relationship('WaterUsage', backref='customer', cascade='all, delete-orphan')
    bills = db.relationship('Bill', backref='customer', cascade='all, delete-orphan')
    alerts = db.relationship('AnomalyAlert', backref='customer', cascade='all, delete-orphan')
    forecasts = db.relationship('UsageForecast', backref='customer', cascade='all, delete-orphan')
    meter_readings = db.relationship('MeterReading', backref='customer', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'customer_name': self.customer_name,
            'mailing_address': self.mailing_address,
            'zip_code': self.zip_code,
            'location_id': self.location_id,
            'customer_type': self.customer_type,
            'cycle_number': self.cycle_number,
            'business_name': self.business_name,
            'facility_name': self.facility_name,
            'custom_rate_per_ccf': float(self.custom_rate_per_ccf) if self.custom_rate_per_ccf else None
        }

# Water Usage Model
class WaterUsage(db.Model):
    __tablename__ = 'water_usage'
    
    id = db.Column(db.BigInteger, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    location_id = db.Column(db.String(50), nullable=False)
    usage_date = db.Column(db.Date, nullable=False)
    daily_usage_ccf = db.Column(db.Numeric(10, 2), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)
    day = db.Column(db.Integer, nullable=False)
    is_estimated = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'customer_id': self.customer_id,
            'location_id': self.location_id,
            'usage_date': self.usage_date.isoformat() if self.usage_date else None,
            'daily_usage_ccf': float(self.daily_usage_ccf),
            'year': self.year,
            'month': self.month,
            'day': self.day,
            'is_estimated': self.is_estimated
        }

# Bill Model
class Bill(db.Model):
    __tablename__ = 'bills'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    billing_period_start = db.Column(db.Date, nullable=False)
    billing_period_end = db.Column(db.Date, nullable=False)
    total_usage_ccf = db.Column(db.Numeric(10, 2), nullable=False)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.Enum('pending', 'sent', 'paid', 'overdue'), default='pending')
    is_estimated = db.Column(db.Boolean, default=False)
    sent_at = db.Column(db.DateTime)
    paid_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'customer_id': self.customer_id,
            'billing_period_start': self.billing_period_start.isoformat() if self.billing_period_start else None,
            'billing_period_end': self.billing_period_end.isoformat() if self.billing_period_end else None,
            'total_usage_ccf': float(self.total_usage_ccf),
            'total_amount': float(self.total_amount),
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'status': self.status,
            'is_estimated': self.is_estimated,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None
        }

# Anomaly Alert Model
class AnomalyAlert(db.Model):
    __tablename__ = 'anomaly_alerts'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    alert_date = db.Column(db.Date, nullable=False)
    usage_ccf = db.Column(db.Numeric(10, 2), nullable=False)
    expected_usage_ccf = db.Column(db.Numeric(10, 2), nullable=False)
    deviation_percentage = db.Column(db.Numeric(5, 2), nullable=False)
    risk_score = db.Column(db.Numeric(5, 2), nullable=False)
    alert_type = db.Column(db.Enum('spike', 'leak', 'unusual_pattern'), default='spike')
    status = db.Column(db.Enum('new', 'acknowledged', 'resolved'), default='new')
    notification_sent = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'customer_id': self.customer_id,
            'alert_date': self.alert_date.isoformat() if self.alert_date else None,
            'usage_ccf': float(self.usage_ccf),
            'expected_usage_ccf': float(self.expected_usage_ccf),
            'deviation_percentage': float(self.deviation_percentage),
            'risk_score': float(self.risk_score),
            'alert_type': self.alert_type,
            'status': self.status,
            'notification_sent': self.notification_sent,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# Usage Forecast Model
class UsageForecast(db.Model):
    __tablename__ = 'usage_forecasts'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    forecast_date = db.Column(db.Date, nullable=False)
    predicted_usage_ccf = db.Column(db.Numeric(10, 2), nullable=False)
    predicted_amount = db.Column(db.Numeric(10, 2), nullable=False)
    confidence_lower = db.Column(db.Numeric(10, 2))
    confidence_upper = db.Column(db.Numeric(10, 2))
    model_version = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'customer_id': self.customer_id,
            'forecast_date': self.forecast_date.isoformat() if self.forecast_date else None,
            'predicted_usage_ccf': float(self.predicted_usage_ccf),
            'predicted_amount': float(self.predicted_amount),
            'confidence_lower': float(self.confidence_lower) if self.confidence_lower else None,
            'confidence_upper': float(self.confidence_upper) if self.confidence_upper else None,
            'model_version': self.model_version
        }

# Meter Reading Model
class MeterReading(db.Model):
    __tablename__ = 'meter_readings'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    image_path = db.Column(db.String(255), nullable=False)
    reading_value = db.Column(db.Numeric(10, 2))
    reading_date = db.Column(db.DateTime, default=datetime.utcnow)
    ocr_confidence = db.Column(db.Numeric(5, 2))
    is_verified = db.Column(db.Boolean, default=False)
    verified_value = db.Column(db.Numeric(10, 2))
    verified_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    verified_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'customer_id': self.customer_id,
            'image_path': self.image_path,
            'reading_value': float(self.reading_value) if self.reading_value else None,
            'reading_date': self.reading_date.isoformat() if self.reading_date else None,
            'ocr_confidence': float(self.ocr_confidence) if self.ocr_confidence else None,
            'is_verified': self.is_verified,
            'verified_value': float(self.verified_value) if self.verified_value else None
        }

# Billing Rate Model
class BillingRate(db.Model):
    __tablename__ = 'billing_rates'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_type = db.Column(db.Enum('Residential', 'Commercial', 'Industrial'), nullable=False)
    rate_type = db.Column(db.Enum('flat', 'tiered'), default='flat')
    flat_rate = db.Column(db.Numeric(10, 4))
    tier_min = db.Column(db.Numeric(10, 2))
    tier_max = db.Column(db.Numeric(10, 2))
    tier_rate = db.Column(db.Numeric(10, 4))
    effective_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'customer_type': self.customer_type,
            'rate_type': self.rate_type,
            'flat_rate': float(self.flat_rate) if self.flat_rate else None,
            'tier_min': float(self.tier_min) if self.tier_min else None,
            'tier_max': float(self.tier_max) if self.tier_max else None,
            'tier_rate': float(self.tier_rate) if self.tier_rate else None,
            'effective_date': self.effective_date.isoformat() if self.effective_date else None,
            'is_active': self.is_active
        }

# Zip Code Rate Model
class ZipCodeRate(db.Model):
    __tablename__ = 'zip_code_rates'

    id = db.Column(db.Integer, primary_key=True)
    zip_code = db.Column(db.String(10), unique=True, nullable=False)
    rate_per_ccf = db.Column(db.Numeric(10, 4), nullable=False)
    description = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'zip_code': self.zip_code,
            'rate_per_ccf': float(self.rate_per_ccf),
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# Audit Log Model
class AuditLog(db.Model):
    __tablename__ = 'audit_log'
    
    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    action = db.Column(db.String(100), nullable=False)
    entity_type = db.Column(db.String(50))
    entity_id = db.Column(db.Integer)
    details = db.Column(db.Text)
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'details': self.details,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
