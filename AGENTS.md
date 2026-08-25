# Production safety rules

These rules apply to every Codex session and every developer working in this repository.

## Protected production flow

- `main` is the development branch. A push to `main` must never deploy automatically.
- Production is deployed only from the `production` branch.
- Before updating `production`, run `npm run verify:production` and fix every failure.
- Never bypass, remove, or weaken production verification to make a deployment pass.
- Never deploy an uncommitted working tree or copy individual files directly to `/var/www/gptishka-new`.
- Keep mutable production data outside the Git checkout.

## Stable recovery point

- The protected baseline created on 2026-08-25 is tagged `production-stable-2026-08-25`.
- Do not move, recreate, or force-update this tag.
- If a new release causes a regression, restore the `production` branch from this tag first, then diagnose the change on `main`.

## Release checklist

1. Confirm the requested changes are committed on `main`.
2. Run `npm run verify:production`.
3. Review the diff from `production` to the candidate commit.
4. Fast-forward or merge the approved candidate into `production` and push it.
5. Confirm the production workflow and live smoke checks succeed.

