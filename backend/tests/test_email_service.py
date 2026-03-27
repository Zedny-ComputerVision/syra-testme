from app.services import email as email_service


def test_email_delivery_status_uses_verified_default_brevo_sender(monkeypatch):
    monkeypatch.setattr(email_service.settings, "BREVO_API_KEY", "brevo-key")
    monkeypatch.setattr(email_service.settings, "BREVO_SENDER_EMAIL", "noreply@localhost")
    monkeypatch.setattr(email_service.settings, "SMTP_FROM", None)

    ready, error = email_service.get_email_delivery_status()

    assert ready is True
    assert error is None
    assert email_service._brevo_sender_email() == "lms@zedny.ai"


def test_email_delivery_status_prefers_configured_sender_when_valid(monkeypatch):
    monkeypatch.setattr(email_service.settings, "BREVO_API_KEY", "brevo-key")
    monkeypatch.setattr(email_service.settings, "BREVO_SENDER_EMAIL", "ops@zedny.ai")
    monkeypatch.setattr(email_service.settings, "SMTP_FROM", None)

    assert email_service._brevo_sender_email() == "ops@zedny.ai"
