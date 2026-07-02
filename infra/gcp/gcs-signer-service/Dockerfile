FROM python:3.14-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY infra/gcp/gcs-signer-service/server.py /app/server.py

USER nobody

CMD ["python", "/app/server.py"]
