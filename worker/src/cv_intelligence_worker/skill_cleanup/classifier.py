from __future__ import annotations

import concurrent.futures
from collections.abc import Callable
from typing import Any

from ..config import WorkerConfig
from ..llm import LLMClient, LLMResponseError
from ..llm_models import SkillClassificationBatch
from ..prompts import load_prompt_template


CacheWriter = Callable[[dict[str, Any]], None]
ProgressReporter = Callable[[int, int], None]


class SkillClassifier:
    def __init__(
        self,
        *,
        batch_size: int,
        max_workers: int,
        config: WorkerConfig | None = None,
        client: LLMClient | None = None,
        cache_writer: CacheWriter | None = None,
        progress_reporter: ProgressReporter | None = None,
    ) -> None:
        if batch_size < 1 or max_workers < 1:
            raise ValueError("batch size and max workers must be positive")
        config = config or WorkerConfig.from_env()
        if not config.extraction_model:
            raise RuntimeError("Missing CV_EXTRACTION_MODEL for LLM skill cleanup")
        self.batch_size = batch_size
        self.max_workers = max_workers
        self.model = config.extraction_model
        self.client = client or LLMClient(config)
        self.cache_writer = cache_writer
        self.progress_reporter = progress_reporter

    @staticmethod
    def system_prompt() -> str:
        return load_prompt_template("skill_classification").render()

    def request_batch(self, items: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
        parsed = self.client.parse(
            model=self.model,
            system_prompt=self.system_prompt(),
            prompt={"items": items},
            response_model=SkillClassificationBatch,
        )
        expected = {int(item["id"]) for item in items}
        received = {item.id for item in parsed.items}
        if received != expected:
            raise LLMResponseError("skill classification response IDs do not match request")
        return {item.id: {"action": item.action, "canonical": item.canonical} for item in parsed.items}

    def classify(self, labels: list[tuple[str, int]], cache: dict[str, Any]) -> dict[str, Any]:
        missing = [{"id": index, "label": label, "count": count} for index, (label, count) in enumerate(labels) if label not in cache]
        if not missing:
            return cache

        batches = [missing[index : index + self.batch_size] for index in range(0, len(missing), self.batch_size)]
        by_id = {int(item["id"]): item["label"] for item in missing}
        completed = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [executor.submit(self.request_batch, batch) for batch in batches]
            for future in concurrent.futures.as_completed(futures):
                results = future.result()
                for item_id, value in results.items():
                    cache[by_id[item_id]] = value
                completed += len(results)
                if completed % max(self.batch_size, 100) == 0 or completed == len(missing):
                    self._record_progress(cache, completed, len(missing))
        self._write_cache(cache)
        return cache

    def _record_progress(self, cache: dict[str, Any], completed: int, total: int) -> None:
        self._write_cache(cache)
        if self.progress_reporter:
            self.progress_reporter(completed, total)

    def _write_cache(self, cache: dict[str, Any]) -> None:
        if self.cache_writer:
            self.cache_writer(cache)
