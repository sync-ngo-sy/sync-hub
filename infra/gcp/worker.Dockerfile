FROM python:3.14-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CV_SOURCE_DIR=/mnt/cvs \
    CV_WORKER_CACHE_DIR=/tmp/cv_intelligence_worker

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-eng \
      tesseract-ocr-ara \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY README.md /app/README.md
COPY worker /app/worker

RUN python -m pip install --upgrade pip \
    && python -m pip install /app/worker \
    && mkdir -p /mnt/cvs /tmp/cv_intelligence_worker \
    && useradd --system --create-home --uid 10001 worker \
    && chown -R worker:worker /app /mnt/cvs /tmp/cv_intelligence_worker

USER worker

ENTRYPOINT ["cv-intelligence-worker"]
CMD ["ingest", "--pretty"]
