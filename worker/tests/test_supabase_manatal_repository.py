from __future__ import annotations

from unittest.mock import MagicMock

from cv_intelligence_worker.config import WorkerConfig
from cv_intelligence_worker.integrations.supabase.manatal import ManatalRepository


def _repository(
    *,
    request: MagicMock | None = None,
    select_rows: MagicMock | None = None,
    upsert_many: MagicMock | None = None,
) -> tuple[ManatalRepository, MagicMock, MagicMock, MagicMock]:
    request = request or MagicMock()
    select_rows = select_rows or MagicMock(return_value=[])
    upsert_many = upsert_many or MagicMock(return_value=0)
    config = WorkerConfig(
        manatal_sync_state_table="manatal_sync_state_test",
    )
    repository = ManatalRepository(
        config,
        request=request,
        select_rows=select_rows,
        upsert_many=upsert_many,
    )
    return repository, request, select_rows, upsert_many


def test_sync_states_are_keyed_by_manatal_candidate_id() -> None:
    select_rows = MagicMock(
        return_value=[
            {"manatal_candidate_id": "42", "sync_status": "completed"},
            {"manatal_candidate_id": "", "sync_status": "pending"},
        ]
    )
    repository, _request, select_rows, _upsert = _repository(
        select_rows=select_rows,
    )

    result = repository.sync_states("tenant-1", ["42"])

    assert result == {
        "42": {"manatal_candidate_id": "42", "sync_status": "completed"}
    }
    assert select_rows.call_args.args[:4] == (
        "manatal_sync_state_test",
        "tenant-1",
        "manatal_candidate_id",
        ["42"],
    )


def test_sync_state_upsert_uses_domain_conflict_key() -> None:
    upsert_many = MagicMock(return_value=2)
    repository, _request, _select, upsert_many = _repository(
        upsert_many=upsert_many,
    )
    rows = [{"manatal_candidate_id": "42"}, {"manatal_candidate_id": "43"}]

    assert repository.upsert_sync_states(rows) == 2
    upsert_many.assert_called_once_with(
        "manatal_sync_state_test",
        rows,
        "tenant_id,manatal_candidate_id",
    )


def test_original_source_page_is_tenant_scoped_and_bounded() -> None:
    request = MagicMock(return_value=[])
    repository, request, _select, _upsert = _repository(request=request)

    assert repository.original_source_rows("tenant-1", offset=-5, limit=0) == []

    method, path = request.call_args.args
    assert method == "GET"
    assert "/manatal_sync_state_test?" in path
    assert "tenant_id=eq.tenant-1" in path
    assert "source_document_id=not.is.null" in path
    assert "limit=1" in path
    assert "offset=0" in path
