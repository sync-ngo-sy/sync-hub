from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..config import WorkerConfig
from ..domain.models import ArtifactBundle, ComparisonArtifact, dataclass_to_dict


class LocalArtifactStore:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config

    def tenant_dir(self, tenant_id: str) -> Path:
        base = self.config.local_artifact_dir(tenant_id)
        for child in ("bundles", "comparisons", "runs"):
            (base / child).mkdir(parents=True, exist_ok=True)
        return base

    def write_json(self, path: Path, value: Any) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, ensure_ascii=True, sort_keys=True), encoding="utf-8")
        return path

    def save_bundle(self, bundle: ArtifactBundle) -> Path:
        tenant_dir = self.tenant_dir(bundle.profile.tenant_id)
        payload = dataclass_to_dict(bundle)
        payload["source_file"] = bundle.source.source_path
        return self.write_json(tenant_dir / "bundles" / f"{bundle.profile.candidate_id}.json", payload)

    def delete_file(self, path: Path) -> None:
        try:
            path.unlink()
        except FileNotFoundError:
            return
        cache_root = self.config.cache_path()
        for parent in path.parents:
            if parent == cache_root:
                break
            try:
                parent.rmdir()
            except OSError:
                break

    def save_comparison(self, artifact: ComparisonArtifact, artifact_key: str) -> Path:
        tenant_dir = self.tenant_dir(artifact.tenant_id)
        return self.write_json(tenant_dir / "comparisons" / f"{artifact_key}.json", dataclass_to_dict(artifact))

    def load_profile_payload(self, tenant_id: str, candidate_id: str) -> dict[str, Any]:
        path = self.tenant_dir(tenant_id) / "bundles" / f"{candidate_id}.json"
        return json.loads(path.read_text(encoding="utf-8"))
