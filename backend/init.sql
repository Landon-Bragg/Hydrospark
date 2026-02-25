-- HydroSpark Database Schema
CREATE DATABASE IF NOT EXISTS hydrospark;
USE hydrospark;

-- Users table with role-based access control
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'billing', 'customer') NOT NULL DEFAULT 'customer',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customers table (extended user information)
CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    customer_name VARCHAR(255) NOT NULL,
    mailing_address TEXT,
    zip_code VARCHAR(10),
    location_id VARCHAR(50) UNIQUE,
    customer_type ENUM('Residential', 'Commercial', 'Industrial') DEFAULT 'Residential',
    cycle_number INT,
    business_name VARCHAR(255),
    facility_name VARCHAR(255),
    custom_rate_per_ccf DECIMAL(10, 4) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_location_id (location_id),
    INDEX idx_customer_type (customer_type),
    INDEX idx_zip_code (zip_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Zip code based billing rates
CREATE TABLE IF NOT EXISTS zip_code_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    zip_code VARCHAR(10) NOT NULL UNIQUE,
    rate_per_ccf DECIMAL(10, 4) NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_zip_code (zip_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Water usage data
CREATE TABLE IF NOT EXISTS water_usage (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    location_id VARCHAR(50) NOT NULL,
    usage_date DATE NOT NULL,
    daily_usage_ccf DECIMAL(10, 2) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    is_estimated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_usage (customer_id, usage_date),
    INDEX idx_customer_date (customer_id, usage_date),
    INDEX idx_location_date (location_id, usage_date),
    INDEX idx_year_month (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Billing rates configuration
CREATE TABLE IF NOT EXISTS billing_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_type ENUM('Residential', 'Commercial', 'Industrial') NOT NULL,
    rate_type ENUM('flat', 'tiered') DEFAULT 'flat',
    flat_rate DECIMAL(10, 4),
    tier_min DECIMAL(10, 2),
    tier_max DECIMAL(10, 2),
    tier_rate DECIMAL(10, 4),
    effective_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_type (customer_type),
    INDEX idx_effective_date (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bills table
CREATE TABLE IF NOT EXISTS bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    total_usage_ccf DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    due_date DATE NOT NULL,
    status ENUM('pending', 'sent', 'paid', 'overdue') DEFAULT 'pending',
    is_estimated BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP NULL,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_customer_status (customer_id, status),
    INDEX idx_billing_period (billing_period_start, billing_period_end),
    INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Anomaly alerts
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    alert_date DATE NOT NULL,
    usage_ccf DECIMAL(10, 2) NOT NULL,
    expected_usage_ccf DECIMAL(10, 2) NOT NULL,
    deviation_percentage DECIMAL(5, 2) NOT NULL,
    risk_score DECIMAL(5, 2) NOT NULL,
    alert_type ENUM('spike', 'leak', 'unusual_pattern') DEFAULT 'spike',
    status ENUM('new', 'acknowledged', 'resolved') DEFAULT 'new',
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_customer_status (customer_id, status),
    INDEX idx_alert_date (alert_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usage predictions/forecasts
CREATE TABLE IF NOT EXISTS usage_forecasts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_usage_ccf DECIMAL(10, 2) NOT NULL,
    predicted_amount DECIMAL(10, 2) NOT NULL,
    confidence_lower DECIMAL(10, 2),
    confidence_upper DECIMAL(10, 2),
    model_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_customer_forecast (customer_id, forecast_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Meter readings from photos
CREATE TABLE IF NOT EXISTS meter_readings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    reading_value DECIMAL(10, 2),
    reading_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ocr_confidence DECIMAL(5, 2),
    is_verified BOOLEAN DEFAULT FALSE,
    verified_value DECIMAL(10, 2),
    verified_by INT,
    verified_at TIMESTAMP NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_customer_date (customer_id, reading_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit log for important actions
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_action (user_id, action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password_hash, role, first_name, last_name, is_active, is_approved)
VALUES ('admin@hydrospark.com', '$2b$12$K5iz3cTJHQFYQqP7VuGVMeZLmH7K7j8Z8f5VqB6LxR6IvJ8F1vD.e', 'admin', 'Admin', 'User', TRUE, TRUE);

-- Insert default billing rates
INSERT INTO billing_rates (customer_type, rate_type, flat_rate, effective_date, is_active)
VALUES 
    ('Residential', 'flat', 5.72, '2018-01-01', TRUE),
    ('Commercial', 'flat', 3.00, '2018-01-01', TRUE),
    ('Industrial', 'flat', 3.50, '2018-01-01', TRUE);
