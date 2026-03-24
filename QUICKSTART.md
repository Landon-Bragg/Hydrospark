# HydroSpark - Quick Start Guide

## ⚡ 1-Minute Setup


Or manually:
```bash
docker-compose up --build
```

### Step 2: Access the Application
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5000/api

### Step 3: Login
```
Email: admin@hydrospark.com
Password: admin123
```

## 📊 Import Your Data

1. Login as admin
2. Go to Admin Dashboard
3. Click "Data Import"
4. Upload your CSV/XLSX file
5. Wait for import to complete

### Required CSV Format:
```
Customer Name, Mailing Address, Location ID, Customer Type, Cycle Number, 
Year, Month, Day, Daily Water Usage (CCF)
```

## 🎯 Key Features to Try

### For Customers:
1. **Dashboard** - View usage summary and alerts
2. **Usage** - See historical water consumption
3. **Forecasts** - Generate 12-month predictions
4. **Meter Upload** - Upload meter photo for bill estimate
5. **Alerts** - View anomaly notifications

### For Admins:
1. **User Management** - Approve pending registrations
2. **Data Import** - Bulk import usage data
3. **Billing** - Generate bills for customers
4. **Analytics** - System-wide insights

## 🔧 Common Commands

### View Logs
```bash
docker-compose logs -f backend    # Backend logs
docker-compose logs -f frontend   # Frontend logs
docker-compose logs -f mysql      # Database logs
```

### Restart Services
```bash
docker-compose restart backend
docker-compose restart frontend
```

### Stop System
```bash
./stop.sh
```
Or:
```bash
docker-compose down
```

### Access Database
```bash
docker-compose exec mysql mysql -uroot -ppassword hydrospark
```

## 🚨 Troubleshooting

### Port Already in Use
Edit `docker-compose.yml` and change the port mapping:
```yaml
ports:
  - "3001:3000"  # Change 3000 to 3001
```

### Database Connection Failed
```bash
docker-compose restart mysql
docker-compose logs mysql
```

### ML Models Not Working
ML models auto-train on first use. If issues persist:
```bash
docker-compose exec backend rm -rf ml_models/*
# Models will rebuild on next forecast/detection
```

## 📱 Test the System

### 1. Generate Forecast
- Login as customer
- Go to "Forecasts"
- Click "Generate Forecast"
- View 12-month predictions

### 2. Detect Anomalies
- Login as admin
- Go to Admin > Anomaly Detection
- Click "Run Detection"
- View detected anomalies

### 3. Upload Meter Reading
- Login as customer
- Go to "Meter Upload"
- Upload a clear photo of meter
- Get instant bill estimate

## 🎨 Customization

### Change Brand Colors
Edit `frontend/tailwind.config.js`:
```javascript
colors: {
  'hydro-deep-aqua': '#0A4C78',    // Your primary color
  'hydro-spark-blue': '#1EA7D6',   // Your accent color
  // ... more colors
}
```

### Adjust ML Settings
Edit `.env`:
```
ANOMALY_THRESHOLD_PERCENTAGE=50   # Detection sensitivity
FORECAST_MONTHS=6                 # Forecast period
```

## 📚 Full Documentation
See `README.md` for complete documentation.

---

**Need Help?** Check logs or contact the development team.
