# ==========================================
# Stage 1: Builder (Dependency Compilation)
# ==========================================
FROM python:3.10-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY worker/ .

# Install python dependencies to a dedicated prefix
RUN pip install --no-cache-dir --prefix=/install . \
    && pip install --no-cache-dir --prefix=/install fastapi uvicorn python-multipart httpx \
    && find /install -type d -name "__pycache__" -exec rm -rf {} + \
    && find /install -name "*.pyc" -delete

# ==========================================
# Stage 2: Runtime (Clean & Secure)
# ==========================================
FROM python:3.10-slim

# 1. Create a non-root user
RUN useradd -m -s /bin/bash appuser

# 2. Install runtime system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# 3. Configure Environment Variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src:/app

WORKDIR /app

# 4. Copy built dependencies from builder stage
COPY --from=builder /install /usr/local

# 5. Copy application code (only the worker directory)
COPY worker/ .

# 6. Set ownership to non-root user
RUN chown -R appuser:appuser /app

# 7. Switch to non-root user
USER appuser

# Expose the Cloud Run default port
EXPOSE 8080

# 8. Start the packaged FastAPI application
CMD ["uvicorn", "cv_intelligence_worker.realtime_extractor:app", "--host", "0.0.0.0", "--port", "8080"]
