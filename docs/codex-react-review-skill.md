# Codex React Review Skill

The project review skill lives at `.codex/skills/cv-intel-react-review`. It captures the current React architecture, CSS ownership, mock-data boundary, file-size targets, accessibility expectations, and validation commands.

## When To Use It

Use the skill for every PR that changes `frontend/`, especially changes touching:

- React screens, feature modules, hooks, components, routing, or navigation.
- `frontend/src/lib/platformApi.ts`, `frontend/src/lib/api/*`, `frontend/src/data/mockData.ts`, or API mappers.
- `frontend/src/styles/*`.
- Auth, tenant scope, admin workflows, search, parsing, insights, jobs, or candidate flows.

## How To Invoke It

From a Codex session in this repo, ask:

```text
Use the skill at .codex/skills/cv-intel-react-review to review my frontend changes before merge.
```

For a narrower review:

```text
Use the skill at .codex/skills/cv-intel-react-review to review the CSS and mock-data boundaries in this PR.
```

For new feature work:

```text
Use the skill at .codex/skills/cv-intel-react-review to plan and review a new frontend feature module before implementation.
```

To make the skill globally discoverable in local Codex sessions, symlink or copy `.codex/skills/cv-intel-react-review` into `${CODEX_HOME:-$HOME/.codex}/skills/`.

## Enforcement Policy

- PR authors should run the skill before requesting review when frontend files changed.
- New frontend features should follow `.codex/skills/cv-intel-react-review/references/feature-module-guide.md`.
- Reviewers should ask Codex to use the skill when reviewing frontend PRs.
- The PR checklist includes a checkbox for the skill review.
- CI still enforces deterministic gates: repository formatting, TypeScript, unit smoke tests, production build, and dependency audit.

The skill is a review rubric, not a replacement for CI. If the skill and CI disagree, fix the code until both are clean or document the intentional exception in the PR.
