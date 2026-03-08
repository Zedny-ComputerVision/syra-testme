import re
import httpx
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ..core.config import get_settings

settings = get_settings()
HTML_TAG_RE = re.compile(r"<[a-zA-Z][^>]*>")

_BASE_STYLE = """
  body{margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif}
  .wrap{max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:#1a1f35;padding:32px 40px;text-align:center}
  .header h1{margin:0;color:#ffffff;font-size:22px;letter-spacing:.5px}
  .header span{color:#7c8db5;font-size:13px}
  .body{padding:36px 40px}
  .body p{margin:0 0 16px;color:#3d4461;font-size:15px;line-height:1.6}
  .btn{display:inline-block;margin:8px 0 20px;padding:13px 28px;background:#4f6ef7;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600}
  .note{font-size:13px;color:#8a94ad}
  .divider{border:none;border-top:1px solid #eaedf5;margin:24px 0}
  .footer{background:#f8f9fd;padding:20px 40px;text-align:center;font-size:12px;color:#aab1c8;border-top:1px solid #eaedf5}
"""


def _html_wrapper(preheader: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>{_BASE_STYLE}</style></head>
<body>
<div style="display:none;max-height:0;overflow:hidden">{preheader}</div>
<div class="wrap">
  <div class="header">
    <h1>SYRA LMS</h1>
    <span>Learning Management System</span>
  </div>
  <div class="body">{body_html}</div>
  <div class="footer">
    &copy; SYRA LMS &nbsp;&bull;&nbsp; This is an automated message, please do not reply.
  </div>
</div>
</body></html>"""


def _smtp_available():
    return all([settings.SMTP_HOST, settings.SMTP_PORT, settings.SMTP_FROM])


def _brevo_available():
    return bool((settings.BREVO_API_KEY or "").strip())


def _brevo_sender_email() -> str:
    sender_email = (settings.BREVO_SENDER_EMAIL or settings.SMTP_FROM or "").strip()
    if not sender_email:
        raise RuntimeError("Brevo sender email is not configured. Set BREVO_SENDER_EMAIL (or SMTP_FROM).")
    if sender_email.lower() == "noreply@yourdomain.com":
        raise RuntimeError("BREVO_SENDER_EMAIL is still the placeholder value. Set a verified sender email.")
    return sender_email


def get_email_delivery_status() -> tuple[bool, str | None]:
    if _brevo_available():
        try:
            _brevo_sender_email()
        except RuntimeError as exc:
            return False, str(exc)
        return True, None
    if _smtp_available():
        return True, None
    return False, "Email transport not configured: set BREVO_API_KEY or SMTP settings."


async def send_email(subject: str, to: str, content: str):
    if _brevo_available():
        api_key = (settings.BREVO_API_KEY or "").strip()
        headers = {
            "api-key": api_key,
            "accept": "application/json",
            "content-type": "application/json",
        }
        sender = {"email": _brevo_sender_email()}
        if settings.BREVO_SENDER_NAME:
            sender["name"] = settings.BREVO_SENDER_NAME
        payload = {
            "sender": sender,
            "to": [{"email": to}],
            "subject": subject,
        }
        if HTML_TAG_RE.search(content):
            payload["htmlContent"] = content
        else:
            payload["textContent"] = content
        if settings.BREVO_SANDBOX:
            payload["headers"] = {"X-Sib-Sandbox": "drop"}

        try:
            endpoint = f"{settings.BREVO_BASE_URL.rstrip('/')}/smtp/email"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(endpoint, headers=headers, json=payload)
                resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = (exc.response.text or "").strip() or exc.response.reason_phrase
            raise RuntimeError(f"Brevo send failed ({exc.response.status_code}): {detail}") from exc
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Brevo request failed: {exc}") from exc
        return

    if _smtp_available():
        if HTML_TAG_RE.search(content):
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.SMTP_FROM
            msg["To"] = to
            msg.attach(MIMEText(content, "html"))
        else:
            msg = MIMEText(content, "plain")
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

    raise RuntimeError("Email transport not configured: set BREVO_API_KEY or SMTP settings.")


# ── Email templates ──────────────────────────────────────────────────────────

async def send_welcome_email(user):
    name = getattr(user, "name", None) or "there"
    frontend = (settings.FRONTEND_BASE_URL or "http://localhost:5173").rstrip("/")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>Welcome to <strong>SYRA LMS</strong>! Your account has been created successfully.</p>
<p>You can now log in and start taking your exams.</p>
<a href="{frontend}/login" class="btn">Log In Now</a>
<hr class="divider">
<p class="note">If you did not create this account, you can safely ignore this email.</p>
"""
    await send_email(
        subject="Welcome to SYRA LMS — Your account is ready",
        to=user.email,
        content=_html_wrapper("Your SYRA LMS account has been created.", body),
    )


async def send_admin_setup_email(admin):
    name = getattr(admin, "name", None) or "Admin"
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>Your <strong>SYRA LMS</strong> admin account has been set up successfully.</p>
<p>You have full administrative access to manage exams, users, and system settings.</p>
<hr class="divider">
<p class="note">This message was generated automatically during initial system setup.</p>
"""
    await send_email(
        subject="SYRA LMS — Admin account ready",
        to=admin.email,
        content=_html_wrapper("Your admin account is ready.", body),
    )


async def send_password_changed_email(user):
    name = getattr(user, "name", None) or "there"
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>Your <strong>SYRA LMS</strong> password was changed successfully.</p>
<p>If you did not make this change, please contact your administrator immediately.</p>
"""
    await send_email(
        subject="SYRA LMS — Password changed",
        to=user.email,
        content=_html_wrapper("Your password was changed.", body),
    )


async def send_password_reset_email(user, token: str):
    name = getattr(user, "name", None) or "there"
    base = (settings.FRONTEND_BASE_URL or "http://localhost:5173").rstrip("/")
    reset_link = f"{base}/reset-password?token={token}"
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>We received a request to reset your <strong>SYRA LMS</strong> password.</p>
<p>Click the button below to choose a new password. This link expires in 60 minutes.</p>
<a href="{reset_link}" class="btn">Reset My Password</a>
<hr class="divider">
<p class="note">If you didn't request a password reset, you can safely ignore this email — your password will not be changed.</p>
"""
    await send_email(
        subject="SYRA LMS — Reset your password",
        to=user.email,
        content=_html_wrapper("Reset your SYRA LMS password.", body),
    )


async def send_exam_scheduled_email(user, exam, schedule):
    name = getattr(user, "name", None) or "there"
    title = getattr(exam, "title", "Exam")
    scheduled_at = getattr(schedule, "scheduled_at", "")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>Your exam <strong>{title}</strong> has been scheduled.</p>
<p><strong>Date &amp; Time:</strong> {scheduled_at}</p>
<p>Please make sure you are ready before your scheduled time.</p>
"""
    await send_email(
        subject=f"SYRA LMS — Exam scheduled: {title}",
        to=user.email,
        content=_html_wrapper(f"Your exam {title} is scheduled.", body),
    )


async def send_attempt_submitted_email(user, attempt):
    name = getattr(user, "name", None) or "there"
    attempt_id = getattr(attempt, "id", "")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>Your exam attempt has been submitted successfully.</p>
<p>Your results will be available once grading is complete.</p>
<hr class="divider">
<p class="note">Attempt reference: {attempt_id}</p>
"""
    await send_email(
        subject="SYRA LMS — Attempt submitted",
        to=user.email,
        content=_html_wrapper("Your attempt was submitted.", body),
    )
