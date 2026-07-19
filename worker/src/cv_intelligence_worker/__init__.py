"""CV Intelligence Platform offline worker."""

from .config import WorkerConfig
from .workflows import IngestionPipeline

__all__ = ["WorkerConfig", "IngestionPipeline"]
