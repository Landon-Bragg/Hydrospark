# HydroSpark Water Utility Management System

A water utility management platform with usage tracking, ML-based forecasting, anomaly detection, automated billing, and an AI assistant (HydroBot) for account support.

---


## Live Deployment 
**Frontend:** https://exciting-abundance-production.up.railway.app

**Backend API:** https://hydrospark-py-production.up.railway.app/api/health

## Prerequisites

You only need two things installed:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Git](https://git-scm.com/)

> Make sure Docker Desktop is **open and running** before you begin.

---

## Setup (3 steps)

### 1. Clone the repository

```bash
git clone https://github.com/Landon-Bragg/hydrospark-system.git
cd hydrospark-system
```

### 2. Create your environment file

```bash
cp .env.example .env
```

The app works out of the box with the default config. To enable the AI chatbot (HydroBot), add your free Groq API key to `.env`:
- Get one at https://console.groq.com
- Set `GROQ_API_KEY=your-key-here` in `.env`

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

There are four roles, each with a different login and set of features:

---

### Admin

```
Email:    admin@hydrospark.com
Password: admin123
```

Full system access — user management, data import, bill generation, anomaly detection, zip analytics, water shutoff, and everything in the Billing/Support role.

**Navigation:** Dashboard · Usage · Forecasts · Inbox · Admin

---

### Billing / Support

```
Email:    billing@hydrospark.com
Password: billing123
```

Support-focused access — view and manage all customer bills and usage data, triage anomaly alerts (acknowledge, dispatch field teams, apply bill credits), message customers directly through the inbox, and send notifications to individual customers or broadcast to all.

**Navigation:** Billing · Alerts · Inbox · Usage

---

### Field Technician

```
Email:    field@hydrospark.com
Password: field123
```

Field team access — see only the work orders that have been dispatched by the billing team. Each work order shows the customer address, alert details, overage CCF, estimated bill impact, and any dispatch notes. Mark jobs complete with field notes, which automatically notifies billing.

**Navigation:** Work Orders

---

### Customer

```
Email:    customer_958213684@hydrospark.com   (Ava Walker)
Email:    customer_772641217@hydrospark.com   (Benjamin White)
Email:    customer_186640798@hydrospark.com   (City of Dallas Public Works)
Email:    customer_833244776@hydrospark.com   (Taylor Davis)
Password: welcome123  (all sample accounts)
```

Customer-facing view — personal usage history, forecasts, bills, and an inbox for notifications and direct messages from the support team.

**Navigation:** Dashboard · Inbox · Usage · Forecasts · Bills

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
| Customer Type | Yes | `Residential`, `Municipal`, or `Commercial` |
| Cycle Number | Yes | Billing cycle number |
| Year | Yes | 4-digit year |
| Month | Yes | 1–12 |
| Day | Yes | 1–31 |
| Daily Water Usage (CCF) | Yes | Numeric |
| Zip Code | Yes | 5-digit zip code |
| Customer Phone Number | No | |
| Business Name | No | |
| Facility Name | No | |

---

## Keeping Teammates in Sync (Database Updates)

The database is seeded from `backend/seed_data/hydrospark_data.sql.gz` — a compressed snapshot of the full database committed to git. When you make changes to the database that teammates need (new data, updated records, etc.), follow this process:

### When you update the database and want to share it

**1. Generate a new snapshot from your running database:**

```bash
docker exec hydrospark-mysql bash -c "mysqldump -uroot -ppassword --no-tablespaces --no-create-info hydrospark 2>/dev/null | gzip > /tmp/hydrospark_data.sql.gz"
docker cp hydrospark-mysql:/tmp/hydrospark_data.sql.gz backend/seed_data/hydrospark_data.sql.gz
```

**2. Commit and push the new snapshot:**

```bash
git add backend/seed_data/hydrospark_data.sql.gz
git commit -m "Update database snapshot"
git push
```

---

### When a teammate has pushed a new snapshot and you want to get it

**1. Pull the latest changes:**

```bash
git pull
```

**2. Wipe your local database and reload from the new snapshot:**

```bash
docker-compose down -v
docker-compose up
```

> The `-v` flag deletes your local database volume. The new snapshot loads automatically on startup.
> This will take a minute or two — wait until you see `frontend | Compiled successfully!` before opening the app.

---

## What Each Tab Does

### For Customers

| Tab | What it shows |
|-----|--------------|
| **Dashboard** | Usage summary, recent bills, active alerts, and neighborhood comparison by zip code |
| **Usage** | Daily usage chart, monthly breakdown, and cost estimates |
| **Bills** | All past bills — click any row to expand full invoice details |
| **Forecasts** | Generate a 12-month ML usage and cost prediction |

### For Billing / Support

| Tab | What it shows |
|-----|--------------|
| **Billing** | All customer bills with filters, stats cards, and inline invoice expansion |
| **Alerts** | Anomaly alerts — acknowledge, dispatch to field, or apply bill credits |
| **Inbox** | Direct messages with customers and broadcast notifications |
| **Usage** | Full usage data across all customers |

### For Admins (all of the above, plus)

| Tab | What it shows |
|-----|--------------|
| **Admin** | User management, data import, bill generation, anomaly detection, zip code rates, and water shutoff management |

### For Field Technicians

| Tab | What it shows |
|-----|--------------|
| **Work Orders** | Open dispatched jobs with customer address, usage overage, and dispatch notes — mark complete with field notes |

### HydroBot (all users)

A floating chat assistant is available on every page. Click the chat icon in the bottom-right corner to ask questions about your usage, bills, forecasts, or account status. Admins can also query system-wide stats and look up customer accounts.

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
