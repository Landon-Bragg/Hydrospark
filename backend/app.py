"""
HydroSpark Measurement and Billing System - Main Application
"""

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_mail import Mail
from dotenv import load_dotenv
import os
import secrets
from database import init_db, db
from flask import request
# Load environment variables
load_dotenv()

# Generate JWT secret if not exists
if not os.getenv('JWT_SECRET_KEY'):
    secret_key = secrets.token_hex(32)
    with open('.env', 'a') as f:
        f.write(f'\nJWT_SECRET_KEY={secret_key}\n')
    os.environ['JWT_SECRET_KEY'] = secret_key

app = Flask(__name__)
app.url_map.strict_slashes = False

# Configuration
app.config['SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', secrets.token_hex(32))
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', secrets.token_hex(32))
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 86400  # 24 hours
app.config['JWT_CSRF_CHECK_FORM'] = False 
app.config['JWT_COOKIE_CSRF_PROTECT'] = False  
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'mysql+pymysql://root:password@mysql:3306/hydrospark')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

# Email configuration
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('GMAIL_USER', 'conbenlan@gmail.com')
app.config['MAIL_PASSWORD'] = os.getenv('GMAIL_APP_PASSWORD', '')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('GMAIL_USER', 'conbenlan@gmail.com')

# Initialize extensions
CORS(app, resources={r"/api/*": {
    "origins": [
        "http://localhost:3000",
        "https://exciting-abundance-production.up.railway.app"
    ],
    "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})
jwt = JWTManager(app)
mail = Mail(app)


@jwt.invalid_token_loader
def invalid_token_callback(error):
    print(f"Invalid token error: {error}")
    return jsonify({'error': 'Invalid token', 'details': str(error)}), 422

@jwt.unauthorized_loader
def unauthorized_callback(error):
    print(f"Unauthorized error: {error}")
    return jsonify({'error': 'Missing authorization', 'details': str(error)}), 422

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    print(f"Expired token")
    return jsonify({'error': 'Token has expired'}), 422

@app.before_request
def log_request_info():
    print(f"Request: {request.method} {request.path}")
    print(f"Headers: {dict(request.headers)}")
    if request.method == 'POST':
        print(f"Content-Type: {request.content_type}")

# Initialize database
init_db(app)

# Create any missing tables (safe on existing data)
with app.app_context():
    db.create_all()

# Migrate existing DBs — add new columns if they don't exist yet
def run_migrations():
    from sqlalchemy import text

    # (table_name, column_name, column_definition)
    migrations = [
        ("customers",      "autopay_enabled",         "BOOLEAN DEFAULT FALSE"),
        ("customers",      "payment_method_type",     "VARCHAR(20) NULL"),
        ("customers",      "payment_method_last4",    "VARCHAR(4) NULL"),
        ("customers",      "payment_method_name",     "VARCHAR(100) NULL"),
        ("customers",      "payment_method_expiry",   "VARCHAR(5) NULL"),
        ("users",          "invite_token",            "VARCHAR(100) NULL"),
        ("anomaly_alerts", "action_taken",            "VARCHAR(50) NULL"),
        ("anomaly_alerts", "dispatched_at",           "DATETIME NULL"),
        ("anomaly_alerts", "notes",                   "TEXT NULL"),
        ("anomaly_alerts", "bill_adjustment_amount",  "DECIMAL(10,2) NULL"),
        ("bills",          "refunded_at",             "DATETIME NULL"),
        ("anomaly_alerts", "resolved_at",             "DATETIME NULL"),
        ("anomaly_alerts", "completion_notes",        "TEXT NULL"),
        ("anomaly_alerts", "checked_out_by",          "INT NULL"),
        ("anomaly_alerts", "checked_out_at",          "DATETIME NULL"),
    ]
    try:
        with db.engine.connect() as conn:
            for table_name, col_name, col_def in migrations:
                exists = conn.execute(text(
                    "SELECT COUNT(*) FROM information_schema.columns "
                    "WHERE table_schema = DATABASE() "
                    "AND table_name = :tbl "
                    "AND column_name = :col"
                ), {"tbl": table_name, "col": col_name}).scalar()
                if not exists:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))

            # Expand users.role enum to include 'field'
            conn.execute(text(
                "ALTER TABLE users MODIFY COLUMN role "
                "ENUM('admin','billing','customer','field') DEFAULT 'customer'"
            ))
            conn.commit()
        print("Migrations complete.")
    except Exception as e:
        print(f"Migration failed: {e}")

with app.app_context():
    run_migrations()

# Seed default users if they don't exist
def seed_default_users():
    from database import User
    import bcrypt
    if not User.query.filter_by(email='billing@hydrospark.com').first():
        pw_hash = bcrypt.hashpw(b'billing123', bcrypt.gensalt(12)).decode()
        billing_user = User(
            email='billing@hydrospark.com',
            password_hash=pw_hash,
            role='billing',
            first_name='Billing',
            last_name='Support',
            is_active=True,
            is_approved=True,
        )
        db.session.add(billing_user)
        db.session.commit()
        print('Created default billing user: billing@hydrospark.com / billing123')

    if not User.query.filter_by(email='field@hydrospark.com').first():
        pw_hash = bcrypt.hashpw(b'field123', bcrypt.gensalt(12)).decode()
        field_user = User(
            email='field@hydrospark.com',
            password_hash=pw_hash,
            role='field',
            first_name='Field',
            last_name='Technician',
            is_active=True,
            is_approved=True,
        )
        db.session.add(field_user)
        db.session.commit()
        print('Created default field user: field@hydrospark.com / field123')

with app.app_context():
    seed_default_users()


def seed_bills_and_alerts():
    """
    Seed realistic billing history and anomaly alerts on a fresh DB.

    Bills  — skipped if any bills already exist.
      • Up to 20 customers with usage data get 6 months of billing history.
      • Months 1-4: paid (paid_at set a few days after due date).
      • Month 5:    ~75 % pending, ~25 % overdue (due date already past).
      • Month 6:    pending (current cycle, not yet due).

    Alerts — skipped if any anomaly alerts already exist.
      • Runs IsolationForest detection over last 365 days for every customer
        that has at least 14 days of usage data.
    """
    from database import Bill, Customer, WaterUsage, AnomalyAlert
    from services.billing_service import BillingService
    from services.ml_service import MLService
    from datetime import date, timedelta, datetime
    import calendar

    # ── Bills ────────────────────────────────────────────────────────────────
    # Goal: realistic distribution — most bills paid, ~15–20 % pending/overdue.
    # If the auto-importer already created bills (all paid), we promote the most
    # recent bill per customer (up to 20 customers) to pending or overdue so the
    # dashboard has meaningful outstanding balances to show.
    try:
        unpaid_count = Bill.query.filter(
            Bill.status.in_(['pending', 'overdue', 'sent'])
        ).count()

        if unpaid_count > 5:
            print(f'[seed_bills] {unpaid_count} unpaid bill(s) already exist — skipping.')
        elif Bill.query.count() == 0:
            # No bills at all — create full history for up to 20 customers
            svc = BillingService()
            customers = (
                db.session.query(Customer)
                .join(WaterUsage, WaterUsage.customer_id == Customer.id)
                .distinct()
                .limit(20)
                .all()
            )
            if not customers:
                print('[seed_bills] No customers with usage data — skipping.')
            else:
                bill_count = 0
                for idx, customer in enumerate(customers):
                    months = (
                        db.session.query(WaterUsage.year, WaterUsage.month)
                        .filter(WaterUsage.customer_id == customer.id)
                        .distinct()
                        .order_by(WaterUsage.year.desc(), WaterUsage.month.desc())
                        .limit(6)
                        .all()
                    )
                    if not months:
                        continue
                    months = list(reversed(months))
                    total = len(months)
                    for i, (yr, mo) in enumerate(months):
                        start = date(yr, mo, 1)
                        last_day = calendar.monthrange(yr, mo)[1]
                        end = date(yr, mo, last_day)
                        due = end + timedelta(days=21)
                        if Bill.query.filter_by(customer_id=customer.id, billing_period_start=start).first():
                            continue
                        calc = svc.calculate_bill(customer.id, start, end)
                        if not calc or calc['total_usage_ccf'] == 0:
                            continue
                        months_from_end = total - 1 - i
                        if months_from_end >= 2:
                            status = 'paid'
                            paid_at = datetime.combine(due + timedelta(days=3), datetime.min.time())
                        elif months_from_end == 1:
                            if idx % 4 == 0:
                                status = 'overdue'
                                due = end + timedelta(days=5)
                            else:
                                status = 'pending'
                            paid_at = None
                        else:
                            status = 'pending'
                            paid_at = None
                        db.session.add(Bill(
                            customer_id=customer.id,
                            billing_period_start=start,
                            billing_period_end=end,
                            total_usage_ccf=calc['total_usage_ccf'],
                            total_amount=calc['total_amount'],
                            due_date=due,
                            status=status,
                            paid_at=paid_at,
                        ))
                        bill_count += 1
                db.session.commit()
                print(f'[seed_bills] Created {bill_count} bill(s) across {len(customers)} customer(s).')
        else:
            # Bills exist but are all paid — promote the most-recent bill for
            # up to 20 customers to pending/overdue so there's outstanding data.
            from sqlalchemy import func
            customers_with_bills = (
                db.session.query(Customer)
                .join(Bill, Bill.customer_id == Customer.id)
                .filter(Bill.status == 'paid')
                .distinct()
                .limit(20)
                .all()
            )
            promoted = 0
            for idx, customer in enumerate(customers_with_bills):
                latest_bill = (
                    Bill.query
                    .filter_by(customer_id=customer.id, status='paid')
                    .order_by(Bill.billing_period_start.desc())
                    .first()
                )
                if not latest_bill:
                    continue
                if idx % 4 == 0:
                    latest_bill.status = 'overdue'
                    latest_bill.due_date = latest_bill.billing_period_end + timedelta(days=5)
                else:
                    latest_bill.status = 'pending'
                    latest_bill.due_date = latest_bill.billing_period_end + timedelta(days=21)
                latest_bill.paid_at = None
                promoted += 1
            db.session.commit()
            print(f'[seed_bills] Promoted {promoted} bill(s) to pending/overdue for realistic distribution.')
    except Exception as e:
        db.session.rollback()
        print(f'[seed_bills] Error seeding bills: {e}')

    # ── Alerts ───────────────────────────────────────────────────────────────
    try:
        if AnomalyAlert.query.count() > 0:
            print('[seed_alerts] Anomaly alerts already exist — skipping alert seeding.')
        else:
            ml = MLService()

            all_customers = (
                db.session.query(Customer)
                .join(WaterUsage, WaterUsage.customer_id == Customer.id)
                .distinct()
                .all()
            )

            alert_count = 0
            for customer in all_customers:
                found = ml.detect_anomalies(customer.id, lookback_days=365)
                alert_count += len(found)

            print(f'[seed_alerts] Generated {alert_count} anomaly alert(s) across {len(all_customers)} customer(s).')
    except Exception as e:
        db.session.rollback()
        print(f'[seed_alerts] Error seeding alerts: {e}')


with app.app_context():
    seed_bills_and_alerts()

# Remove alert types that should no longer exist (low-usage anomalies)
def purge_low_usage_alerts():
    from database import AnomalyAlert
    try:
        deleted = AnomalyAlert.query.filter(
            db.or_(
                AnomalyAlert.alert_type.in_(['unusual_pattern', 'leak']),
                AnomalyAlert.deviation_percentage < 60,
                # Small CCF spikes (<1 CCF) require 100% deviation
                db.and_(
                    (AnomalyAlert.usage_ccf - AnomalyAlert.expected_usage_ccf) < 1.0,
                    AnomalyAlert.deviation_percentage <= 100,
                ),
            )
        ).delete(synchronize_session=False)
        db.session.commit()
        if deleted:
            print(f'[purge_alerts] Removed {deleted} sub-threshold alerts')
    except Exception as e:
        db.session.rollback()
        print(f'[purge_alerts] Error: {e}')

with app.app_context():
    purge_low_usage_alerts()


# Import and register blueprints
from routes.auth import auth_bp
from routes.customers import customers_bp
from routes.usage import usage_bp
from routes.billing import billing_bp
from routes.forecasts import forecasts_bp
from routes.alerts import alerts_bp
from routes.admin import admin_bp
from routes.weather import weather_bp
from routes.chat import chat_bp
from routes.support import support_bp

app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(customers_bp, url_prefix='/api/customers')
app.register_blueprint(usage_bp, url_prefix='/api/usage')
app.register_blueprint(billing_bp, url_prefix='/api/billing')
app.register_blueprint(forecasts_bp, url_prefix='/api/forecasts')
app.register_blueprint(alerts_bp, url_prefix='/api/alerts')
app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(weather_bp, url_prefix='/api/weather')
app.register_blueprint(chat_bp, url_prefix='/api/chat')
app.register_blueprint(support_bp, url_prefix='/api/support')

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'HydroSpark API',
        'version': '1.0.0'
    })

@app.route('/api/', methods=['GET'])
def index():
    """API root endpoint"""
    return jsonify({
        'message': 'HydroSpark Measurement and Billing API',
        'version': '1.0.0',
        'endpoints': {
            'auth': '/api/auth',
            'customers': '/api/customers',
            'usage': '/api/usage',
            'billing': '/api/billing',
            'forecasts': '/api/forecasts',
            'alerts': '/api/alerts',
            'admin': '/api/admin'
        }
    })

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    from seed import run_auto_seed
    run_auto_seed(app)
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)