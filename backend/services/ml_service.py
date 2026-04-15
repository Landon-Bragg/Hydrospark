"""
Machine Learning Service - Forecasting and Anomaly Detection
"""

import math
import os
import pandas as pd
import numpy as np
from database import db, WaterUsage, UsageForecast, AnomalyAlert, Customer, BillingRate
from datetime import datetime, timedelta
from prophet import Prophet
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib


# ── Climate-informed seasonal multipliers by customer type ───────────────────
# Derived from US water utility usage patterns:
#   Residential peaks in summer (outdoor irrigation dominates)
#   Commercial/Municipal have a flatter curve (less irrigation dependency)
_SEASONAL = {
    'Residential': {1:0.80,2:0.82,3:0.90,4:0.98,5:1.08,6:1.18,7:1.22,8:1.20,9:1.10,10:0.95,11:0.85,12:0.80},
    'Commercial':  {1:0.92,2:0.93,3:0.96,4:0.99,5:1.03,6:1.08,7:1.10,8:1.09,9:1.04,10:0.99,11:0.94,12:0.91},
    'Municipal':   {1:0.88,2:0.90,3:0.94,4:0.99,5:1.05,6:1.12,7:1.15,8:1.13,9:1.06,10:0.98,11:0.91,12:0.87},
}

# Fallback daily CCF baselines for brand-new customers with no regional data
_TYPE_DEFAULTS = {'Residential': 0.35, 'Commercial': 1.20, 'Municipal': 2.50}


