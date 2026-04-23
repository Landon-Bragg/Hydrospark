# HydroSpark Water Utility Management System

A water utility management platform with usage tracking, ML-based forecasting, anomaly detection, automated billing, and an AI assistant (HydroBot) for account support.

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
