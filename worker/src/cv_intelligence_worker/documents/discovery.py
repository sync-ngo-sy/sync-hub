from __future__ import annotations

import hashlib
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Sequence
from uuid import NAMESPACE_URL, uuid5

from ..domain.models import DocumentSource


SUPPORTED_SUFFIXES = {".pdf", ".docx", ".txt"}


@dataclass(frozen=True)
class DiscoveredDocument:
    path: Path
    sha256: str
    mime_type: str
    source_type: str


def compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def guess_mime_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(str(path))
    if mime_type:
        return mime_type
    suffix = path.suffix.lower()
    if suffix == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if suffix == ".pdf":
        return "application/pdf"
    if suffix == ".txt":
        return "text/plain"
    return "application/octet-stream"


def stable_document_id(tenant_id: str, source_path: str, sha256: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"{tenant_id}:{source_path}:{sha256}"))


def iter_document_paths(inputs: Sequence[str]) -> Iterator[tuple[Path, str]]:
    for raw in inputs:
        path = Path(raw).expanduser().resolve()
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file() and child.suffix.lower() in SUPPORTED_SUFFIXES:
                    yield child, "folder"
        elif path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES:
            yield path, "file"


def discover_documents(
    inputs: Sequence[str],
    tenant_id: str,
    ingestion_run_id: str,
    uploaded_by: str = "",
) -> List[DocumentSource]:
    discovered: List[DocumentSource] = []
    for path, source_type in iter_document_paths(inputs):
        sha256 = compute_sha256(path)
        mime_type = guess_mime_type(path)
        document_id = stable_document_id(tenant_id, str(path), sha256)
        discovered.append(
            DocumentSource(
                tenant_id=tenant_id,
                source_path=str(path),
                source_type=source_type,
                original_filename=path.name,
                mime_type=mime_type,
                document_id=document_id,
                document_sha256=sha256,
                ingestion_run_id=ingestion_run_id,
                uploaded_by=uploaded_by or None,
            )
        )
    return discovered
