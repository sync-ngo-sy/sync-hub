from __future__ import annotations

from dataclasses import asdict, dataclass, field as dc_field
from typing import Any, Dict, List, Optional, Sequence


def dataclass_to_dict(value: Any) -> Any:
    if hasattr(value, "__dataclass_fields__"):
        return {key: dataclass_to_dict(item) for key, item in asdict(value).items()}
    if isinstance(value, list):
        return [dataclass_to_dict(item) for item in value]
    if isinstance(value, tuple):
        return [dataclass_to_dict(item) for item in value]
    if isinstance(value, dict):
        return {key: dataclass_to_dict(item) for key, item in value.items()}
    return value


@dataclass(frozen=True)
class DocumentSource:
    tenant_id: str
    source_path: str
    source_type: str
    original_filename: str
    mime_type: str
    document_id: str
    document_sha256: str
    ingestion_run_id: str
    uploaded_by: Optional[str] = None
    metadata: Dict[str, Any] = dc_field(default_factory=dict)


@dataclass(frozen=True)
class DocumentText:
    source: Optional[DocumentSource]
    raw_text: str
    parser_name: str
    parser_version: str
    page_texts: List[str] = dc_field(default_factory=list)
    warnings: List[str] = dc_field(default_factory=list)


@dataclass(frozen=True)
class ExperienceEntry:
    company: str
    title: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: str = ""
    location: Optional[str] = None
    evidence_lines: List[int] = dc_field(default_factory=list)


@dataclass(frozen=True)
class EducationEntry:
    institution: str
    degree: str = ""
    field: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: str = ""
    evidence_lines: List[int] = dc_field(default_factory=list)


@dataclass(frozen=True)
class ProjectEntry:
    name: str
    description: str = ""
    technologies: List[str] = dc_field(default_factory=list)
    evidence_lines: List[int] = dc_field(default_factory=list)


@dataclass(frozen=True)
class CandidateProfile:
    tenant_id: str
    candidate_id: str
    source_document_id: str
    source_sha256: str
    name: str = ""
    current_title: str = ""
    headline: str = ""
    location: str = ""
    email: str = ""
    phone: str = ""
    links: List[str] = dc_field(default_factory=list)
    years_experience: float = 0.0
    seniority: str = "unclassified"
    role_tags: List[str] = dc_field(default_factory=list)
    skills: List[str] = dc_field(default_factory=list)
    skill_aliases: Dict[str, List[str]] = dc_field(default_factory=dict)
    experience: List[ExperienceEntry] = dc_field(default_factory=list)
    education: List[EducationEntry] = dc_field(default_factory=list)
    projects: List[ProjectEntry] = dc_field(default_factory=list)
    languages: List[str] = dc_field(default_factory=list)
    certifications: List[str] = dc_field(default_factory=list)
    summary: str = ""
    raw_text: str = ""
    metadata: Dict[str, Any] = dc_field(default_factory=dict)
    confidence: float = 0.0
    missing_fields: List[str] = dc_field(default_factory=list)
    parse_warnings: List[str] = dc_field(default_factory=list)


@dataclass(frozen=True)
class ChunkRecord:
    tenant_id: str
    candidate_id: str
    chunk_id: str
    chunk_type: str
    section_name: str
    chunk_index: int
    text: str
    token_count: int
    metadata: Dict[str, Any] = dc_field(default_factory=dict)
    source_span: Dict[str, Any] = dc_field(default_factory=dict)
    embedding: List[float] = dc_field(default_factory=list)
    embedding_version: str = ""
    embedding_provider: str = ""
    is_active: bool = True


@dataclass(frozen=True)
class EmbeddingRecord:
    tenant_id: str
    candidate_id: str
    chunk_id: str
    embedding: List[float]
    embedding_version: str
    provider: str = ""


@dataclass(frozen=True)
class SummaryArtifact:
    tenant_id: str
    candidate_id: str
    short_summary: str
    long_summary: str
    strengths: List[str]
    risks: List[str]
    recommended_roles: List[str]
    evidence_refs: List[str]
    confidence: float
    artifact_version: str


