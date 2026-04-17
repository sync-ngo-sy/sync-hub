from __future__ import annotations

from .schema import CandidateProfile, ComparisonArtifact, ComparisonItem, SummaryArtifact
from .utils import dedupe_keep_order, sha256_text


def build_summary_artifact(profile: CandidateProfile, artifact_version: str) -> SummaryArtifact:
    short_summary = profile.summary or f"{profile.current_title or 'Candidate'} with {int(profile.years_experience or 0)}+ years of experience."
    experience_text = f"{profile.years_experience:.0f}+ years" if profile.years_experience else "experience not fully quantified"
    long_summary = (
        f"{profile.name} is a {profile.seniority} candidate aligned to {', '.join(profile.role_tags)} roles. "
        f"Primary title: {profile.current_title or 'not explicitly stated'}. "
        f"Profile indicates {experience_text} across skills such as {', '.join(profile.skills[:8]) or 'not captured'}."
    )
    strengths = []
    if profile.current_title:
        strengths.append(f"Current title mapped as {profile.current_title}.")
    if profile.skills:
        strengths.append(f"Top skills include {', '.join(profile.skills[:6])}.")
    if profile.years_experience:
        strengths.append(f"Estimated experience is {profile.years_experience:.0f}+ years.")
    if profile.role_tags:
        strengths.append(f"Role tags inferred as {', '.join(profile.role_tags)}.")
    risks = []
    if not profile.email:
        risks.append("Contact email was not detected.")
    if not profile.location:
        risks.append("Location is missing or weakly inferred.")
    if not profile.summary:
        risks.append("Candidate summary was inferred heuristically.")
    if len(profile.skills) < 3:
        risks.append("Skill extraction returned a small evidence set.")
    recommended_roles = dedupe_keep_order(profile.role_tags + ([profile.current_title] if profile.current_title else []))
    evidence_refs = [entry.company or entry.title for entry in profile.experience[:3]]
    confidence = min(0.95, max(profile.confidence, 0.4) + (0.1 if profile.skills else 0) + (0.1 if profile.experience else 0))
    return SummaryArtifact(
        tenant_id=profile.tenant_id,
        candidate_id=profile.candidate_id,
        short_summary=short_summary,
        long_summary=long_summary,
        strengths=strengths[:5],
        risks=risks[:5],
        recommended_roles=recommended_roles[:6],
        evidence_refs=evidence_refs,
        confidence=round(confidence, 2),
        artifact_version=artifact_version,
    )


def comparison_key(tenant_id: str, candidate_ids: list[str], query: str = "") -> str:
    canonical = "|".join(sorted(candidate_ids)) + "|" + query.strip().lower()
    return sha256_text(f"{tenant_id}:{canonical}")


def build_comparison_artifact(profiles: list[CandidateProfile], artifact_version: str, query: str = "") -> ComparisonArtifact:
    scored_items: list[ComparisonItem] = []
    overlap = sorted(set.intersection(*(set(profile.skills) for profile in profiles))) if profiles and all(profile.skills for profile in profiles) else []
    ranked = sorted(
        profiles,
        key=lambda profile: (profile.years_experience, len(profile.skills), len(profile.role_tags)),
        reverse=True,
    )
    recommended = ranked[0] if ranked else None
    for profile in ranked:
        score = round(profile.years_experience + len(profile.skills) * 0.2 + len(profile.role_tags) * 0.5, 3)
        gaps = []
        if query:
            for token in [part.strip() for part in query.split() if len(part.strip()) > 3]:
                if token.lower() not in " ".join(profile.skills + profile.role_tags + [profile.current_title, profile.summary]).lower():
                    gaps.append(token)
        scored_items.append(
            ComparisonItem(
                candidate_id=profile.candidate_id,
                score=score,
                matched_skills=[skill for skill in profile.skills if skill in overlap][:8],
                gaps=dedupe_keep_order(gaps)[:8],
                evidence_refs=[entry.company or entry.title for entry in profile.experience[:3]],
            )
        )
    overall_summary = (
        f"Compared {len(profiles)} candidates. "
        f"Shared strengths center on {', '.join(overlap[:6]) or 'limited overlapping skills'}. "
        f"Recommended candidate: {recommended.name if recommended else 'n/a'}."
    )
    return ComparisonArtifact(
        tenant_id=profiles[0].tenant_id if profiles else "",
        candidate_ids=[profile.candidate_id for profile in ranked],
        overall_summary=overall_summary,
        items=scored_items,
        overlap=overlap[:12],
        recommended_candidate_id=recommended.candidate_id if recommended else "",
        evidence_refs=[item for profile in ranked for item in [entry.company or entry.title for entry in profile.experience[:1]]],
        artifact_version=artifact_version,
    )
