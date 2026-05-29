## Summary

-

## Validation

- [ ] `node scripts/check-repo-format.mjs`
- [ ] `node scripts/check-supabase-migrations.mjs`
- [ ] `cd frontend && npm run lint && npm run test && npm run build`
- [ ] `python -m ruff check worker/src worker/tests scripts`
- [ ] `python -m pytest worker/tests`

## Risk Review

- [ ] No secrets, private CVs, tenant data, local caches, or Terraform state committed.
- [ ] Auth, RLS, tenant isolation, and service-role boundaries considered.
- [ ] Migrations, deploy order, rollback steps, or manual operations documented when relevant.
- [ ] Documentation updated for user-visible, operational, environment, or setup changes.
