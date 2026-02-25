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
from database import init_db
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
    "origins": ["http://localhost:3000"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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



# Import and register blueprints
from routes.auth import auth_bp
from routes.customers import customers_bp
from routes.usage import usage_bp
from routes.billing import billing_bp
from routes.forecasts import forecasts_bp
from routes.alerts import alerts_bp
from routes.admin import admin_bp

app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(customers_bp, url_prefix='/api/customers')
app.register_blueprint(usage_bp, url_prefix='/api/usage')
app.register_blueprint(billing_bp, url_prefix='/api/billing')
app.register_blueprint(forecasts_bp, url_prefix='/api/forecasts')
app.register_blueprint(alerts_bp, url_prefix='/api/alerts')
app.register_blueprint(admin_bp, url_prefix='/api/admin')

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
    app.run(host='0.0.0.0', port=5000, debug=True)
