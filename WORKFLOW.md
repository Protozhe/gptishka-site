# GPTishka Workflow

This repository is now treated as a production-grade project, not a scratch workspace.

## Current source of truth

- `main` is the production baseline.
- Production server must match `origin/main`.
- The old local folder `C:\Users\aSKAR\Desktop\gptishka-site` is an archive/source of historical experiments, not the working directory.
- The clean working directory should be `C:\Users\aSKAR\Desktop\gptishka-site-clean`.

## Before any work

Run:

```bash
git status --short
git pull --ff-only origin main
git status --short
```

Expected:

```text

```

If `git status --short` is not empty, stop and resolve it before editing.

## How to make changes

1. Work from a clean branch or clean working directory.
2. Keep each change small and testable.
3. Commit only intentional source files and required assets.
4. Do not commit temporary files, local backups, build outputs, runtime data, secrets, or downloaded archives.
5. Push only after local verification.

## Deployment rule

Deploy only from `origin/main` after the commit is pushed and verified.

Do not deploy from:

- the old dirty local folder;
- a folder with uncommitted changes;
- temporary recovery folders;
- manual server edits that were not committed.

## Production artifacts

Large downloadable files such as VPN client archives are runtime artifacts and are intentionally excluded from git:

- `assets/downloads/`

They must be stored on production/backups, not committed to the repository.

## Emergency recovery

If a deployment breaks the site:

1. Check production HEAD:

```bash
ssh gptishka "cd /var/www/gptishka-new && git rev-parse --short HEAD && git status --short"
```

2. Check the latest backups under:

```text
/var/backups/gptishka/
```

3. Restore only the affected files or redeploy a known-good `main` commit.