class MLService:
    def __init__(self):
        self.model_dir = 'ml_models'
        os.makedirs(self.model_dir, exist_ok=True)

    # ── Weather helpers ──────────────────────────────────────────────────────

    def _fetch_weather_for_zip(self, zip_code):
        """
        Fetch 14-day forecast from Open-Meteo for a US zip code.
        Returns a list of (max_temp_f, precip_mm) tuples; returns [] on any error
        so forecasting degrades gracefully rather than failing.
        """
        try:
            import requests
            zc = str(zip_code).strip()
            if zc.endswith('.0'):
                zc = zc[:-2]

            geo = requests.get(
                'https://geocoding-api.open-meteo.com/v1/search',
                params={'name': zc, 'count': 1, 'language': 'en',
                        'format': 'json', 'countryCode': 'US'},
                timeout=5,
            ).json()
            results = geo.get('results')
            if not results:
                return []

            lat, lng = results[0]['latitude'], results[0]['longitude']
            w = requests.get(
                'https://api.open-meteo.com/v1/forecast',
                params={
                    'latitude': lat, 'longitude': lng,
                    'daily': 'temperature_2m_max,precipitation_sum',
                    'temperature_unit': 'fahrenheit',
                    'precipitation_unit': 'mm',
                    'forecast_days': 14,
                    'timezone': 'America/Chicago',
                },
                timeout=8,
            ).json()

            daily   = w.get('daily', {})
            temps   = daily.get('temperature_2m_max', [])
            precips = daily.get('precipitation_sum', [])
            return [
                (float(temps[i])   if temps[i]   is not None else 70.0,
                 float(precips[i]) if precips[i] is not None else 0.0)
                for i in range(len(temps))
            ]
        except Exception:
            return []

    def _weather_multiplier(self, max_temp_f, precip_mm):
        """
        Translate a day's weather into a small usage multiplier.
        Range is intentionally tight (±12%) so weather nudges the model
        rather than overriding it.
        """
        if max_temp_f >= 95 and precip_mm < 2:
            return 1.12   # Very High – extreme heat, no rain
        if max_temp_f >= 85 and precip_mm < 5:
            return 1.07   # High – hot and dry
        if precip_mm >= 15:
            return 0.90   # Low – heavy rainfall
        if precip_mm >= 5:
            return 0.95   # Below Normal – moderate rain
        if max_temp_f <= 45:
            return 0.90   # Low – cold temperatures
        if max_temp_f <= 65:
            return 0.95   # Below Normal – cool conditions
        return 1.00       # Normal

    def _seasonal_factor(self, month, customer_type):
        """Monthly seasonal multiplier derived from climate norms."""
        table = _SEASONAL.get(customer_type, _SEASONAL['Residential'])
        return table.get(month, 1.0)

    # ── Baseline for new / sparse users ─────────────────────────────────────

    def _get_zip_baseline(self, zip_code, customer_type):
        """
        Estimate a representative daily CCF for a customer with no usage history.
        Lookup priority:
          1. Same zip code + same customer type (most specific)
          2. Same zip code, any customer type
          3. Same customer type, system-wide
          4. Hardcoded sensible default
        """
        from sqlalchemy import func

        if zip_code:
            zc = str(zip_code).strip()
            if zc.endswith('.0'):
                zc = zc[:-2]

            # 1. Same zip + same type
            r = (db.session.query(func.avg(WaterUsage.daily_usage_ccf))
                 .join(Customer, Customer.id == WaterUsage.customer_id)
                 .filter(Customer.zip_code == zc,
                         Customer.customer_type == customer_type)
                 .scalar())
            if r:
                return float(r)

            # 2. Same zip, any type
            r = (db.session.query(func.avg(WaterUsage.daily_usage_ccf))
                 .join(Customer, Customer.id == WaterUsage.customer_id)
                 .filter(Customer.zip_code == zc)
                 .scalar())
            if r:
                return float(r)

        # 3. Same type, system-wide
        r = (db.session.query(func.avg(WaterUsage.daily_usage_ccf))
             .join(Customer, Customer.id == WaterUsage.customer_id)
             .filter(Customer.customer_type == customer_type)
             .scalar())
        if r:
            return float(r)

        # 4. Hardcoded fallback
        return _TYPE_DEFAULTS.get(customer_type, 0.35)

    # ── Core data loader ─────────────────────────────────────────────────────

    def get_usage_data(self, customer_id, days=365):
        """Get historical usage data for a customer as a DataFrame."""
        end_date   = datetime.now().date()
        start_date = end_date - timedelta(days=days)

        usage = WaterUsage.query.filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date  >= start_date,
            WaterUsage.usage_date  <= end_date,
        ).order_by(WaterUsage.usage_date).all()

        if not usage:
            return pd.DataFrame()

        return pd.DataFrame([
            {'ds': u.usage_date, 'y': float(u.daily_usage_ccf)}
            for u in usage
        ])

    # ── Customer forecast ────────────────────────────────────────────────────

    def generate_forecast(self, customer_id, months=12):
        """
        Generate a weather-aware usage forecast.

        For customers with history (≥30 days):
          Weighted moving average (50/30/20) + monthly seasonal norms
          + actual 14-day Open-Meteo weather for near-term days.

        For new customers (<30 days of data):
          Zip-code/type peer average as the daily baseline, then the
          same seasonal + weather stack as above.
        """
        try:
            df       = self.get_usage_data(customer_id, days=730)
            customer = Customer.query.get(customer_id)

            # Billing rate
            rate = BillingRate.query.filter_by(
                customer_type=customer.customer_type, is_active=True
            ).first()
            billing_rate = float(rate.flat_rate) if rate else 5.72

            # ── Determine baseline daily usage ──
            new_user_mode = df.empty or len(df) < 30

            if new_user_mode:
                predicted_daily = self._get_zip_baseline(
                    customer.zip_code, customer.customer_type
                )
                model_ver = 'zip_baseline_weather_v1'
                print(f"New-user mode for customer {customer_id}: "
                      f"baseline {predicted_daily:.3f} CCF/day from zip/type peers")
            else:
                recent_30  = df.tail(30)['y'].mean()
                recent_90  = df.tail(90)['y'].mean() if len(df) >= 90 else recent_30
                recent_365 = df['y'].mean()
                predicted_daily = recent_30 * 0.5 + recent_90 * 0.3 + recent_365 * 0.2
                model_ver = 'moving_average_weather_v2'
                print(f"History mode for customer {customer_id}: "
                      f"baseline {predicted_daily:.3f} CCF/day from {len(df)} days")

            # ── Fetch 14-day actual weather ──
            weather_days = []
            if customer.zip_code:
                weather_days = self._fetch_weather_for_zip(customer.zip_code)
                print(f"Fetched {len(weather_days)} weather days for zip {customer.zip_code}")

            # ── Build forecasts ──
            UsageForecast.query.filter_by(customer_id=customer_id).delete()

            forecasts = []
            last_date = df['ds'].max() if not df.empty else datetime.now().date()

            for day in range(1, months * 30 + 1):
                forecast_date = last_date + timedelta(days=day)
                month         = forecast_date.month
                seasonal      = self._seasonal_factor(month, customer.customer_type)

                if day <= len(weather_days):
                    max_temp, precip = weather_days[day - 1]
                    w_mult = self._weather_multiplier(max_temp, precip)
                    # Near-term: blend 55% seasonal norms + 45% actual weather signal
                    effective = seasonal * 0.55 + (seasonal * w_mult) * 0.45
                else:
                    effective = seasonal

                predicted_usage = max(0.01, predicted_daily * effective)
                confidence_range = predicted_usage * 0.20

                record = UsageForecast(
                    customer_id=customer_id,
                    forecast_date=forecast_date,
                    predicted_usage_ccf=round(predicted_usage, 2),
                    predicted_amount=round(predicted_usage * billing_rate, 2),
                    confidence_lower=round(max(0, predicted_usage - confidence_range), 2),
                    confidence_upper=round(predicted_usage + confidence_range, 2),
                    model_version=model_ver,
                )
                db.session.add(record)
                forecasts.append(record.to_dict())

            db.session.commit()
            print(f"Generated {len(forecasts)} forecasts for customer {customer_id}")
            return forecasts

        except Exception as e:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            return {'error': str(e)}

    # ── System-wide forecast ─────────────────────────────────────────────────

    def get_system_usage_data(self, days=730):
        """Get aggregated daily usage across all customers."""
        from sqlalchemy import func
        end_date   = datetime.now().date()
        start_date = end_date - timedelta(days=days)

        results = db.session.query(
            WaterUsage.usage_date,
            func.sum(WaterUsage.daily_usage_ccf).label('total_usage')
        ).filter(
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date,
        ).group_by(WaterUsage.usage_date).order_by(WaterUsage.usage_date).all()

        if not results:
            return pd.DataFrame()

        return pd.DataFrame([
            {'ds': r.usage_date, 'y': float(r.total_usage)}
            for r in results
        ])

    def generate_system_forecast(self, months=12):
        """
        System-wide forecast: moving average + blended seasonal norms
        across all customer types. No single zip → no live weather call;
        seasonal climate patterns apply instead.
        """
        try:
            df = self.get_system_usage_data(days=730)
            if df.empty or len(df) < 30:
                return {'error': 'Insufficient system-wide historical data (need at least 30 days)'}

            print(f"System forecast: {len(df)} days of aggregated data")

            recent_30  = df.tail(30)['y'].mean()
            recent_90  = df.tail(90)['y'].mean() if len(df) >= 90 else recent_30
            recent_365 = df['y'].mean()
            predicted_daily = recent_30 * 0.5 + recent_90 * 0.3 + recent_365 * 0.2

            default_rate = float(os.getenv('DEFAULT_RATE_PER_CCF', 5.72))

            forecasts  = []
            last_date  = df['ds'].max()

            for day in range(1, months * 30 + 1):
                forecast_date = last_date + timedelta(days=day)
                month = forecast_date.month
                # Weighted blend of all customer types (rough US utility mix)
                seasonal = (
                    self._seasonal_factor(month, 'Residential') * 0.60 +
                    self._seasonal_factor(month, 'Commercial')  * 0.25 +
                    self._seasonal_factor(month, 'Municipal')   * 0.15
                )
                predicted_usage  = max(0.01, predicted_daily * seasonal)
                confidence_range = predicted_usage * 0.20

                forecasts.append({
                    'forecast_date':      forecast_date.isoformat() if hasattr(forecast_date, 'isoformat') else str(forecast_date),
                    'predicted_usage_ccf': round(predicted_usage, 2),
                    'predicted_amount':    round(predicted_usage * default_rate, 2),
                    'confidence_lower':    round(max(0, predicted_usage - confidence_range), 2),
                    'confidence_upper':    round(predicted_usage + confidence_range, 2),
                    'model_version':       'system_seasonal_weather_v2',
                })

            print(f"System forecast: generated {len(forecasts)} data points")
            return forecasts

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {'error': str(e)}

    # ── Anomaly detection ────────────────────────────────────────────────────

    def detect_anomalies(self, customer_id, lookback_days=90):
        """Detect anomalies using Isolation Forest."""
        try:
            df = self.get_usage_data(customer_id, days=lookback_days)

            if df.empty or len(df) < 14:
                return []

            X        = df['y'].values.reshape(-1, 1)
            scaler   = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            clf         = IsolationForest(contamination=0.1, random_state=42)
            predictions = clf.fit_predict(X_scaled)

            mean_usage = df['y'].mean()
            std_usage  = df['y'].std()

            anomalies = []
            for i, pred in enumerate(predictions):
                if pred == -1:
                    usage_value = df.iloc[i]['y']
                    date        = df.iloc[i]['ds']
                    deviation   = ((usage_value - mean_usage) / mean_usage) * 100 if mean_usage > 0 else 0
                    risk_score  = min(100, abs(deviation))

                    # Only alert on above-average usage; ignore low-usage anomalies
                    if usage_value <= mean_usage:
                        continue

                    alert_type = 'spike'

                    if deviation > 30:
                        alert = AnomalyAlert(
                            customer_id=customer_id,
                            alert_date=date,
                            usage_ccf=usage_value,
                            expected_usage_ccf=mean_usage,
                            deviation_percentage=deviation,
                            risk_score=risk_score,
                            alert_type=alert_type,
                            status='new',
                        )
                        db.session.add(alert)
                        anomalies.append(alert.to_dict())

            db.session.commit()
            return anomalies

        except Exception as e:
            db.session.rollback()
            return []

    def evaluate_forecast_accuracy(self, customer_id):
        """Evaluate forecast accuracy on historical data using Prophet."""
        try:
            df = self.get_usage_data(customer_id, days=730)

            if len(df) < 180:
                return {'error': 'Insufficient data for evaluation'}

            split_point = int(len(df) * 0.8)
            train = df[:split_point]
            test  = df[split_point:]

            model    = Prophet()
            model.fit(train)
            forecast = model.predict(test[['ds']])

            mape = np.mean(np.abs((test['y'].values - forecast['yhat'].values) / test['y'].values)) * 100
            rmse = np.sqrt(np.mean((test['y'].values - forecast['yhat'].values) ** 2))

            return {
                'mape':         float(mape),
                'rmse':         float(rmse),
                'accuracy':     float(100 - mape),
                'test_samples': len(test),
            }

        except Exception as e:
            return {'error': str(e)}
