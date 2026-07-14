"""Deterministic CV file generator for testing.

Produces PDF, DOCX, and TXT files containing the same known profile so
parsers can be validated against a fixed ground-truth dataset.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

EXPECTED_PROFILE: dict[str, object] = {
    "name": "Ahmed Alaydi",
    "current_title": "Senior Backend Engineer",
    "skills": ["Python", "PostgreSQL", "GraphQL"],
    "experience": [
        {
            "company": "Acme Corp",
            "title": "Backend Developer",
            "start_date": "2020-01",
            "end_date": "2024-06",
            "description": "Built REST APIs and data pipelines",
        }
    ],
    "email": "ahmed@example.com",
}


def _cv_text_lines() -> list[str]:
    """Return the canonical text lines shared across all formats."""
    p = EXPECTED_PROFILE
    exp = p["experience"][0]  # type: ignore[index]
    skills = ", ".join(p["skills"])  # type: ignore[arg-type]
    return [
        p["name"],  # type: ignore[index]
        p["current_title"],  # type: ignore[index]
        f"Email: {p['email']}",
        "",
        "Skills",
        skills,
        "",
        "Experience",
        f'{exp["title"]} at {exp["company"]}',
        f'{exp["start_date"]} - {exp["end_date"]}',
        exp["description"],
    ]


def _make_pdf(path: Path) -> None:
    """Write a minimal PDF with the profile text."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    y = height - 50
    for line in _cv_text_lines():
        c.drawString(50, y, line)
        y -= 20
    c.save()


def _make_docx(path: Path) -> None:
    """Write a DOCX with the profile text."""
    from docx import Document

    doc = Document()
    for line in _cv_text_lines():
        doc.add_paragraph(line)
    doc.save(str(path))


def _make_txt(path: Path) -> None:
    """Write a plain-text file with the profile text."""
    path.write_text("\n".join(_cv_text_lines()), encoding="utf-8")


def make_cv_file(ext: str) -> Path:
    """Create a temp CV file in the given format and return its path.

    Supported extensions: ``pdf``, ``docx``, ``txt``.
    The caller is responsible for cleanup.
    """
    ext = ext.lower().lstrip(".")
    if ext not in {"pdf", "docx", "txt"}:
        msg = f"Unsupported extension: {ext!r} (expected pdf, docx, or txt)"
        raise ValueError(msg)

    suffix = f".{ext}"
    tmpfile = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=tempfile.gettempdir())
    tmpfile.close()
    path = Path(tmpfile.name)

    builders = {"pdf": _make_pdf, "docx": _make_docx, "txt": _make_txt}
    builders[ext](path)
    return path
