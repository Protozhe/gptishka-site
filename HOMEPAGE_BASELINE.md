# Homepage Baseline (2026-05-25)

Stable baseline for the main page and its runtime files is stored in:

- `stable-baselines/homepage-20260525`

Quick commands:

```powershell
# show baseline details
powershell -ExecutionPolicy Bypass -File scripts/restore-homepage-baseline.ps1 -Action show

# verify current files against baseline
powershell -ExecutionPolicy Bypass -File scripts/restore-homepage-baseline.ps1 -Action verify

# restore baseline files into project root
powershell -ExecutionPolicy Bypass -File scripts/restore-homepage-baseline.ps1 -Action restore
```

Baseline source snapshot used for this copy:

- `backups/homepage-baseline-20260525-main` (local ignored backup)
