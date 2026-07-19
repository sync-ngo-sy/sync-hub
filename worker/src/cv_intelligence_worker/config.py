from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path


def _env_any(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _bool_env(*names: str, default: bool = False) -> bool:
    value = _env_any(*names, default="")
    if not value:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _int_env(*names: str, default: str = "0") -> int:
    return int(_env_any(*names, default=default))


def _float_env(*names: str, default: str = "0") -> float:
    return float(_env_any(*names, default=default))


def _bytes_env(*names: str, default: int = 0) -> int:
    value = _env_any(*names, default=str(default))
    if not value:
        return default
    normalized = value.strip().lower().replace("_", "")
    match = re.fullmatch(r"(?P<number>\d+(?:\.\d+)?)(?P<unit>[kmgt]?i?b?)?", normalized)
    if not match:
        return int(normalized)
    number = float(match.group("number"))
    unit = match.group("unit") or ""
    multipliers = {
        "": 1,
        "b": 1,
        "k": 1024,
        "kb": 1024,
        "kib": 1024,
        "m": 1024**2,
        "mb": 1024**2,
        "mib": 1024**2,
        "g": 1024**3,
        "gb": 1024**3,
        "gib": 1024**3,
        "t": 1024**4,
        "tb": 1024**4,
        "tib": 1024**4,
    }
    return int(number * multipliers[unit])


def _default_cache_dir() -> str:
    return str(Path("./tmp") / "cv_intelligence_worker")


def _has_gemini_key() -> bool:
    return bool(_env_any("CV_MODEL_API_KEY", "CVI_MODEL_API_KEY", "GEMINI_API_KEY", default=""))


def _default_model_base_url() -> str:
    if _has_gemini_key():
        return "https://generativelanguage.googleapis.com/v1beta/openai"
    return "http://127.0.0.1:11434/v1"


def _default_model_api_key() -> str:
    return _env_any("GEMINI_API_KEY", default="local")


def _default_extraction_model() -> str:
    if _has_gemini_key():
        return "gemini-2.5-flash"
    return ""


def _default_embedding_model() -> str:
    if _has_gemini_key():
        return "gemini-embedding-001"
    return ""


def _default_embedding_provider() -> str:
    if _has_gemini_key():
        return "openai"
    return "openai-compatible"


def _default_embedding_version() -> str:
    model = _env_any("CV_EMBEDDING_MODEL", "CVI_EMBEDDING_MODEL", default=_default_embedding_model())
    if not model:
        return "embedding-unconfigured-v1"
    if model.startswith("gemini-embedding-"):
        dimension = _env_any("CV_EMBEDDING_DIMENSION", "CVI_EMBEDDING_DIMENSION", default="768")
        return f"{model}-{dimension}-v1"
    return f"{model}-v1"


def _default_model_version() -> str:
    extraction_model = _env_any("CV_EXTRACTION_MODEL", "CVI_EXTRACTION_MODEL", default=_default_extraction_model())
    if extraction_model:
        return f"{extraction_model}-v1"
    return "llm-unconfigured-v1"


def _default_prompt_version() -> str:
    return "structured-output-v3"


def _default_job_family_model() -> str:
    return _env_any("CV_JOB_FAMILY_MODEL", "CVI_JOB_FAMILY_MODEL", default=_default_extraction_model())


def _default_ingest_concurrency() -> str:
    return "8"


def _default_supabase_plan() -> str:
    return _env_any("CV_SUPABASE_PLAN", "CVI_SUPABASE_PLAN", "SUPABASE_PLAN", default="free").lower()


def _default_supabase_database_limit_bytes() -> int:
    plan = _default_supabase_plan()
    if plan == "free":
        return 500 * 1024 * 1024
    if plan in {"pro", "team"}:
        return 8 * 1024 * 1024 * 1024
    return 0


def _default_supabase_storage_limit_bytes() -> int:
    plan = _default_supabase_plan()
    if plan == "free":
        return 1 * 1024 * 1024 * 1024
    if plan in {"pro", "team"}:
        return 100 * 1024 * 1024 * 1024
    return 0


@dataclass(frozen=True)
class WorkerConfig:
    source_dir: str = field(default_factory=lambda: _env_any("CV_SOURCE_DIR", "CVI_SOURCE_DIR", default="./cvs"))
    tenant_id: str = field(default_factory=lambda: _env_any("CV_WORKER_TENANT_ID", "CVI_TENANT_ID"))
    api_key: str = field(default_factory=lambda: _env_any("WORKER_API_KEY", "API_KEY", default=""))
    uploaded_by: str = field(default_factory=lambda: _env_any("CV_WORKER_UPLOADED_BY", "CVI_UPLOADED_BY"))
    supabase_url: str = field(default_factory=lambda: _env_any("SUPABASE_URL"))
    supabase_anon_key: str = field(default_factory=lambda: _env_any("SUPABASE_ANON_KEY"))
    supabase_access_token: str = field(default_factory=lambda: _env_any("SUPABASE_ACCESS_TOKEN", "CVI_SUPABASE_ACCESS_TOKEN"))
    supabase_service_key: str = field(default_factory=lambda: _env_any("SUPABASE_SERVICE_ROLE_KEY"))
    supabase_authorization_token: str = field(default_factory=lambda: _env_any("SUPABASE_AUTHORIZATION_TOKEN", "SUPABASE_SERVICE_ROLE_JWT"))
    supabase_storage_bucket: str = field(default_factory=lambda: _env_any("SUPABASE_STORAGE_BUCKET", "SUPABASE_BUCKET", default="cv-originals"))
    sync_originals_to_storage: bool = field(default_factory=lambda: _bool_env("CV_SYNC_ORIGINALS_TO_STORAGE", "CVI_SYNC_ORIGINALS_TO_STORAGE", default=False))
    public_source_uri: str = field(default_factory=lambda: _env_any("CV_PUBLIC_SOURCE_URI", "CVI_PUBLIC_SOURCE_URI"))
    dedupe_source_documents: bool = field(default_factory=lambda: _bool_env("CV_DEDUPE_SOURCE_DOCUMENTS", "CVI_DEDUPE_SOURCE_DOCUMENTS", default=True))
    cache_dir: str = field(default_factory=lambda: _env_any("CV_WORKER_CACHE_DIR", "CVI_WORKER_CACHE_DIR", default=_default_cache_dir()))
    model_base_url: str = field(default_factory=lambda: _env_any("CV_MODEL_BASE_URL", "CVI_MODEL_BASE_URL", default=_default_model_base_url()))
    model_api_key: str = field(default_factory=lambda: _env_any("CV_MODEL_API_KEY", "CVI_MODEL_API_KEY", "GEMINI_API_KEY", default=_default_model_api_key()))
    extraction_provider: str = field(default_factory=lambda: _env_any("CV_EXTRACTION_PROVIDER", "CVI_EXTRACTION_PROVIDER", default="openai-compatible"))
    extraction_model: str = field(default_factory=lambda: _env_any("CV_EXTRACTION_MODEL", "CVI_EXTRACTION_MODEL", default=_default_extraction_model()))
    job_family_provider: str = field(default_factory=lambda: _env_any("CV_JOB_FAMILY_PROVIDER", "CVI_JOB_FAMILY_PROVIDER", default="llm"))
    job_family_model: str = field(default_factory=lambda: _env_any("CV_JOB_FAMILY_MODEL", "CVI_JOB_FAMILY_MODEL", default=_default_job_family_model()))
    job_family_min_confidence: float = field(default_factory=lambda: _float_env("CV_JOB_FAMILY_MIN_CONFIDENCE", "CVI_JOB_FAMILY_MIN_CONFIDENCE", default="0.62"))
    job_family_auto_accept_confidence: float = field(default_factory=lambda: _float_env("CV_JOB_FAMILY_AUTO_ACCEPT_CONFIDENCE", "CVI_JOB_FAMILY_AUTO_ACCEPT_CONFIDENCE", default="0.82"))
    embedding_model: str = field(default_factory=lambda: _env_any("CV_EMBEDDING_MODEL", "CVI_EMBEDDING_MODEL", default=_default_embedding_model()))
    embedding_provider: str = field(default_factory=lambda: _env_any("CV_EMBEDDING_PROVIDER", "CVI_EMBEDDING_PROVIDER", default=_default_embedding_provider()))
    embedding_dimension: int = field(default_factory=lambda: int(_env_any("CV_EMBEDDING_DIMENSION", "CVI_EMBEDDING_DIMENSION", default="768")))
    parser_version: str = field(default_factory=lambda: _env_any("CV_PARSER_VERSION", "CVI_PARSER_VERSION", default="1.0.0"))
    model_version: str = field(default_factory=lambda: _env_any("CV_MODEL_VERSION", "CVI_MODEL_VERSION", default=_default_model_version()))
    prompt_version: str = field(default_factory=lambda: _env_any("CV_PROMPT_VERSION", "CVI_PROMPT_VERSION", default=_default_prompt_version()))
    chunk_version: str = field(default_factory=lambda: _env_any("CV_CHUNK_VERSION", "CVI_CHUNK_VERSION", default="1.0.0"))
    embedding_version: str = field(default_factory=lambda: _env_any("CV_EMBEDDING_VERSION", "CVI_EMBEDDING_VERSION", default=_default_embedding_version()))
    artifact_version: str = field(default_factory=lambda: _env_any("CV_ARTIFACT_VERSION", "CVI_ARTIFACT_VERSION", default="1.0.0"))
    request_timeout_seconds: int = field(default_factory=lambda: _int_env("CV_REQUEST_TIMEOUT_SECONDS", "CVI_REQUEST_TIMEOUT_SECONDS", default="30"))
    extraction_max_attempts: int = field(default_factory=lambda: _int_env("CV_EXTRACTION_MAX_ATTEMPTS", "CVI_EXTRACTION_MAX_ATTEMPTS", default="2"))
    batch_size: int = field(default_factory=lambda: _int_env("CV_BATCH_SIZE", "CVI_BATCH_SIZE", default="8"))
    ingest_concurrency: int = field(default_factory=lambda: _int_env("CV_INGEST_CONCURRENCY", "CVI_INGEST_CONCURRENCY", default=_default_ingest_concurrency()))
    embedding_batch_size: int = field(default_factory=lambda: _int_env("CV_EMBEDDING_BATCH_SIZE", "CVI_EMBEDDING_BATCH_SIZE", default="16"))
    supabase_batch_size: int = field(default_factory=lambda: _int_env("CV_SUPABASE_BATCH_SIZE", "CVI_SUPABASE_BATCH_SIZE", default="50"))
    progress_interval: int = field(default_factory=lambda: _int_env("CV_PROGRESS_INTERVAL", "CVI_PROGRESS_INTERVAL", default="25"))
    supabase_limit_warning_threshold: float = field(default_factory=lambda: _float_env("CV_SUPABASE_LIMIT_WARNING_THRESHOLD", "CVI_SUPABASE_LIMIT_WARNING_THRESHOLD", default="0.85"))
    supabase_database_limit_bytes: int = field(default_factory=lambda: _bytes_env("CV_SUPABASE_DATABASE_LIMIT_BYTES", "CVI_SUPABASE_DATABASE_LIMIT_BYTES", default=_default_supabase_database_limit_bytes()))
    supabase_storage_limit_bytes: int = field(default_factory=lambda: _bytes_env("CV_SUPABASE_STORAGE_LIMIT_BYTES", "CVI_SUPABASE_STORAGE_LIMIT_BYTES", default=_default_supabase_storage_limit_bytes()))
    supabase_database_expansion_factor: float = field(default_factory=lambda: _float_env("CV_SUPABASE_DATABASE_EXPANSION_FACTOR", "CVI_SUPABASE_DATABASE_EXPANSION_FACTOR", default="1.8"))
    user_agent: str = field(default_factory=lambda: _env_any("CVI_USER_AGENT", default="cv-intelligence-worker/0.1.0"))
    device_id: str = field(default_factory=lambda: _env_any("CVI_DEVICE_ID", "CV_WORKER_DEVICE_ID"))
    delete_synced_bundles: bool = field(default_factory=lambda: _bool_env("CV_DELETE_SYNCED_BUNDLES", "CVI_DELETE_SYNCED_BUNDLES", default=True))
    manatal_api_token: str = field(default_factory=lambda: _env_any("MANATAL_API_TOKEN", "CV_MANATAL_API_TOKEN", "CVI_MANATAL_API_TOKEN"))
    manatal_api_base_url: str = field(default_factory=lambda: _env_any("MANATAL_API_BASE_URL", "CV_MANATAL_API_BASE_URL", default="https://api.manatal.com/open/v3"))
    manatal_page_size: int = field(default_factory=lambda: _int_env("MANATAL_PAGE_SIZE", "CV_MANATAL_PAGE_SIZE", default="100"))
    manatal_lookback_hours: int = field(default_factory=lambda: _int_env("MANATAL_LOOKBACK_HOURS", "CV_MANATAL_LOOKBACK_HOURS", default="24"))
    manatal_download_dir: str = field(default_factory=lambda: _env_any("MANATAL_DOWNLOAD_DIR", "CV_MANATAL_DOWNLOAD_DIR", default="./tmp/manatal_downloads"))
    manatal_sync_state_table: str = field(default_factory=lambda: _env_any("MANATAL_SYNC_STATE_TABLE", "CV_MANATAL_SYNC_STATE_TABLE", default="manatal_candidate_sync"))
    gcs_originals_bucket: str = field(default_factory=lambda: _env_any("GCS_ORIGINALS_BUCKET", "CV_GCS_BUCKET", "CV_BUCKET_NAME"))

    def cache_path(self) -> Path:
        path = Path(self.cache_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def local_artifact_dir(self, tenant_id: str) -> Path:
        path = self.cache_path() / "tenants" / tenant_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def has_supabase_http_credentials(self) -> bool:
        return bool(
            self.supabase_url and (self.supabase_access_token or self.supabase_anon_key or self.supabase_service_key)
        )

    def supabase_api_key(self) -> str:
        if self.supabase_service_key:
            return self.supabase_service_key
        if self.supabase_anon_key:
            return self.supabase_anon_key
        return self.supabase_access_token

    def supabase_bearer_token(self) -> str:
        if self.supabase_access_token:
            return self.supabase_access_token
        if self.supabase_authorization_token:
            return self.supabase_authorization_token
        if self.supabase_service_key:
            if self.supabase_service_key.count(".") == 2:
                return self.supabase_service_key
            return ""
        if self.supabase_anon_key.count(".") == 2:
            return self.supabase_anon_key
        return ""

    def auth_token(self) -> str:
        if self.supabase_access_token:
            return self.supabase_access_token
        if self.supabase_service_key:
            return self.supabase_service_key
        return self.supabase_anon_key

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        return cls()
