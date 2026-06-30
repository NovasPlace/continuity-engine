# scripts

Utility scripts for the Cross-Session Memory plugin.

## Scripts

### backfill-provenance.mjs
Backfills provenance metadata (`source_kind`, `evidence_strength`, `source_surface`, `source_agent_id`) on existing memories that lack it. Idempotent — safe to re-run.

```bash
node scripts/backfill-provenance.mjs --dry-run  # Preview changes
node scripts/backfill-provenance.mjs             # Apply changes
```

### safe-review-copy.ps1
PowerShell script for safely copying files with review.

## Usage
Scripts are run from the project root:
```bash
node scripts/<script>.mjs
```
