"""
Data Import Service - Import usage data from CSV/XLSX
"""

import pandas as pd
from database import db, Customer, WaterUsage, User
from datetime import datetime
import bcrypt
from flask import current_app

class DataImportService:
    def _normalize_customer_type(self, customer_type):
        """Normalize customer type to allowed values: Residential, Municipal, Commercial"""
        customer_type = str(customer_type).strip()

        type_mapping = {
            'Residential': 'Residential',
            'Municipal': 'Municipal',
            'Commercial': 'Commercial',
            'Government': 'Municipal',
            'Public': 'Municipal',
            'Industrial': 'Commercial',
        }

        return type_mapping.get(customer_type, 'Residential')
    def import_usage_data(self, file):
        """Import water usage data from CSV or XLSX file"""
        try:
            # Read file based on extension
            filename = file.filename.lower()
            if filename.endswith('.csv'):
                df = pd.read_csv(file)
            elif filename.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(file)
            else:
                return {'error': 'Unsupported file format. Use CSV or XLSX'}
            
            # Validate columns
            required_columns = [
                'Customer Name', 'Mailing Address', 'Location ID',
                'Customer Type', 'Cycle Number', 'Year', 'Month', 'Day',
                'Daily Water Usage (CCF)', 'Zip Code'
            ]
            
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                return {'error': f'Missing columns: {", ".join(missing_columns)}'}
            
            print(f"Starting import of {len(df)} records...")
            
            # Process data
            imported_count = 0
            customers_created = 0
            errors = []
            failed_location_ids = set()

            for idx, row in df.iterrows():
                try:
                    location_id_str = str(row['Location ID'])

                    # Skip rows for customers that previously failed
                    if location_id_str in failed_location_ids:
                        continue

                    # Get or create customer
                    customer = Customer.query.filter_by(location_id=location_id_str).first()
                    
                    if not customer:
                        # Create user and customer
                        email = f"customer_{row['Location ID']}@hydrospark.com"
                        user = User.query.filter_by(email=email).first()
                        
                        if not user:
                            password_hash = bcrypt.hashpw('welcome123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                            user = User(
                                email=email,
                                password_hash=password_hash,
                                role='customer',
                                first_name=str(row['Customer Name']).split()[0] if pd.notna(row['Customer Name']) else 'Customer',
                                last_name=str(row['Customer Name']).split()[-1] if pd.notna(row['Customer Name']) else str(row['Location ID']),
                                phone=str(row.get('Customer Phone Number', '')) if pd.notna(row.get('Customer Phone Number')) else None,
                                is_active=True,
                                is_approved=True
                            )
                            db.session.add(user)
                            db.session.flush()
                        
                        zip_code_val = str(row.get('Zip Code', '')).strip() if pd.notna(row.get('Zip Code')) else None
                        customer = Customer(
                            user_id=user.id,
                            customer_name=str(row['Customer Name']) if pd.notna(row['Customer Name']) else f"Customer {row['Location ID']}",
                            mailing_address=str(row['Mailing Address']) if pd.notna(row['Mailing Address']) else '',
                            zip_code=zip_code_val,
                            location_id=location_id_str,
                            customer_type=self._normalize_customer_type(str(row['Customer Type'])) if pd.notna(row['Customer Type']) else 'Residential',
                            cycle_number=int(row['Cycle Number']) if pd.notna(row['Cycle Number']) else None,
                            business_name=str(row.get('Business Name', '')) if pd.notna(row.get('Business Name')) else None,
                            facility_name=str(row.get('Facility Name', '')) if pd.notna(row.get('Facility Name')) else None
                        )
                        db.session.add(customer)
                        db.session.flush()
                        customers_created += 1
                    
                    # Create usage record
                    usage_date = datetime(
                        int(row['Year']),
                        int(row['Month']),
                        int(row['Day'])
                    ).date()
                    
                    # Check if record exists
                    existing = WaterUsage.query.filter_by(
                        customer_id=customer.id,
                        usage_date=usage_date
                    ).first()
                    
                    if not existing:
                        usage = WaterUsage(
                            customer_id=customer.id,
                            location_id=str(row['Location ID']),
                            usage_date=usage_date,
                            daily_usage_ccf=float(row['Daily Water Usage (CCF)']),
                            year=int(row['Year']),
                            month=int(row['Month']),
                            day=int(row['Day']),
                            is_estimated=False
                        )
                        db.session.add(usage)
                        imported_count += 1
                    
                    # Commit every 1000 records
                    if (idx + 1) % 1000 == 0:
                        db.session.commit()
                        print(f"Processed {idx + 1} records...")
                        
                except Exception as e:
                    location_id_str = str(row.get('Location ID', f'row_{idx + 1}'))
                    failed_location_ids.add(location_id_str)
                    errors.append(f"Row {idx + 1} (location {location_id_str}): {str(e)}")
                    db.session.rollback()
            
            # Final commit
            db.session.commit()
            
            print(f"Import completed: {imported_count} records, {customers_created} customers created")
            
            return {
                'message': 'Import completed',
                'imported_records': imported_count,
                'customers_created': customers_created,
                'errors': errors[:50]  # Return first 50 errors
            }
            
        except Exception as e:
            db.session.rollback()
            print(f"Import failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}