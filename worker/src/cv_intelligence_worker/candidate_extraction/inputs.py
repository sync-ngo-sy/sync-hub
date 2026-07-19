from __future__ import annotations

from typing import Any

from ..schema import DocumentText


def build_candidate_prompt(document_text: DocumentText) -> dict[str, Any]:
    return {
        "cv_text": document_text.raw_text.strip()[:16000],
    }
