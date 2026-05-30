# Development Workflow

## Branches

- Use short-lived branches such as `codex/<topic>` or `<team>/<topic>`.
- Keep each branch focused on one behavior, refactor, or operational change.
- Avoid mixing large formatting changes with business logic changes.

## Pull Requests

- PR titles should use `type(scope): summary`.
- Fill out the PR template and list any migrations, deploy steps, rollback steps, or environment changes.
- Request review from someone familiar with the touched area.
- Ask for a second review for auth, RLS, service-role, ingestion sync, storage, infrastructure, or data-retention changes.

## Recommended Branch Protection

Configure the default branch to require:

- Pull request before merge.
- At least one approving review.
- Stale review dismissal when new commits are pushed.
- Required status checks:
  - `Repository format`
  - `Frontend`
  - `Worker`
  - `Supabase migrations`
  - `Supabase functions`
  - `CodeQL / Analyze javascript-typescript`
  - `CodeQL / Analyze python`
- Secret scanning and push protection.
- Linear history or squash merge, depending on the team's release preference.

## Dependency Updates

- Dependabot opens grouped weekly updates for frontend, worker, GitHub Actions, Terraform, and Docker surfaces.
- Treat security updates as high priority.
- Prefer small dependency PRs unless the packages are tightly coupled.
- Run the full CI suite before merging version bumps.
