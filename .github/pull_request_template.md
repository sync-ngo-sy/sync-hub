## Summary

<!-- Explain what changed and why. Focus on the problem and outcome. -->

## Linked issue

Closes #

<!--
Use "Closes #123", "Fixes #123", or "Resolves #123".
Use "Related to #123" when the PR should not automatically close the issue.
-->

## Type of change

* [ ] Bug fix
* [ ] New feature
* [ ] Technical improvement
* [ ] Refactoring
* [ ] Documentation
* [ ] Dependency update
* [ ] Infrastructure or deployment

## Changes

<!-- List the important implementation changes. -->

*
*

## Validation

Check everything that applies. Explain anything not completed.

* [ ] Relevant automated tests were added or updated.
* [ ] Existing tests pass.
* [ ] Linting and formatting checks pass.
* [ ] The application was tested manually.
* [ ] Database migrations were tested locally.
* [ ] Frontend changes were tested at relevant screen sizes.
* [ ] Documentation was updated where necessary.
* [ ] This change does not require additional validation.

### Commands run

```text
<!-- Example:
cd frontend && npm run lint && npm run test && npm run build
python -m ruff check worker/src worker/tests scripts
python -m pytest worker/tests
-->
```

## Screenshots or recordings

<!--
Required for visible frontend changes.
Write "Not applicable" for changes without a visual effect.
-->

## Security and privacy

* [ ] No secrets, access tokens, private CVs, candidate data, or tenant data were committed.
* [ ] Authentication and authorization implications were reviewed.
* [ ] Tenant isolation and Row-Level Security implications were reviewed.
* [ ] External AI-provider data sharing was considered.
* [ ] This change has no security or privacy impact.

### Security or privacy notes

<!-- Explain relevant risks or write "Not applicable". -->

## Database and migration impact

* [ ] No database changes
* [ ] Backward-compatible migration
* [ ] Breaking or destructive migration

<!--
Describe migration order, data backfill, compatibility, and rollback.
Write "Not applicable" when there are no database changes.
-->

## Deployment and rollback

<!--
Describe required configuration, secrets, deployment order, manual steps,
feature flags, monitoring, and rollback. Write "Not applicable" when appropriate.
-->

## Reviewer guidance

<!--
Identify the most important files, decisions, risks, and areas needing close review.
-->

## Final checklist

* [ ] The PR has a clear and focused scope.
* [ ] The linked issue contains acceptance criteria.
* [ ] New behavior is covered by appropriate tests.
* [ ] User-facing or operational documentation is updated.
* [ ] Comments and temporary debugging code were removed.
* [ ] I reviewed my own changes before requesting review.
