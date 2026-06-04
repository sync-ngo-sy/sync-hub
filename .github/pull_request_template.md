## Summary

-

## Validation

- [ ] `node scripts/check-repo-format.mjs`
- [ ] `node scripts/check-supabase-migrations.mjs`
- [ ] `cd frontend && npm run lint && npm run test && npm run build`
- [ ] `python -m ruff check worker/src worker/tests scripts`
- [ ] `python -m pytest worker/tests`
- [ ] For frontend changes, ran the Codex review skill: `.codex/skills/cv-intel-react-review`

## Risk Review

- [ ] No secrets, private CVs, tenant data, local caches, or Terraform state committed.
- [ ] Auth, RLS, tenant isolation, and service-role boundaries considered.
- [ ] React architecture, file size, CSS ownership, accessibility, and mock-data boundaries considered for frontend changes.
- [ ] Migrations, deploy order, rollback steps, or manual operations documented when relevant.
- [ ] Documentation updated for user-visible, operational, environment, or setup changes.