@dataclass(frozen=True)
class ComparisonItem:
    candidate_id: str
    score: float
    matched_skills: List[str]
    gaps: List[str]
    evidence_refs: List[str]


@dataclass(frozen=True)
class ComparisonArtifact:
    tenant_id: str
    candidate_ids: List[str]
    overall_summary: str
    items: List[ComparisonItem]
    overlap: List[str]
    recommended_candidate_id: str
    evidence_refs: List[str]
    artifact_version: str


@dataclass(frozen=True)
class ProcessingRun:
    tenant_id: str
    ingestion_run_id: str
    status: str
    input_hash: str
    source_path: str
    source_sha256: str
    parser_version: str
    model_version: str
    prompt_version: str
    chunk_version: str
    embedding_version: str
    warnings: List[str] = dc_field(default_factory=list)
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = dc_field(default_factory=dict)


@dataclass(frozen=True)
class ArtifactBundle:
    source: DocumentSource
    document_text: DocumentText
    profile: CandidateProfile
    chunks: List[ChunkRecord]
    embeddings: List[EmbeddingRecord]
    summary: SummaryArtifact
    processing_run: ProcessingRun


def list_of_dicts(values: Sequence[Any]) -> List[Dict[str, Any]]:
    return [dataclass_to_dict(value) for value in values]


def document_source_from_dict(data: Dict[str, Any]) -> DocumentSource:
    return DocumentSource(**data)


def document_text_from_dict(data: Dict[str, Any]) -> DocumentText:
    source = data.get("source")
    if isinstance(source, dict):
        source = document_source_from_dict(source)
    return DocumentText(
        source=source,
        raw_text=data.get("raw_text", ""),
        parser_name=data.get("parser_name", ""),
        parser_version=data.get("parser_version", ""),
        page_texts=list(data.get("page_texts", [])),
        warnings=list(data.get("warnings", [])),
    )


def experience_entry_from_dict(data: Dict[str, Any]) -> ExperienceEntry:
    return ExperienceEntry(**data)


def education_entry_from_dict(data: Dict[str, Any]) -> EducationEntry:
    return EducationEntry(**data)


def project_entry_from_dict(data: Dict[str, Any]) -> ProjectEntry:
    return ProjectEntry(**data)


def candidate_profile_from_dict(data: Dict[str, Any]) -> CandidateProfile:
    return CandidateProfile(
        tenant_id=data["tenant_id"],
        candidate_id=data["candidate_id"],
        source_document_id=data["source_document_id"],
        source_sha256=data["source_sha256"],
        name=data.get("name", ""),
        current_title=data.get("current_title", ""),
        headline=data.get("headline", ""),
        location=data.get("location", ""),
        email=data.get("email", ""),
        phone=data.get("phone", ""),
        links=list(data.get("links", [])),
        years_experience=float(data.get("years_experience", 0.0)),
        seniority=data.get("seniority", "unclassified"),
        role_tags=list(data.get("role_tags", [])),
        skills=list(data.get("skills", [])),
        skill_aliases=dict(data.get("skill_aliases", {})),
        experience=[experience_entry_from_dict(item) for item in data.get("experience", [])],
        education=[education_entry_from_dict(item) for item in data.get("education", [])],
        projects=[project_entry_from_dict(item) for item in data.get("projects", [])],
        languages=list(data.get("languages", [])),
        certifications=list(data.get("certifications", [])),
        summary=data.get("summary", ""),
        raw_text=data.get("raw_text", ""),
        metadata=dict(data.get("metadata", {})),
        confidence=float(data.get("confidence", 0.0)),
        missing_fields=list(data.get("missing_fields", [])),
        parse_warnings=list(data.get("parse_warnings", [])),
    )


