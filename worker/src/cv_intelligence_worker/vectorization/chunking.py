from __future__ import annotations

from ..core.identifiers import stable_uuid
from ..core.text import approximate_token_count
from ..domain.models import CandidateProfile, ChunkRecord


MAX_TOKENS = 450
OVERLAP_TOKENS = 50


def _split_text(text: str, max_tokens: int = MAX_TOKENS, overlap_tokens: int = OVERLAP_TOKENS) -> list[str]:
    words = text.split()
    if len(words) <= max_tokens:
        return [text.strip()]
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(len(words), start + max_tokens)
        chunk = " ".join(words[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end == len(words):
            break
        start = max(0, end - overlap_tokens)
    return chunks


def _record(candidate_id: str, tenant_id: str, chunk_type: str, section_name: str, chunk_index: int, text: str, metadata: dict) -> ChunkRecord:
    return ChunkRecord(
        tenant_id=tenant_id,
        candidate_id=candidate_id,
        chunk_id=stable_uuid(candidate_id, chunk_type, str(chunk_index), text[:120]),
        chunk_type=chunk_type,
        section_name=section_name,
        chunk_index=chunk_index,
        text=text,
        token_count=approximate_token_count(text),
        metadata=metadata,
    )


def build_chunks(profile: CandidateProfile, chunk_version: str) -> list[ChunkRecord]:
    chunks: list[ChunkRecord] = []
    counter = 0

    overview_lines = [
        f"Candidate: {profile.name}",
        f"Title: {profile.current_title}",
        f"Headline: {profile.headline}",
        f"Seniority: {profile.seniority}",
        f"Years of experience: {profile.years_experience}",
        f"Location: {profile.location}",
        f"Role tags: {', '.join(profile.role_tags)}",
        f"Skills: {', '.join(profile.skills)}",
    ]
    overview = "\n".join(line for line in overview_lines if not line.endswith(": "))
    chunks.append(_record(profile.candidate_id, profile.tenant_id, "profile_overview", "overview", counter, overview, {"chunk_version": chunk_version}))
    counter += 1

    if profile.summary:
        for part in _split_text(profile.summary):
            chunks.append(_record(profile.candidate_id, profile.tenant_id, "summary", "summary", counter, part, {"chunk_version": chunk_version}))
            counter += 1

    if profile.skills:
        skills_text = "Skills: " + ", ".join(profile.skills)
        chunks.append(_record(profile.candidate_id, profile.tenant_id, "skills", "skills", counter, skills_text, {"chunk_version": chunk_version}))
        counter += 1

    for entry in profile.experience:
        base = "\n".join(
            filter(
                None,
                [
                    f"Title: {entry.title}",
                    f"Company: {entry.company}",
                    f"Dates: {entry.start_date or ''} - {entry.end_date or ''}".strip(),
                    f"Location: {entry.location or ''}".strip(),
                    f"Details: {entry.description}",
                ],
            )
        )
        for part in _split_text(base):
            chunks.append(_record(profile.candidate_id, profile.tenant_id, "experience", "experience", counter, part, {"company": entry.company, "chunk_version": chunk_version}))
            counter += 1

    for entry in profile.projects:
        base = "\n".join(filter(None, [f"Project: {entry.name}", f"Technologies: {', '.join(entry.technologies)}", f"Details: {entry.description}"]))
        for part in _split_text(base):
            chunks.append(_record(profile.candidate_id, profile.tenant_id, "project", "projects", counter, part, {"project_name": entry.name, "chunk_version": chunk_version}))
            counter += 1

    for entry in profile.education:
        base = "\n".join(filter(None, [f"Degree: {entry.degree}", f"Institution: {entry.institution}", f"Field: {entry.field}", f"Dates: {entry.start_date or ''} - {entry.end_date or ''}".strip(), f"Details: {entry.description}"]))
        chunks.append(_record(profile.candidate_id, profile.tenant_id, "education", "education", counter, base, {"institution": entry.institution, "chunk_version": chunk_version}))
        counter += 1

    return chunks
