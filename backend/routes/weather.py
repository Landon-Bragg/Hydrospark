"""
Weather routes - Fetch forecasts from Open-Meteo (free, no API key)
and compute water usage impact scores.
"""

import requests
from flask import Blueprint, request, jsonify

weather_bp = Blueprint('weather', __name__)

GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'


def _geocode_zip(zip_code):
    """Convert a US zip code to lat/lng via Open-Meteo geocoding."""
    resp = requests.get(GEOCODE_URL, params={
        'name': zip_code,
        'count': 1,
        'language': 'en',
        'format': 'json',
        'countryCode': 'US',
    }, timeout=5)
    resp.raise_for_status()
    results = resp.json().get('results')
    if not results:
        return None, None, None
    r = results[0]
    return r.get('latitude'), r.get('longitude'), r.get('name', zip_code)


def _water_impact(max_temp_f, precip_mm):
    """
    Return a (label, description, color) tuple describing how today's
    weather is expected to affect water usage.
    """
    if max_temp_f >= 95 and precip_mm < 2:
        return 'Very High', 'Extreme heat and no rain — expect significantly elevated water usage for irrigation, cooling, and outdoor use.', 'red'
    if max_temp_f >= 85 and precip_mm < 5:
        return 'High', 'Hot and dry conditions — water usage is likely above normal.', 'orange'
    if precip_mm >= 15:
        return 'Low', 'Heavy rainfall reduces outdoor watering needs significantly.', 'blue'
    if precip_mm >= 5:
        return 'Below Normal', 'Rainfall will reduce outdoor irrigation needs.', 'teal'
    if max_temp_f <= 45:
        return 'Low', 'Cold temperatures reduce outdoor water demand.', 'blue'
    if max_temp_f <= 65:
        return 'Below Normal', 'Mild and cool — slightly reduced usage expected.', 'teal'
    return 'Normal', 'Typical weather conditions — no major impact on water usage expected.', 'green'


@weather_bp.route('/forecast', methods=['GET'])
def get_weather_forecast():
    """
    GET /api/weather/forecast?zip_code=75001
    Returns a 14-day weather forecast with per-day water usage impact scores.
    No authentication required so new/unauthenticated users can access it.
    """
    zip_code = request.args.get('zip_code', '').strip()
    if not zip_code:
        return jsonify({'error': 'zip_code is required'}), 400
    # Normalize zip codes stored as floats (e.g. "75040.0" → "75040")
    if zip_code.endswith('.0'):
        zip_code = zip_code[:-2]

    try:
        lat, lng, location_name = _geocode_zip(zip_code)
        if lat is None:
            return jsonify({'error': f'Could not find location for zip code {zip_code}'}), 404

        resp = requests.get(FORECAST_URL, params={
            'latitude': lat,
            'longitude': lng,
            'daily': 'temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max',
            'temperature_unit': 'fahrenheit',
            'precipitation_unit': 'mm',
            'forecast_days': 14,
            'timezone': 'America/Chicago',
        }, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        daily = data.get('daily', {})
        dates = daily.get('time', [])
        max_temps = daily.get('temperature_2m_max', [])
        min_temps = daily.get('temperature_2m_min', [])
        precips = daily.get('precipitation_sum', [])
        uvs = daily.get('uv_index_max', [])

        days = []
        for i, date in enumerate(dates):
            max_t = max_temps[i] if i < len(max_temps) else None
            min_t = min_temps[i] if i < len(min_temps) else None
            precip = precips[i] if i < len(precips) else 0
            uv = uvs[i] if i < len(uvs) else None

            impact_label, impact_desc, impact_color = _water_impact(
                max_t if max_t is not None else 70,
                precip if precip is not None else 0
            )

            days.append({
                'date': date,
                'max_temp_f': round(max_t, 1) if max_t is not None else None,
                'min_temp_f': round(min_t, 1) if min_t is not None else None,
                'precipitation_mm': round(precip, 1) if precip is not None else 0,
                'uv_index': round(uv, 1) if uv is not None else None,
                'water_impact': impact_label,
                'water_impact_desc': impact_desc,
                'water_impact_color': impact_color,
            })

        return jsonify({
            'zip_code': zip_code,
            'location': location_name,
            'days': days,
        }), 200

    except requests.Timeout:
        return jsonify({'error': 'Weather service timed out. Try again shortly.'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500
