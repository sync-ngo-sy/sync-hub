# Workspace CV Folders

This folder is the repo-safe place for tenant/workspace CV inputs.

## Rules

- Create one subfolder per tenant slug.
- Put real CV files inside `workspaces/<tenant-slug>/`.
- Git ignores the actual CV files under these folders.
- Keep workspace contents private and out of git.

## Local tenant folders

Create tenant folders locally when needed. They are ignored by git.

## Recommended worker usage

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "./workspaces/<tenant-slug>" \
  --tenant-id <tenant-id>
```

## Demo workspace seed

If you have private sample files outside the repository, seed the local demo folder like this:

```bash
mkdir -p ./workspaces/demo
cp -f /path/to/private-cvs/*.pdf ./workspaces/demo/
```

Then ingest them into the local `demo` tenant:

```bash
PYTHONPATH=worker/src python3 -m cv_intelligence_worker ingest \
  "./workspaces/demo" \
  --tenant-id <tenant-id>
```

The PDF files inside `workspaces/demo/` stay ignored by git.

## Google Drive

If you use Google Drive Desktop, mirror the same tenant slug structure under:

```text
<drive-sync-path>/CV Intelligence/<tenant-slug>/
```

The tenant admin utility can create both the local repo-safe folders and the synced Drive folders for you.