def chunk_record_from_dict(data: Dict[str, Any]) -> ChunkRecord:
    return ChunkRecord(
        tenant_id=data["tenant_id"],
        candidate_id=data["candidate_id"],
        chunk_id=data["chunk_id"],
        chunk_type=data["chunk_type"],
        section_name=data["section_name"],
        chunk_index=int(data["chunk_index"]),
        text=data["text"],
        token_count=int(data["token_count"]),
        metadata=dict(data.get("metadata", {})),
        source_span=dict(data.get("source_span", {})),
        embedding=list(data.get("embedding", [])),
        embedding_version=data.get("embedding_version", ""),
        embedding_provider=data.get("embedding_provider", ""),
        is_active=bool(data.get("is_active", True)),
    )


def embedding_record_from_dict(data: Dict[str, Any]) -> EmbeddingRecord:
    return EmbeddingRecord(
        tenant_id=data["tenant_id"],
        candidate_id=data["candidate_id"],
        chunk_id=data["chunk_id"],
        embedding=list(data.get("embedding", [])),
        embedding_version=data.get("embedding_version", ""),
        provider=data.get("provider", ""),
    )


def summary_artifact_from_dict(data: Dict[str, Any]) -> SummaryArtifact:
    return SummaryArtifact(
        tenant_id=data["tenant_id"],
        candidate_id=data["candidate_id"],
        short_summary=data.get("short_summary", ""),
        long_summary=data.get("long_summary", ""),
        strengths=list(data.get("strengths", [])),
        risks=list(data.get("risks", [])),
        recommended_roles=list(data.get("recommended_roles", [])),
        evidence_refs=list(data.get("evidence_refs", [])),
        confidence=float(data.get("confidence", 0.0)),
        artifact_version=data.get("artifact_version", ""),
    )


def comparison_item_from_dict(data: Dict[str, Any]) -> ComparisonItem:
    return ComparisonItem(
        candidate_id=data["candidate_id"],
        score=float(data.get("score", 0.0)),
        matched_skills=list(data.get("matched_skills", [])),
        gaps=list(data.get("gaps", [])),
        evidence_refs=list(data.get("evidence_refs", [])),
    )


def comparison_artifact_from_dict(data: Dict[str, Any]) -> ComparisonArtifact:
    return ComparisonArtifact(
        tenant_id=data["tenant_id"],
        candidate_ids=list(data.get("candidate_ids", [])),
        overall_summary=data.get("overall_summary", ""),
        items=[comparison_item_from_dict(item) for item in data.get("items", [])],
        overlap=list(data.get("overlap", [])),
        recommended_candidate_id=data.get("recommended_candidate_id", ""),
        evidence_refs=list(data.get("evidence_refs", [])),
        artifact_version=data.get("artifact_version", ""),
    )


def processing_run_from_dict(data: Dict[str, Any]) -> ProcessingRun:
    return ProcessingRun(
        tenant_id=data["tenant_id"],
        ingestion_run_id=data["ingestion_run_id"],
        status=data["status"],
        input_hash=data["input_hash"],
        source_path=data["source_path"],
        source_sha256=data["source_sha256"],
        parser_version=data["parser_version"],
        model_version=data["model_version"],
        prompt_version=data["prompt_version"],
        chunk_version=data["chunk_version"],
        embedding_version=data["embedding_version"],
        warnings=list(data.get("warnings", [])),
        error_code=data.get("error_code"),
        error_message=data.get("error_message"),
        metadata=dict(data.get("metadata", {})),
    )


def artifact_bundle_from_dict(data: Dict[str, Any]) -> ArtifactBundle:
    return ArtifactBundle(
        source=document_source_from_dict(data["source"]),
        document_text=document_text_from_dict(data["document_text"]),
        profile=candidate_profile_from_dict(data["profile"]),
        chunks=[chunk_record_from_dict(item) for item in data.get("chunks", [])],
        embeddings=[embedding_record_from_dict(item) for item in data.get("embeddings", [])],
        summary=summary_artifact_from_dict(data["summary"]),
        processing_run=processing_run_from_dict(data["processing_run"]),
    )
