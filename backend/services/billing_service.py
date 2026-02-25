"""
Billing calculation service
"""

from database import db, Customer, WaterUsage, BillingRate, Bill, ZipCodeRate
from datetime import datetime, timedelta
from sqlalchemy import func

class BillingService:
    def _resolve_rate(self, customer):
        """Resolve effective rate for a customer.
        Priority: customer override > zip code rate > customer-type rate > default."""
        if customer.custom_rate_per_ccf is not None:
            return float(customer.custom_rate_per_ccf)

        if customer.zip_code:
            zip_rate = ZipCodeRate.query.filter_by(
                zip_code=customer.zip_code, is_active=True
            ).first()
            if zip_rate:
                return float(zip_rate.rate_per_ccf)

        type_rate = BillingRate.query.filter_by(
            customer_type=customer.customer_type, is_active=True
        ).first()
        if type_rate:
            return float(type_rate.flat_rate)

        return 5.72  # Default fallback

    def calculate_bill(self, customer_id, start_date, end_date):
        """Calculate bill for period"""
        # Get total usage
        total_usage = db.session.query(func.sum(WaterUsage.daily_usage_ccf)).filter(
            WaterUsage.customer_id == customer_id,
            WaterUsage.usage_date >= start_date,
            WaterUsage.usage_date <= end_date
        ).scalar() or 0

        # Get customer
        customer = Customer.query.get(customer_id)
        if not customer:
            return None

        rate_value = self._resolve_rate(customer)
        
        total_amount = float(total_usage) * rate_value
        
        return {
            'total_usage_ccf': float(total_usage),
            'rate_per_ccf': rate_value,
            'total_amount': total_amount
        }
    
    def estimate_bill_from_reading(self, customer_id, meter_reading):
        """Estimate bill from current meter reading"""
        # Get last billing period
        last_bill = Bill.query.filter_by(customer_id=customer_id).order_by(
            Bill.billing_period_end.desc()
        ).first()
        
        if not last_bill:
            # No previous bill, use default estimation
            estimated_usage = meter_reading * 0.8  # Assume 80% usage
        else:
            # Calculate usage since last bill
            estimated_usage = meter_reading - float(last_bill.total_usage_ccf)
        
        customer = Customer.query.get(customer_id)
        rate_value = self._resolve_rate(customer)
        estimated_amount = estimated_usage * rate_value
        
        return {
            'meter_reading': meter_reading,
            'estimated_usage_ccf': estimated_usage,
            'estimated_amount': estimated_amount,
            'rate_per_ccf': rate_value
        }
    
    def generate_historical_bills(self):
        """Generate bills for all customers for all historical months"""
        try:
            customers = Customer.query.all()
            total_bills = 0
            
            for customer in customers:
                # Get date range for this customer's data
                first_usage = WaterUsage.query.filter_by(
                    customer_id=customer.id
                ).order_by(WaterUsage.usage_date).first()
                
                last_usage = WaterUsage.query.filter_by(
                    customer_id=customer.id
                ).order_by(WaterUsage.usage_date.desc()).first()
                
                if not first_usage or not last_usage:
                    continue
                
                # Generate monthly bills
                current_date = first_usage.usage_date.replace(day=1)
                end_date = last_usage.usage_date
                
                while current_date <= end_date:
                    # Calculate month end
                    if current_date.month == 12:
                        month_end = current_date.replace(day=31)
                    else:
                        next_month = current_date.replace(month=current_date.month + 1)
                        month_end = (next_month - timedelta(days=1))
                    
                    # Don't exceed data range
                    if month_end > end_date:
                        month_end = end_date
                    
                    # Check if bill already exists
                    existing_bill = Bill.query.filter_by(
                        customer_id=customer.id,
                        billing_period_start=current_date,
                        billing_period_end=month_end
                    ).first()
                    
                    if not existing_bill:
                        # Calculate usage for this period
                        bill_info = self.calculate_bill(customer.id, current_date, month_end)
                        
                        if bill_info and bill_info['total_usage_ccf'] > 0:
                            # Create bill
                            due_date = month_end + timedelta(days=15)
                            
                            # Determine status based on date
                            if month_end < datetime.now().date():
                                if due_date < datetime.now().date():
                                    status = 'overdue'
                                else:
                                    status = 'sent'
                            else:
                                status = 'pending'
                            
                            bill = Bill(
                                customer_id=customer.id,
                                billing_period_start=current_date,
                                billing_period_end=month_end,
                                total_usage_ccf=bill_info['total_usage_ccf'],
                                total_amount=bill_info['total_amount'],
                                due_date=due_date,
                                status=status
                            )
                            db.session.add(bill)
                            total_bills += 1
                    
                    # Move to next month
                    if current_date.month == 12:
                        current_date = current_date.replace(year=current_date.year + 1, month=1)
                    else:
                        current_date = current_date.replace(month=current_date.month + 1)
                
                # Commit every customer to avoid memory issues
                db.session.commit()
                print(f"Generated bills for customer {customer.customer_name}")
            
            return {
                'message': 'Historical bills generated',
                'total_bills': total_bills
            }
            
        except Exception as e:
            db.session.rollback()
            print(f"Bill generation error: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}