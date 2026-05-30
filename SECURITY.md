# Security Policy

## Supported Scope

Security-sensitive areas include Supabase auth and RLS, service-role usage, Edge Functions, ingestion worker credentials, original CV storage, tenant isolation, signed URLs, and dependency supply chain configuration.

## Reporting a Vulnerability

Report suspected vulnerabilities privately to a maintainer or repository owner. If this repository is hosted on GitHub with private advisories enabled, use the repository security advisory flow. Otherwise, contact the owner out of band and avoid opening a public issue until the risk is understood.

Please include:

- Affected component and environment.
- Steps to reproduce or a clear proof of concept.
- Potential impact, especially whether tenant data, credentials, or original CVs can be exposed.
- Any logs or screenshots with secrets redacted.

## Handling Expectations

Maintainers should acknowledge reports promptly, confirm severity, assign an owner, and document remediation steps. High-risk issues involving exposed credentials, tenant data leakage, bypassed RLS, or public CV access should be treated as urgent.

## Development Rules

- Never place service-role keys in frontend code or browser-visible configuration.
- Prefer short-lived worker or device tokens over long-lived privileged keys on laptops.
- Keep `.env`, `.env.local`, Terraform state, generated caches, and private tenant workspaces out of git.
- Redact signed URLs, API tokens, JWTs, and resume download links from logs and errors.
- Run dependency and static-analysis checks before merging security-sensitive changes.
