"""
Email notifications module using SendGrid.
Falls back to console logging if SENDGRID_API_KEY is not set.
"""

import os
import logging
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("atomquest.notifications")

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@atomquest.com")


def send_email(to_email: str, subject: str, body_html: str):
    """
    Send an email via SendGrid. Falls back to console logging if API key is not configured.
    Designed to be called from FastAPI BackgroundTasks.
    """
    if not SENDGRID_API_KEY:
        logger.info(f"[EMAIL FALLBACK] To: {to_email}")
        logger.info(f"[EMAIL FALLBACK] Subject: {subject}")
        logger.info(f"[EMAIL FALLBACK] Body: {body_html}")
        print(f"\n{'='*60}")
        print(f"📧 EMAIL NOTIFICATION (SendGrid not configured)")
        print(f"To:      {to_email}")
        print(f"Subject: {subject}")
        print(f"Body:    {body_html}")
        print(f"{'='*60}\n")
        return

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=SENDGRID_FROM_EMAIL,
            to_emails=to_email,
            subject=subject,
            html_content=body_html,
        )
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"Email sent to {to_email}, status: {response.status_code}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")


def notify_goal_submitted(employee_name: str, manager_email: str, goal_count: int):
    """Notify manager when employee submits goals."""
    send_email(
        to_email=manager_email,
        subject="[Action Required] Goal Submission Pending Approval",
        body_html=f"""
        <h2>Goal Submission Pending Approval</h2>
        <p><strong>{employee_name}</strong> has submitted <strong>{goal_count}</strong> goal(s) for your review.</p>
        <p>Please log in to the <a href="#">AtomQuest Portal</a> to review and approve.</p>
        <p><a href="/manager/approve" style="background:#2563EB;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Review Goals</a></p>
        """,
    )


def notify_goals_approved(employee_email: str, employee_name: str):
    """Notify employee when manager approves their goals."""
    send_email(
        to_email=employee_email,
        subject="Your Goals Have Been Approved",
        body_html=f"""
        <h2>Goals Approved ✅</h2>
        <p>Hi {employee_name},</p>
        <p>Your goals have been approved and are now <strong>locked</strong> for this cycle.</p>
        <p>You can now start tracking your achievements in the check-in window.</p>
        """,
    )


def notify_goals_returned(employee_email: str, employee_name: str, comment: str):
    """Notify employee when manager returns goals for revision."""
    send_email(
        to_email=employee_email,
        subject="Your Goals Need Revision",
        body_html=f"""
        <h2>Goals Returned for Revision</h2>
        <p>Hi {employee_name},</p>
        <p>Your manager has returned your goals with the following comment:</p>
        <blockquote style="border-left:3px solid #D97706;padding:10px;background:#FFFBEB;">
            {comment}
        </blockquote>
        <p><a href="/employee/goals" style="background:#2563EB;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Edit Goals</a></p>
        """,
    )


def notify_checkin_window_open(employee_email: str, employee_name: str, quarter: str):
    """Notify employee when a check-in window opens."""
    send_email(
        to_email=employee_email,
        subject=f"[Reminder] {quarter} Check-in Window Is Now Open",
        body_html=f"""
        <h2>{quarter} Check-in Window Open 📊</h2>
        <p>Hi {employee_name},</p>
        <p>The <strong>{quarter}</strong> check-in window is now open. Please update your achievement progress.</p>
        <p><a href="/employee/checkin" style="background:#2563EB;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Update Achievements</a></p>
        """,
    )
