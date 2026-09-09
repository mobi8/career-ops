---
description: Run full career collection including configured careers scan sources
argument-hint: "[--dry-run]"
---

Run the full career-ops collection flow.

1. Execute the configured careers scan first:

```bash
node run.mjs $ARGUMENTS
```

2. If this is not a dry-run, continue with the existing career-ops pipeline mode to process the pending URLs that `scan.mjs` added to `data/pipeline.md`.

Do not change scoring, ranking, filtering, or other collection sources. Keep all 113 configured careers sources in scope, including sources that fail fetch; failures should remain warnings only.
