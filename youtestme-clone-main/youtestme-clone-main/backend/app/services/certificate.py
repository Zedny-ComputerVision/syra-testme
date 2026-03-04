from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
import io

async def generate_certificate_pdf(user_name: str, test_name: str, date_str: str) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=landscape(A4))
    width, height = landscape(A4)

    # Border
    c.setLineWidth(2)
    c.rect(20, 20, width - 40, height - 40)

    # Header
    c.setFont("Helvetica-Bold", 40)
    c.drawCentredString(width / 2, height - 120, "Certificate of Completion")

    # Content
    c.setFont("Helvetica", 20)
    c.drawCentredString(width / 2, height - 180, "This is to certify that")

    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(width / 2, height - 230, user_name)

    c.setFont("Helvetica", 20)
    c.drawCentredString(width / 2, height - 280, "has successfully completed the examination")

    c.setFont("Helvetica-Bold", 25)
    c.drawCentredString(width / 2, height - 330, test_name)

    c.setFont("Helvetica", 15)
    c.drawCentredString(width / 2, height - 380, f"Date: {date_str}")

    # Footer
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, 80, "YouTestMe Certification Authority")

    c.showPage()
    c.save()

    buffer.seek(0)
    return buffer.getvalue()
