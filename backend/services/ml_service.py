"""
Machine Learning Service - Forecasting and Anomaly Detection
"""

import pandas as pd
import numpy as np
from database import db, WaterUsage, UsageForecast, AnomalyAlert, Customer, BillingRate
from datetime import datetime, timedelta
from prophet import Prophet
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
import os

class MLService:
    def __init__(self):
        self.model_dir = 'ml_models'
        os.makedirs(self.model_dir, exist_ok=True)
    
    def get_usage_data(self, customer_id, days=365):
        """Get historical usage data for customer"""
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        usage = WaterUsage.query.filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).order_by(WaterUsage.usage_date).all()
        
        if not usage:
            return pd.DataFrame()
        
        df = pd.DataFrame([{
            'ds': u.usage_date,
            'y': float(u.daily_usage_ccf)
        } for u in usage])
        
        return df
    
    def generate_forecast(self, customer_id, months=12):
        """Generate usage forecast using simple time series"""
        try:
            # Get historical data
            df = self.get_usage_data(customer_id, days=730)  # 2 years of data
            
            if df.empty or len(df) < 30:
                return {'error': 'Insufficient historical data (need at least 30 days)'}
            
            print(f"Loaded {len(df)} days of historical data for customer {customer_id}")
            
            # Simple moving average forecast
            from datetime import timedelta
            
            # Calculate average usage for last 30, 90, and 365 days
            recent_30 = df.tail(30)['y'].mean()
            recent_90 = df.tail(90)['y'].mean() if len(df) >= 90 else recent_30
            recent_365 = df['y'].mean()
            
            # Weighted average: more weight on recent data
            predicted_daily = (recent_30 * 0.5 + recent_90 * 0.3 + recent_365 * 0.2)
            
            # Get customer and billing rate
            customer = Customer.query.get(customer_id)
            rate = BillingRate.query.filter_by(
                customer_type=customer.customer_type,
                is_active=True
            ).first()
            
            billing_rate = float(rate.flat_rate) if rate else 5.72
            
            # Generate forecasts for next N months
            forecasts = []
            last_date = df['ds'].max()
            
            # Delete old forecasts for this customer
            UsageForecast.query.filter_by(customer_id=customer_id).delete()
            
            for day in range(1, months * 30 + 1):
                forecast_date = last_date + timedelta(days=day)
                
                # Add some seasonal variation (simple sine wave)
                import math
                seasonal_factor = 1 + 0.1 * math.sin(2 * math.pi * day / 365)
                predicted_usage = predicted_daily * seasonal_factor
                
                # Add some randomness for confidence intervals
                confidence_range = predicted_usage * 0.2
                
                forecast_record = UsageForecast(
                    customer_id=customer_id,
                    forecast_date=forecast_date,
                    predicted_usage_ccf=predicted_usage,
                    predicted_amount=predicted_usage * billing_rate,
                    confidence_lower=max(0, predicted_usage - confidence_range),
                    confidence_upper=predicted_usage + confidence_range,
                    model_version='simple_moving_average_v1'
                )
                db.session.add(forecast_record)
                forecasts.append(forecast_record.to_dict())
            
            db.session.commit()
            
            print(f"Generated {len(forecasts)} forecasts for customer {customer_id}")
            
            return forecasts
            
        except Exception as e:
            db.session.rollback()
            print(f"Forecast error: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    def detect_anomalies(self, customer_id, lookback_days=90):
        """Detect anomalies using Isolation Forest"""
        try:
            # Get recent usage data
            df = self.get_usage_data(customer_id, days=lookback_days)
            
            if df.empty or len(df) < 14:
                return []
            
            # Prepare features
            X = df['y'].values.reshape(-1, 1)
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            
            # Train Isolation Forest
            clf = IsolationForest(contamination=0.1, random_state=42)
            predictions = clf.fit_predict(X_scaled)
            
            # Calculate statistics
            mean_usage = df['y'].mean()
            std_usage = df['y'].std()
            
            # Identify anomalies
            anomalies = []
            for i, pred in enumerate(predictions):
                if pred == -1:  # Anomaly detected
                    usage_value = df.iloc[i]['y']
                    date = df.iloc[i]['ds']
                    
                    # Calculate deviation
                    deviation = ((usage_value - mean_usage) / mean_usage) * 100 if mean_usage > 0 else 0
                    
                    # Calculate risk score (0-100)
                    risk_score = min(100, abs(deviation))
                    
                    # Determine alert type
                    if usage_value > mean_usage + 2 * std_usage:
                        alert_type = 'spike'
                    elif usage_value < mean_usage * 0.3:
                        alert_type = 'unusual_pattern'
                    else:
                        alert_type = 'leak'
                    
                    # Only create alert if significant deviation
                    if abs(deviation) > 50:  # ML-based dynamic threshold
                        alert = AnomalyAlert(
                            customer_id=customer_id,
                            alert_date=date,
                            usage_ccf=usage_value,
                            expected_usage_ccf=mean_usage,
                            deviation_percentage=deviation,
                            risk_score=risk_score,
                            alert_type=alert_type,
                            status='new'
                        )
                        db.session.add(alert)
                        anomalies.append(alert.to_dict())
            
            db.session.commit()
            
            return anomalies
            
        except Exception as e:
            db.session.rollback()
            return []
    
    def evaluate_forecast_accuracy(self, customer_id):
        """Evaluate forecast accuracy on historical data"""
        try:
            # Get all data
            df = self.get_usage_data(customer_id, days=730)
            
            if len(df) < 180:
                return {'error': 'Insufficient data for evaluation'}
            
            # Split into train and test
            split_point = int(len(df) * 0.8)
            train = df[:split_point]
            test = df[split_point:]
            
            # Train model
            model = Prophet()
            model.fit(train)
            
            # Predict on test set
            forecast = model.predict(test[['ds']])
            
            # Calculate metrics
            mape = np.mean(np.abs((test['y'].values - forecast['yhat'].values) / test['y'].values)) * 100
            rmse = np.sqrt(np.mean((test['y'].values - forecast['yhat'].values) ** 2))
            
            return {
                'mape': float(mape),
                'rmse': float(rmse),
                'accuracy': float(100 - mape),
                'test_samples': len(test)
            }
            
        except Exception as e:
            return {'error': str(e)}
