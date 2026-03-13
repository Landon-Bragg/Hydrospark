"""
Chat route - ReAct agent using Groq (free) for water data queries
Uses Groq's OpenAI-compatible API with llama-3.1-8b-instant
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db, User, Customer, Bill, WaterUsage, AnomalyAlert, UsageForecast
from datetime import date
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
            .group_by("year", "month")
            .order_by(desc("year"), desc("month"))
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


@chat_bp.route("/message", methods=["POST"])
@jwt_required()
def chat_message():
    try:
        from openai import OpenAI

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return jsonify({"error": "Chat service not configured (missing GROQ_API_KEY)"}), 503

        client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )

        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        customer = getattr(user, "customer", None)

        data = request.get_json()
        message = (data.get("message") or "").strip()
        history = data.get("history", [])

        if not message:
            return jsonify({"error": "Message required"}), 400

        is_admin = user.role in ("admin", "billing")
        tools = CUSTOMER_TOOLS + (ADMIN_TOOLS if is_admin else [])

        customer_name = customer.customer_name if customer else user.email
        system_prompt = (
            f"You are HydroBot, a water billing assistant for {customer_name}. "
            "Answer questions about water usage, bills, forecasts, and alerts using available tools. "
            "Be concise — 1 to 3 sentences. Use exact numbers from tool results. Do not repeat the question. "
            f"Today is {date.today().isoformat()}. User role: {user.role}."
        )

        messages = [{"role": "system", "content": system_prompt}]
        for m in history[-6:]:
            messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": message})

        # ReAct loop — max 4 tool calls
        for _ in range(4):
            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=messages,
                tools=tools,
                tool_choice="auto",
                max_tokens=300,
            )

            choice = response.choices[0]

            if choice.finish_reason == "stop":
                return jsonify({"response": choice.message.content or ""})

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
                break

        final = response.choices[0].message.content
        return jsonify({"response": final or "I couldn't find that information."})

    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": "Chat service unavailable"}), 500
