"""CV Intelligence Platform offline worker."""

from .config import WorkerConfig
from .pipeline import IngestionPipeline

__all__ = ["WorkerConfig", "IngestionPipeline"]
