from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ManatalCandidate:
    id: str
    full_name: str = ""
    email: str = ""
    resume_url: str = ""
    updated_at: str = ""
    created_at: str = ""
    current_company: str = ""
    current_position: str = ""
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class ManatalResumeDownload:
    candidate: ManatalCandidate
    path: Path
    sha256: str
    mime_type: str
    resume_url: str
