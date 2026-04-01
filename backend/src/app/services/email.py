import asyncio
import html as html_mod
import logging
import re
import httpx
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ..core.config import get_settings
from ..core.i18n import translate as _t

settings = get_settings()
logger = logging.getLogger(__name__)
HTML_TAG_RE = re.compile(r"<[a-zA-Z][^>]*>")
DEFAULT_BREVO_SENDER_EMAIL = "lms@zedny.ai"

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
    &copy; SYRA LMS &nbsp;&bull;&nbsp; {_t("email_footer")}
  </div>
</div>
</body></html>"""


def _smtp_available():
    return all([settings.SMTP_HOST, settings.SMTP_PORT, settings.SMTP_FROM])


def _brevo_available():
    return bool((settings.BREVO_API_KEY or "").strip())


def _brevo_sender_email() -> str:
    configured_sender = (settings.BREVO_SENDER_EMAIL or settings.SMTP_FROM or "").strip()
    sender_candidates = [configured_sender, DEFAULT_BREVO_SENDER_EMAIL]

    for candidate in sender_candidates:
        sender_email = str(candidate or "").strip()
        if not sender_email:
            continue
        normalized = sender_email.lower()
        if normalized in {"noreply@yourdomain.com", "noreply@example.com", "noreply@localhost"}:
            continue
        return sender_email

    raise RuntimeError("Brevo sender email is not configured. Set BREVO_SENDER_EMAIL (or SMTP_FROM) to a verified sender.")


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


async def _send_email_once(subject: str, to: str, content: str) -> None:
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

        def _blocking_smtp_send():
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_TLS:
                    server.starttls()
                if settings.SMTP_USER and settings.SMTP_PASS:
                    server.login(settings.SMTP_USER, settings.SMTP_PASS)
                server.send_message(msg)

        await asyncio.to_thread(_blocking_smtp_send)
        return

    raise RuntimeError("Email transport not configured: set BREVO_API_KEY or SMTP settings.")


async def send_email(subject: str, to: str, content: str) -> bool:
    backoff_delays = (1, 2, 4)
    for attempt_number in range(1, len(backoff_delays) + 2):
        try:
            await _send_email_once(subject, to, content)
            return True
        except Exception as exc:
            logger.warning(
                "Email send attempt %s failed for %s: %s",
                attempt_number,
                to,
                exc,
            )
            if attempt_number <= len(backoff_delays):
                await asyncio.sleep(backoff_delays[attempt_number - 1])
                continue
            logger.critical(
                "Email delivery failed after %s attempts for %s: %s",
                attempt_number,
                to,
                exc,
                exc_info=True,
            )
            return False


# ── Email templates ──────────────────────────────────────────────────────────

async def send_welcome_email(user):
    name = html_mod.escape(getattr(user, "name", None) or "there")
    frontend = (settings.FRONTEND_BASE_URL or "http://localhost:5173").rstrip("/")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>{_t("email_welcome_greeting")}</p>
<p>{_t("email_welcome_body")}</p>
<a href="{frontend}/login" class="btn">{_t("email_welcome_button")}</a>
<hr class="divider">
<p class="note">{_t("email_welcome_ignore")}</p>
"""
    await send_email(
        subject=_t("email_welcome_subject"),
        to=user.email,
        content=_html_wrapper(_t("email_welcome_preheader"), body),
    )


async def send_admin_setup_email(admin):
    name = html_mod.escape(getattr(admin, "name", None) or "Admin")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>{_t("email_admin_greeting")}</p>
<p>{_t("email_admin_body")}</p>
<hr class="divider">
<p class="note">{_t("email_admin_footer")}</p>
"""
    await send_email(
        subject=_t("email_admin_subject"),
        to=admin.email,
        content=_html_wrapper(_t("email_admin_preheader"), body),
    )


async def send_password_changed_email(user):
    name = html_mod.escape(getattr(user, "name", None) or "there")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>{_t("email_pwd_changed_body")}</p>
<p>{_t("email_pwd_changed_warning")}</p>
"""
    await send_email(
        subject=_t("email_pwd_changed_subject"),
        to=user.email,
        content=_html_wrapper(_t("email_pwd_changed_preheader"), body),
    )


async def send_password_reset_email(user, token: str):
    name = html_mod.escape(getattr(user, "name", None) or "there")
    base = (settings.FRONTEND_BASE_URL or "http://localhost:5173").rstrip("/")
    reset_link = f"{base}/reset-password?token={token}"
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>{_t("email_pwd_reset_intro")}</p>
<p>{_t("email_pwd_reset_body")}</p>
<a href="{reset_link}" class="btn">{_t("email_pwd_reset_button")}</a>
<hr class="divider">
<p class="note">{_t("email_pwd_reset_ignore")}</p>
"""
    await send_email(
        subject=_t("email_pwd_reset_subject"),
        to=user.email,
        content=_html_wrapper(_t("email_pwd_reset_preheader"), body),
    )


async def send_exam_scheduled_email(user, exam, schedule):
    name = getattr(user, "name", None) or "there"
    title = getattr(exam, "title", "Exam")
    scheduled_at = getattr(schedule, "scheduled_at", "")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>{_t("email_scheduled_body")} <strong>{title}</strong></p>
<p><strong>{_t("email_scheduled_datetime", scheduled_at=scheduled_at)}</strong></p>
<p>{_t("email_scheduled_ready")}</p>
"""
    await send_email(
        subject=_t("email_scheduled_subject", title=title),
        to=user.email,
        content=_html_wrapper(_t("email_scheduled_preheader", title=title), body),
    )


async def send_attempt_submitted_email(user, attempt):
    name = getattr(user, "name", None) or "there"
    attempt_id = getattr(attempt, "id", "")
    body = f"""
<p>Hi <strong>{name}</strong>,</p>
<p>{_t("email_submitted_body")}</p>
<p>{_t("email_submitted_results")}</p>
<hr class="divider">
<p class="note">{_t("email_submitted_ref", attempt_id=attempt_id)}</p>
"""
    await send_email(
        subject=_t("email_submitted_subject"),
        to=user.email,
        content=_html_wrapper(_t("email_submitted_preheader"), body),
    )
