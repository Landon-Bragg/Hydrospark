"""
Chat route - ReAct agent using Groq (free) for water data queries
Uses Groq's OpenAI-compatible API with llama-3.1-8b-instant
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, Bill, WaterUsage, AnomalyAlert, UsageForecast
from datetime import datetime
from sqlalchemy import func, desc, or_
import json
import os

chat_bp = Blueprint('chat', __name__)

CUSTOMER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_usage_summary",
            "description": "Get recent monthly water usage totals for the current customer",
            "parameters": {
                "type": "object",
                "properties": {
                    "months": {"type": "integer", "description": "Number of recent months (default 3)"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_bills",
            "description": "Get bill history and outstanding balance for the current customer",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Filter: pending, overdue, paid, or omit for all"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_alerts",
            "description": "Get usage anomaly alerts for the current customer",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_forecasts",
            "description": "Get upcoming usage forecasts for the current customer",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
]

ADMIN_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_system_stats",
            "description": "Get system-wide stats: total customers, total revenue, open alerts, shutoff accounts",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_customer",
            "description": "Search for customers by name, email, or location ID",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Name, email, or location ID to search for"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_delinquent_accounts",
            "description": "Get customers with overdue bills or water shutoff/pending status",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
]

def execute_tool(name, inputs, user, customer):
    if name == "get_usage_summary":
        if not customer:
            return {"error": "No customer profile"}
        months = inputs.get("months", 3)
        rows = (
            db.session.query(
                func.year(WaterUsage.usage_date).label("year"),
                func.month(WaterUsage.usage_date).label("month"),
                func.sum(WaterUsage.daily_usage_ccf).label("total"),
            )
            .filter(WaterUsage.customer_id == customer.id)
            .group_by(func.year(WaterUsage.usage_date), func.month(WaterUsage.usage_date))
            .order_by(desc(func.year(WaterUsage.usage_date)), desc(func.month(WaterUsage.usage_date)))
            .limit(months)
            .all()
        )
        return {
            "customer": customer.customer_name,
            "type": customer.customer_type,
            "monthly_usage_ccf": [
                {"year": r.year, "month": r.month, "usage_ccf": round(float(r.total), 2)}
                for r in rows
            ],
        }

    if name == "get_bills":
        if not customer:
            return {"error": "No customer profile"}
        status = inputs.get("status", "")
        q = Bill.query.filter_by(customer_id=customer.id)
        if status:
            q = q.filter_by(status=status)
        bills = q.order_by(Bill.billing_period_end.desc()).limit(10).all()
        total_owed = sum(float(b.total_amount) for b in bills if b.status in ("pending", "overdue"))
        return {
            "total_owed": round(total_owed, 2),
            "bills": [
                {
                    "id": b.id,
                    "period": f"{b.billing_period_start} to {b.billing_period_end}",
                    "amount_usd": float(b.total_amount),
                    "status": b.status,
                    "due": str(b.due_date),
                }
                for b in bills
            ],
        }

    if name == "get_alerts":
        if not customer:
            return {"error": "No customer profile"}
        alerts = (
            AnomalyAlert.query.filter_by(customer_id=customer.id)
            .order_by(AnomalyAlert.created_at.desc())
            .limit(5)
            .all()
        )
        return {
            "alerts": [
                {
                    "type": a.alert_type,
                    "date": str(a.alert_date),
                    "usage_ccf": float(a.usage_ccf),
                    "expected_ccf": float(a.expected_usage_ccf),
                    "status": a.status,
                }
                for a in alerts
            ]
        }

    if name == "get_forecasts":
        if not customer:
            return {"error": "No customer profile"}
        forecasts = (
            UsageForecast.query.filter_by(customer_id=customer.id)
            .order_by(UsageForecast.forecast_date.desc())
            .limit(3)
            .all()
        )
        return {
            "forecasts": [
                {
                    "date": str(f.forecast_date),
                    "predicted_ccf": float(f.predicted_usage_ccf),
                    "predicted_amount_usd": float(f.predicted_amount),
                }
                for f in forecasts
            ]
        }

    if name == "get_system_stats":
        total_customers = Customer.query.count()
        total_revenue = (
            db.session.query(func.sum(Bill.total_amount)).filter(Bill.status == "paid").scalar() or 0
        )
        open_alerts = AnomalyAlert.query.filter_by(status="new").count()
        shutoff_count = Customer.query.filter(Customer.water_status != "active").count()
        return {
            "total_customers": total_customers,
            "revenue_paid_usd": round(float(total_revenue), 2),
            "open_alerts": open_alerts,
            "shutoff_or_pending_count": shutoff_count,
        }

    if name == "search_customer":
        q = inputs.get("query", "")
        results = (
            Customer.query.join(User, User.id == Customer.user_id)
            .filter(
                or_(
                    Customer.customer_name.ilike(f"%{q}%"),
                    User.email.ilike(f"%{q}%"),
                    Customer.location_id.ilike(f"%{q}%"),
                )
            )
            .limit(5)
            .all()
        )
        return {
            "customers": [
                {
                    "id": c.id,
                    "name": c.customer_name,
                    "type": c.customer_type,
                    "location_id": c.location_id,
                    "water_status": c.water_status or "active",
                }
                for c in results
            ]
        }

    if name == "get_delinquent_accounts":
        rows = (
            db.session.query(
                Customer.id,
                Customer.customer_name,
                Customer.water_status,
                func.count(Bill.id).label("overdue_count"),
                func.sum(Bill.total_amount).label("total_owed"),
            )
            .join(Bill, Bill.customer_id == Customer.id)
            .filter(Bill.status == "overdue")
            .group_by(Customer.id, Customer.customer_name, Customer.water_status)
            .order_by(desc("total_owed"))
            .limit(10)
            .all()
        )
        return {
            "delinquent": [
                {
                    "id": r.id,
                    "name": r.customer_name,
                    "water_status": r.water_status or "active",
                    "overdue_bills": r.overdue_count,
                    "total_owed_usd": round(float(r.total_owed), 2),
                }
                for r in rows
            ]
        }

    return {"error": f"Unknown tool: {name}"}


# ---------------------------------------------------------------------------
# Hard-coded pre-flight guard — these requests never reach the LLM
# ---------------------------------------------------------------------------
_ACTION_PHRASES = [
    "send someone", "send a tech", "send out", "send a plumber", "send a crew",
    "send an inspector", "send a person", "send somebody",
    "dispatch", "come to my", "come out to", "come fix", "come check", "come by",
    "schedule an appointment", "schedule a visit", "schedule a tech", "book an appointment",
    "report an outage", "report a leak", "report a break", "report a problem",
    "file a complaint", "open a ticket", "submit a request", "put in a request",
    "turn on my water", "turn off my water", "restore my service",
    "fix my pipe", "fix my meter", "fix my leak", "repair my", "replace my",
    "burst pipe", "flooding", "no water at", "call me back", "call me at",
]

_CANNOT_DO = (
    "I can't help with that. I'm a read-only assistant — I can only look up your account data "
    "and answer billing questions. Please contact HydroSpark support directly for service "
    "requests, emergencies, or any account changes."
)


def _is_action_request(message: str) -> bool:
    msg = message.lower()
    return any(phrase in msg for phrase in _ACTION_PHRASES)


@chat_bp.route("/message", methods=["POST"])
@jwt_required()
def chat_message():
    try:
        from openai import OpenAI

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return jsonify({"error": "Chat service not configured (missing GROQ_API_KEY)"}), 503

        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        customer = getattr(user, "customer", None)

        data = request.get_json()
        message = (data.get("message") or "").strip()
        history = data.get("history", [])

        if not message:
            return jsonify({"error": "Message required"}), 400

        # Hard block — never reaches the LLM
        if _is_action_request(message):
            return jsonify({"response": _CANNOT_DO})

        client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )

        is_admin = user.role in ("admin", "billing")
        tools = CUSTOMER_TOOLS + (ADMIN_TOOLS if is_admin else [])

        customer_name = customer.customer_name if customer else user.email
        system_prompt = (
            f"You are HydroBot, a strictly limited read-only assistant for HydroSpark Water Utility. "
            f"You are speaking with {customer_name} (role: {user.role}). "
            f"The current date and time is {datetime.now().strftime('%A, %B %d, %Y at %I:%M %p')}.\n\n"
            "IMPORTANT — DATASET NOTE: The usage and billing records in this system may contain dates "
            "that appear to be in the future relative to today. This is expected — the dataset was "
            "pre-loaded with projected data. When referencing records, report the dates as shown in "
            "the data without remarking that they are 'future' dates.\n\n"

            "YOUR ONLY ALLOWED FUNCTIONS:\n"
            "1. Look up this account's data using the provided tools (usage, bills, alerts, forecasts).\n"
            "2. Answer factual FAQ questions about water billing policy listed below.\n"
            "Nothing else. You have no other capabilities.\n\n"

            "YOU ABSOLUTELY CANNOT:\n"
            "- Dispatch, schedule, or promise any technician, crew, or physical visit.\n"
            "- Accept payments or change account details.\n"
            "- Report outages, leaks, or emergencies — always direct to support for these.\n"
            "- Answer questions unrelated to this water account.\n"
            "- Speculate, estimate, or invent anything not returned by a tool.\n\n"

            "IF ASKED TO DO ANYTHING ON THAT LIST, reply with exactly this and nothing more:\n"
            "'I can't help with that. Please contact HydroSpark support directly.'\n\n"

            "RESPONSE RULES:\n"
            "- Maximum 2-3 sentences.\n"
            "- Use only exact numbers from tool results — never estimate.\n"
            "- If a tool returns no data, say so plainly (e.g. 'You have no unpaid bills.').\n"
            "- Do not repeat the user's question.\n\n"

            "BILLING FAQ:\n"
            "- Usage is measured in CCF (hundred cubic feet). 1 CCF ≈ 748 gallons.\n"
            "- Default rate: $5.72/CCF for all customer types. Some accounts have a custom rate.\n"
            "- Bills are generated monthly. Payment is due 30 days after issuance.\n"
            "- 'Pending' = generated but not yet sent. 'Sent' = delivered to customer.\n"
            "- Anomaly alerts fire when daily usage exceeds 100% above the expected baseline.\n"
            "- 'Pending shutoff' = delinquent account, service may be interrupted. 'Shutoff' = suspended.\n"
            "- To dispute a bill or make account changes, contact the billing team — I cannot do this.\n"
            "- Forecasts are ML-generated predictions based on historical usage patterns.\n"
        )

        messages = [{"role": "system", "content": system_prompt}]
        for m in history[-6:]:
            messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": message})

        # ReAct loop — max 4 tool calls
        for _ in range(4):
            response = client.chat.completions.create(
                model="llama3-groq-8b-8192-tool-use-preview",
                messages=messages,
                tools=tools,
                tool_choice="auto",
                max_tokens=300,
            )

            choice = response.choices[0]

            if choice.finish_reason == "tool_calls":
                messages.append(choice.message)
                for tc in choice.message.tool_calls:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                    result = execute_tool(tc.function.name, args, user, customer)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result),
                    })
            else:
                # stop or anything else — return the text response
                text = choice.message.content or ""
                # Strip any leaked tool-call syntax the model may have emitted as text
                import re
                text = re.sub(r'=?</?function[^>]*>', '', text)
                text = re.sub(r'\{["\']?name["\']?\s*:\s*["\']?\w+["\']?.*?\}', '', text, flags=re.DOTALL)
                text = text.strip()
                return jsonify({"response": text or "I couldn't find that information."})

        final = response.choices[0].message.content or "I couldn't find that information."
        return jsonify({"response": final})

    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": "Chat service unavailable"}), 500
