# Sync Hub

Open-source, privacy-conscious CV intelligence for talent discovery and recruitment.

Sync Hub is developed by [SYNC NGO](https://sync.ngo/). It helps recruitment teams search, rank, compare, and analyze candidate profiles while keeping processing explainable and tenant data isolated.

## Features

* Semantic and keyword-based candidate search
* Structured CV parsing and skill normalization
* Candidate dossiers and comparisons
* Evidence-grounded summaries and answers
* Multi-tenant data isolation using PostgreSQL Row-Level Security
* Offline CV processing with optional AI providers
* Public job listings and application ingestion
* Static React frontend backed by Supabase

## Architecture

Sync Hub is divided into two main parts:

### Offline processing

The Python worker parses CVs, extracts structured information, generates embeddings and summaries, and synchronizes derived data to Supabase.

### Online retrieval

The React frontend uses Supabase for authentication, tenant-scoped data access, search, comparison, and recruitment workflows.

```text
CV files
   ↓
Parse and extract
   ↓
Normalize and chunk
   ↓
Embed and summarize
   ↓
Sync to Supabase
   ↓
Search, rank, compare, and analyze
```

## Repository structure

```text
frontend/    React application
worker/      Python CV ingestion and processing worker
supabase/    Database migrations and Edge Functions
infra/       Local infrastructure documentation
scripts/     Administration and repository utilities
docs/        Architecture, development, privacy, and release documentation
workspaces/  Git-safe tenant workspace structure
```

## Getting started

### Prerequisites

* Node.js
* Python 3
* Docker
* Supabase CLI
* An optional supported AI provider or local Ollama installation

### Setup

```bash
git clone https://github.com/abdulqdaer-q/sync-hub.git
cd sync-hub
cp .env.example .env.local
```

Start the local Supabase environment:

```bash
supabase start
supabase db reset
supabase functions serve
```

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

For worker configuration, ingestion commands, local AI setup, and tenant administration, read the [development guide](docs/development-guide.md).

## Documentation

* [Development guide](docs/development-guide.md)
* [System flows](SYSTEM_FLOWS.md)
* [Infrastructure](infra/README.md)
* [Deployment guide](DEPLOYMENT_GUIDE.md)
* [Release process](docs/release-process.md)
* [Development workflow](docs/development-workflow.md)
* [Data retention](docs/data-retention.md)
* [Security policy](SECURITY.md)

## Contributing

Contributions are welcome.

Before contributing, read:

* [Contributing guide](CONTRIBUTING.md)
* [Code of conduct](CODE_OF_CONDUCT.md)
* [Clean code guidelines](docs/clean-code-guidelines.md)

Use GitHub Issues for bugs, feature proposals, and technical improvements. Security vulnerabilities must be reported privately according to the [security policy](SECURITY.md).

## Support the project

Individuals and organizations can support the development and social impact of Sync Hub through donations, sponsorships, and partnerships.

[Support SYNC NGO](https://sync.ngo/donation/)

## Licensing

Sync Hub is available under a dual-licensing model:

* **Open-source use:** GNU Affero General Public License, version 3 or later
* **Commercial use:** A separate commercial agreement with SYNC NGO

See [`LICENSE`](LICENSE) and [`LICENSING.md`](LICENSING.md) for details.

Copyright © 2026 SYNC NGO.
