import httpx
import smtplib
from email.mime.text import MIMEText
from ..core.config import get_settings

settings = get_settings()


def _smtp_available():
    return all([settings.SMTP_HOST, settings.SMTP_PORT, settings.SMTP_FROM])


async def send_email(subject: str, to: str, content: str):
    # Prefer Brevo if configured
    if settings.BREVO_API_KEY and not settings.BREVO_SANDBOX:
        headers = {
            "api-key": settings.BREVO_API_KEY,
            "accept": "application/json",
            "content-type": "application/json",
        }
        payload = {
            "sender": {"email": settings.BREVO_SENDER_EMAIL or settings.SMTP_FROM},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": content,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post("https://api.brevo.com/v3/smtp/email", headers=headers, json=payload)
            resp.raise_for_status()
        return

    # Fall back to SMTP if available
    if _smtp_available():
        msg = MIMEText(content, "html")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_TLS:
                server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASS:
                server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.send_message(msg)
        return

    # No transport configured
    raise RuntimeError("Email transport not configured: set BREVO_API_KEY or SMTP settings.")


async def send_welcome_email(user):
    await send_email("Welcome to SYRA LMS", user.email, "Welcome!")


async def send_admin_setup_email(admin):
    await send_email("Admin setup complete", admin.email, "Your admin account is ready")


async def send_password_changed_email(user):
    await send_email("Password changed", user.email, "Your password has been updated")


async def send_password_reset_email(user, token: str):
    base = settings.FRONTEND_BASE_URL or "https://example.com"
    reset_link = f"{base.rstrip('/')}/reset-password?token={token}"
    await send_email("Reset your password", user.email, f"Reset link: {reset_link}")


async def send_exam_scheduled_email(user, exam, schedule):
    await send_email("Exam scheduled", user.email, f"Exam {exam.title} scheduled at {schedule.scheduled_at}")


async def send_attempt_submitted_email(user, attempt):
    await send_email("Attempt submitted", user.email, f"Attempt {attempt.id} submitted")
