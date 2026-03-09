from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape


_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "reports"
_ENV = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_report_template(template_name: str, **context) -> str:
    return _ENV.get_template(template_name).render(**context)
