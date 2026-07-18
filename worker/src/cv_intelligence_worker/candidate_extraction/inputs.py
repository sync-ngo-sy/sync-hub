from __future__ import annotations

from typing import Any

from ..schema import DocumentText
from .sectioning import extract_sections, render_sectioned_cv_text


def build_candidate_prompt(document_text: DocumentText) -> dict[str, Any]:
    sections = extract_sections(document_text.raw_text)
    return {
        "sectioned_cv_text": render_sectioned_cv_text(sections, max_chars=16000),
    }
