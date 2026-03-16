# Firebase Environment Setup

## Quick Start

After cloning or pulling the repo, run:

```bash
./fetch-firebase-env.sh
```

This triggers a GitHub workflow that:
1. Creates `src/environments/environment.ts` (production)
2. Creates `src/environments/environment.development.ts` (test)

Wait for the script to show **"✅ Workflow completed successfully"** then pull the changes:

Done! Your environment files are ready.

---

## Requirements

- GitHub CLI installed: `brew install gh` (Mac) or `winget install GitHub.CLI` (Windows)
- Authenticated: `gh auth login`

---

## Notes

- Environment files are auto-generated from GitHub Secrets
- Don't edit them manually - changes will be overwritten
- The workflow runs on-demand only (manual trigger)