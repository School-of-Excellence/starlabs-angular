# Starlabs Angular - Setup & Deployment

## Local Setup

After cloning the repository, run:

```bash
./setupScript.sh
```

**Requirements: Before running script**
- GitHub CLI installed:
  - Mac: `brew install gh`
  - Windows: `winget install GitHub.CLI`
  - Ubuntu: `sudo apt install gh`
- Authenticated: `gh auth login`

---

## Deployment

### To Test Environment

```bash
git push origin development
```

- Deploys to `breakthroughs-test` Firebase site


### To Production

```bash
git push origin production
```

- Deploys to `breakthroughs` Firebase site

---

## Important Notes

- Environment files are auto-generated from GitHub secrets
- **Do not commit** `src/environments/` files to git
- Missing environment files? Run `./setupScript.sh` again