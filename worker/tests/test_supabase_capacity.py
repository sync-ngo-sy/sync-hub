from __future__ import annotations

from unittest.mock import MagicMock

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.supabase.capacity import (
    SupabaseCapacityService,
)


def _service(
    config: WorkerConfig,
    *,
    request: MagicMock,
    request_with_headers: MagicMock | None = None,
) -> SupabaseCapacityService:
    return SupabaseCapacityService(
        config,
        request=request,
        request_with_headers=request_with_headers or MagicMock(),
    )


def test_snapshot_uses_rpc_capacity_values() -> None:
    request = MagicMock(
        return_value={
            "database_bytes": 800,
            "storage_bytes": 600,
            "table_counts": {"candidates": 12},
        }
    )
    config = WorkerConfig(supabase_storage_bucket="resumes")
    service = _service(config, request=request)

    snapshot = service.snapshot("tenant-1")

    assert snapshot.database_bytes == 800
    assert snapshot.storage_bytes == 600
    assert snapshot.table_counts == {"candidates": 12}
    assert snapshot.source == "rpc"
    request.assert_called_once_with(
        "POST",
        "/rest/v1/rpc/ingestion_capacity_snapshot_v1",
        data={"p_tenant_id": "tenant-1", "p_storage_bucket": "resumes"},
    )


def test_snapshot_falls_back_to_exact_rest_counts() -> None:
    request = MagicMock(side_effect=RuntimeError("RPC unavailable"))
    request_with_headers = MagicMock(
        return_value=(None, {"Content-Range": "0-0/12"})
    )
    service = _service(
        WorkerConfig(),
        request=request,
        request_with_headers=request_with_headers,
    )

    snapshot = service.snapshot("tenant-1")

    assert snapshot.source == "rest-counts"
    assert set(snapshot.table_counts.values()) == {12}
    assert request_with_headers.call_count == 7


def test_warnings_include_projected_database_and_storage_limits() -> None:
    config = WorkerConfig(
        supabase_database_limit_bytes=1000,
        supabase_storage_limit_bytes=1000,
        supabase_limit_warning_threshold=0.8,
        supabase_database_expansion_factor=1,
    )
    request = MagicMock(
        return_value={
            "database_bytes": 800,
            "storage_bytes": 700,
            "table_counts": {},
        }
    )
    service = _service(config, request=request)

    warnings = service.warnings(
        "tenant-1",
        estimated_database_bytes=100,
        estimated_storage_bytes=200,
    )

    assert len(warnings) == 2
    assert "database usage" in warnings[0]
    assert "storage usage" in warnings[1]
