# HydroSpark Water Utility Management System

A water utility management platform with usage tracking, ML-based forecasting, anomaly detection, and automated billing.

---

## Prerequisites

You only need two things installed:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Git](https://git-scm.com/)

> Make sure Docker Desktop is **open and running** before you begin.

---

## Setup (3 steps)

### 1. Clone the repository

```bash
git clone https://github.com/Landon-Bragg/hydrospark-py.git
cd hydrospark-py
```

### 2. Create your environment file

```bash
cp .env.example .env
```

The `.env` file comes pre-configured and works out of the box — no edits needed.

### 3. Start the application

```bash
docker-compose up --build
```

This will download and start three services:
- **MySQL database** on port 3307
- **Backend API** on port 5001
- **Frontend** on port 3000

The first build takes **3–5 minutes**. You'll know it's ready when you see output like:
```
frontend  | Compiled successfully!
frontend  | You can now view the app in the browser.
```

Then open your browser to: **http://localhost:3000**

---

## Signing In

### Admin Account

```
Email:    admin@hydrospark.com
Password: admin123
```

The admin account has access to all features: user management, data import, bill generation, anomaly detection, and system-wide analytics.

### Sample Customer Accounts

All sample customers use the password: `welcome123`

| Email | Customer Name |
|-------|--------------|
| `customer_958213684@hydrospark.com` | Ava Walker |
| `customer_772641217@hydrospark.com` | Benjamin White |
| `customer_186640798@hydrospark.com` | City of Dallas Public Works |
| `customer_833244776@hydrospark.com` | Taylor Davis |

---

## Importing Your Data

1. Sign in as **admin**
2. Click **Admin** in the top navigation
3. Scroll down to the **Data Import** section
4. Click **Choose File** and select your CSV or XLSX file
5. Click **Import** and wait for the confirmation message

### Required File Format

Your CSV/XLSX file must have these column headers (order doesn't matter):

| Column | Required | Notes |
|--------|----------|-------|
| Customer Name | Yes | Full name or business name |
| Mailing Address | Yes | |
| Location ID | Yes | Unique identifier per meter |
| Customer Type | Yes | e.g. `residential`, `commercial` |
| Cycle Number | Yes | Billing cycle number |
| Year | Yes | 4-digit year |
| Month | Yes | 1–12 |
| Day | Yes | 1–31 |
| Daily Water Usage (CCF) | Yes | Numeric |
| Customer Phone Number | No | |
| Business Name | No | |
| Facility Name | No | |

---

## What Each Tab Does

### For Customers

| Tab | What it shows |
|-----|--------------|
| **Dashboard** | Usage summary, recent bills, and active alerts |
| **Usage** | Daily usage chart, monthly breakdown, cost estimates |
| **Bills** | All past bills — click any row to expand full invoice details |
| **Forecasts** | Generate a 12-month ML usage prediction |

### For Admins (in addition to the above)

| Tab | What it shows |
|-----|--------------|
| **Admin** | User management, data import, bill generation, anomaly detection, zip code rates |
| **Alerts** | All anomaly alerts across all customers, sorted by date |

---

## Stopping the Application

```bash
docker-compose down
```

Your database data is saved in a Docker volume and will persist the next time you run `docker-compose up`.

To start again later (no rebuild needed):

```bash
docker-compose up
```

---

## Troubleshooting

### Port already in use

If port 3000 or 5001 is taken, edit `docker-compose.yml` and change the left side of the port mapping:

```yaml
ports:
  - "3001:3000"   # Frontend now on port 3001
```

Then access the app at http://localhost:3001

### Database won't connect

```bash
docker-compose restart mysql
docker-compose logs mysql
```

### Frontend won't load / shows old version

```bash
docker-compose down
docker-compose up --build
```

### View live logs

```bash
docker-compose logs -f backend    # API logs
docker-compose logs -f frontend   # React logs
docker-compose logs -f mysql      # Database logs
```

### Access the database directly

```bash
docker-compose exec mysql mysql -uroot -ppassword hydrospark
```

---

## Resetting Everything

To completely wipe the database and start fresh:

```bash
docker-compose down -v
docker-compose up --build
```

> Warning: `-v` deletes all stored data including imported usage records.
