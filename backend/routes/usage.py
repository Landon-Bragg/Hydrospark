"""
Water usage data routes
"""

from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, WaterUsage, Bill
from datetime import datetime, timedelta
from sqlalchemy import func
import csv
import io

usage_bp = Blueprint('usage', __name__)

@usage_bp.route('/', methods=['GET'])
@jwt_required()
def get_usage():
    """Get water usage data with filters"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        # Get query parameters
        customer_id = request.args.get('customer_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = WaterUsage.query

        # Apply customer filter based on role
        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            query = query.filter_by(customer_id=user.customer.id)
        elif customer_id:
            query = query.filter_by(customer_id=customer_id)

        # Apply date filters
        if start_date:
            query = query.filter(WaterUsage.usage_date >= datetime.fromisoformat(start_date))
        if end_date:
            query = query.filter(WaterUsage.usage_date <= datetime.fromisoformat(end_date))

        # Order by date
        usage_data = query.order_by(WaterUsage.usage_date.desc()).limit(1000).all()

        if user.role in ['admin', 'billing']:
            def record_with_customer(u):
                d = u.to_dict()
                if u.customer:
                    d['customer_name'] = u.customer.customer_name
                    d['customer_email'] = u.customer.user.email if u.customer.user else None
                return d
            return jsonify({'usage': [record_with_customer(u) for u in usage_data], 'count': len(usage_data)}), 200

        return jsonify({
            'usage': [u.to_dict() for u in usage_data],
            'count': len(usage_data)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@usage_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_usage_summary():
    """Get usage summary statistics"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if user.role == 'customer':
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customer_id = user.customer.id
        else:
            customer_id = request.args.get('customer_id', type=int)
            if not customer_id:
                return jsonify({'error': 'customer_id required'}), 400

        # Get date range (default: last 30 days)
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=30)

        if request.args.get('start_date'):
            start_date = datetime.fromisoformat(request.args.get('start_date')).date()
        if request.args.get('end_date'):
            end_date = datetime.fromisoformat(request.args.get('end_date')).date()

        total_usage = db.session.query(func.sum(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).scalar() or 0

        avg_daily = db.session.query(func.avg(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).scalar() or 0

        max_daily = db.session.query(func.max(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).scalar() or 0

        # Include rate and estimated cost for customers
        rate_per_ccf = None
        estimated_cost = None
        customer_obj = Customer.query.get(customer_id)
        if customer_obj:
            from services.billing_service import BillingService
            bs = BillingService()
            rate_per_ccf = bs._resolve_rate(customer_obj)
            estimated_cost = float(total_usage) * rate_per_ccf

        return jsonify({
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_usage_ccf': float(total_usage),
                'average_daily_ccf': float(avg_daily),
                'max_daily_ccf': float(max_daily),
                'days_count': (end_date - start_date).days + 1,
                'rate_per_ccf': rate_per_ccf,
                'estimated_cost': estimated_cost
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@usage_bp.route('/top-customers', methods=['GET'])
@jwt_required()
def get_top_customers():
    """Get top customers by usage for a period (admin only)"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or user.role not in ['admin', 'billing']:
            return jsonify({'error': 'Admin access required'}), 403

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = request.args.get('limit', 15, type=int)

        query = (
            db.session.query(
                WaterUsage.customer_id,
                func.sum(WaterUsage.daily_usage_ccf).label('total_usage'),
                func.count(WaterUsage.id).label('record_count'),
                Customer.customer_name,
                Customer.customer_type,
                User.email,
            )
            .join(Customer, Customer.id == WaterUsage.customer_id)
            .join(User, User.id == Customer.user_id)
        )

        if start_date:
            query = query.filter(WaterUsage.usage_date >= start_date)
        if end_date:
            query = query.filter(WaterUsage.usage_date <= end_date)

        results = query.group_by(
            WaterUsage.customer_id, Customer.customer_name, Customer.customer_type, User.email
        ).order_by(
            func.sum(WaterUsage.daily_usage_ccf).desc()
        ).limit(limit).all()

        output = []
        for row in results:
            output.append({
                'customer_id': row.customer_id,
                'customer_name': row.customer_name or f'Customer {row.customer_id}',
                'customer_email': row.email,
                'customer_type': row.customer_type,
                'total_usage_ccf': float(row.total_usage),
                'record_count': int(row.record_count)
            })

        return jsonify({'top_customers': output}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@usage_bp.route('/zip-averages', methods=['GET'])
@jwt_required()
def get_zip_averages():
    """
    Return average monthly bill and usage per customer type for a given zip code.
    Customers use this to compare their usage against others in their area.
    Query param: zip_code (optional — defaults to the calling customer's zip code).
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        zip_code = request.args.get('zip_code')

        # Customers default to their own zip code
        if not zip_code and user.role == 'customer':
            if not user.customer or not user.customer.zip_code:
                return jsonify({'zip_code': None, 'averages': []}), 200
            zip_code = user.customer.zip_code

        if not zip_code:
            return jsonify({'error': 'zip_code is required'}), 400

        # Average monthly bill and usage per customer type in this zip code
        rows = (
            db.session.query(
                Customer.customer_type,
                func.avg(Bill.total_amount).label('avg_monthly_bill'),
                func.avg(Bill.total_usage_ccf).label('avg_monthly_usage_ccf'),
                func.count(func.distinct(Customer.id)).label('customer_count'),
            )
            .join(Bill, Bill.customer_id == Customer.id)
            .filter(Customer.zip_code == zip_code)
            .group_by(Customer.customer_type)
            .all()
        )

        averages = [
            {
                'customer_type': r.customer_type,
                'avg_monthly_bill': round(float(r.avg_monthly_bill), 2),
                'avg_monthly_usage_ccf': round(float(r.avg_monthly_usage_ccf), 2),
                'customer_count': int(r.customer_count),
            }
            for r in rows
        ]

        return jsonify({'zip_code': zip_code, 'averages': averages}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@usage_bp.route('/download', methods=['GET'])
@jwt_required()
def download_usage():
    """Download daily water usage as CSV for a date range."""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        start_date_str = request.args.get('start_date')
        end_date_str   = request.args.get('end_date')

        if not start_date_str or not end_date_str:
            return jsonify({'error': 'start_date and end_date are required'}), 400

        try:
            start_date = datetime.fromisoformat(start_date_str).date()
            end_date   = datetime.fromisoformat(end_date_str).date()
        except ValueError:
            return jsonify({'error': 'Invalid date format — use YYYY-MM-DD'}), 400

        if (end_date - start_date).days > 730:
            return jsonify({'error': 'Date range cannot exceed 2 years'}), 400

        is_staff = user.role in ('admin', 'billing')

        # Determine which customer(s) to include
        customer_id_param = request.args.get('customer_id', type=int)
        if is_staff and customer_id_param:
            customers = Customer.query.filter_by(id=customer_id_param).all()
        elif is_staff:
            customers = None  # all customers
        else:
            if not user.customer:
                return jsonify({'error': 'Customer profile not found'}), 404
            customers = [user.customer]

        # Build usage query
        query = (
            db.session.query(WaterUsage, Customer)
            .join(Customer, Customer.id == WaterUsage.customer_id)
            .filter(
                WaterUsage.usage_date >= start_date,
                WaterUsage.usage_date <= end_date,
            )
        )
        if customers is not None:
            ids = [c.id for c in customers]
            query = query.filter(WaterUsage.customer_id.in_(ids))

        rows = query.order_by(WaterUsage.usage_date.asc(), Customer.customer_name.asc()).all()

        # Compute per-customer daily averages for the deviation column
        avg_map = {}
        for usage, customer in rows:
            if customer.id not in avg_map:
                avg_map[customer.id] = []
            avg_map[customer.id].append(float(usage.daily_usage_ccf))
        avg_by_customer = {cid: (sum(vals) / len(vals)) for cid, vals in avg_map.items()}

        # Also pull billing rate per customer for estimated cost column
        from services.billing_service import BillingService
        bs = BillingService()
        rate_map = {}
        seen_customers = {customer.id: customer for _, customer in rows}
        for cid, c in seen_customers.items():
            try:
                rate_map[cid] = bs._resolve_rate(c)
            except Exception:
                rate_map[cid] = 5.72

        # Write CSV
        output = io.StringIO()
        writer = csv.writer(output)

        # Metadata header
        generated_at = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
        writer.writerow(['# HydroSpark Water Usage Export'])
        writer.writerow([f'# Period: {start_date} to {end_date}'])
        writer.writerow([f'# Generated: {generated_at}'])
        if not is_staff and user.customer:
            writer.writerow([f'# Account: {user.customer.customer_name}'])
        writer.writerow([])

        # Column headers
        if is_staff:
            writer.writerow([
                'Date', 'Customer Name', 'Customer Type', 'Location ID',
                'Usage (CCF)', 'Usage (Gallons)', 'Est. Cost ($)',
                'vs Daily Avg (%)', 'Reading Type',
            ])
        else:
            writer.writerow([
                'Date',
                'Usage (CCF)', 'Usage (Gallons)', 'Est. Cost ($)',
                'vs Daily Avg (%)', 'Reading Type',
            ])

        total_ccf = 0.0
        for usage, customer in rows:
            ccf      = float(usage.daily_usage_ccf)
            gallons  = round(ccf * 748, 1)
            rate     = rate_map.get(customer.id, 5.72)
            cost     = round(ccf * rate, 2)
            avg      = avg_by_customer.get(customer.id, ccf)
            dev_pct  = round(((ccf - avg) / avg * 100), 1) if avg > 0 else 0.0
            rtype    = 'Estimated' if usage.is_estimated else 'Actual'
            total_ccf += ccf

            if is_staff:
                writer.writerow([
                    usage.usage_date.isoformat(),
                    customer.customer_name,
                    customer.customer_type or '',
                    customer.location_id or '',
                    f'{ccf:.2f}', gallons, f'{cost:.2f}',
                    f'{dev_pct:+.1f}', rtype,
                ])
            else:
                writer.writerow([
                    usage.usage_date.isoformat(),
                    f'{ccf:.2f}', gallons, f'{cost:.2f}',
                    f'{dev_pct:+.1f}', rtype,
                ])

        # Summary footer
        writer.writerow([])
        if rows:
            writer.writerow(['# Summary'])
            writer.writerow([f'# Total records: {len(rows)}'])
            writer.writerow([f'# Total usage: {total_ccf:.2f} CCF ({round(total_ccf * 748):,} gallons)'])
            avg_daily_overall = total_ccf / len(rows) if rows else 0
            writer.writerow([f'# Average daily: {avg_daily_overall:.2f} CCF'])

        csv_content = output.getvalue()
        output.close()

        # Filename
        if not is_staff and user.customer:
            name_slug = user.customer.customer_name.lower().replace(' ', '_')
            filename  = f'water_usage_{name_slug}_{start_date}_{end_date}.csv'
        elif is_staff and customer_id_param and customers:
            name_slug = customers[0].customer_name.lower().replace(' ', '_')
            filename  = f'water_usage_{name_slug}_{start_date}_{end_date}.csv'
        else:
            filename = f'water_usage_all_{start_date}_{end_date}.csv'

        return Response(
            csv_content,
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'text/csv; charset=utf-8',
            }
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500
