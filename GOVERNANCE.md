# NovaStream Governance — Keeping the Project in Sync

> **Purpose:** This document defines the rules, processes, and automated checks that keep NovaStream's code, documentation, status tracker, and configuration files consistent. Follow these rules every time you make a change.

---

## 1. Golden Rule

**Before you commit any change, run `novactl sync-check` to verify nothing drifted.**

```bash
novactl sync-check          # Quick check
novactl sync-check --verbose  # Detailed output
```

If the check fails, fix the drift before committing. If the check reveals a legitimate inconsistency (e.g., you purposely changed something that needs a doc update), make that update and re-run.

---

## 2. File Sync Matrix

This matrix defines which files MUST stay in sync. When you modify any file in the **left column**, update the corresponding files in the **right column**.

| If You Modify | You MUST Also Update |
|---------------|---------------------|
| `server/src/config/env.js` (env vars) | `docs/reference/.env.example`, `.env` (if applicable) |
| `server/package.json` (deps) | `requirements.txt` |
| `cli/package.json` (deps) | `requirements.txt` |
| `server/src/models/*.model.js` | `docs/plans/SERVER_PLAN.md` (Section 3 schemas) |
| `docs/plans/SERVER_PLAN.md` | `docs/STATUS.md` (if phase/task changes) |
| Any implementation file | `docs/STATUS.md` (mark task as done) |
| `server/src/app.js` (routes/middleware) | `docs/plans/SERVER_PLAN.md` (Section 4, 7) |
| `ecosystem.config.js` | `docs/plans/SERVER_PLAN.md` (Section 16.5) |
| `docs/*.md` (any doc) | `docs/index.md` (navigation links) |
| `install.sh` or `install.ps1` | The other install script (keep in parity) |

---

## 3. BRIDGE Workflow

Follow this workflow for every change:

```
B — BACKUP PLAN: Check GOVERNANCE.md sync matrix first
R — READ: Read the relevant files that need updating
I — IMPLEMENT: Make your code changes
D — DOCUMENT: Update STATUS.md, .env.example, requirements.txt, etc.
G — GOVERNANCE CHECK: Run novactl sync-check
E — EXECUTE: Commit only if all checks pass
```

---

## 4. Pre-Commit Checklist

Before every commit, verify:

### 4.1 Code Consistency
- [ ] `novactl sync-check` passes without errors
- [ ] No commented-out code (unless explaining intent)
- [ ] No `console.log` left in production code (use Pino logger instead)
- [ ] No `TODO` or `FIXME` without an associated STATUS.md task

### 4.2 Documentation
- [ ] `docs/STATUS.md` reflects the current state of ALL phases
- [ ] `docs/plans/SERVER_PLAN.md` code snippets match actual implementation
- [ ] `docs/reference/.env.example` matches `server/src/config/env.js` schema
- [ ] `requirements.txt` matches ALL package.json files
- [ ] `docs/index.md` nav links include any new docs

### 4.3 Configuration
- [ ] `.env` is in `.gitignore` (NEVER commit real credentials)
- [ ] `ecosystem.config.js` script paths are correct
- [ ] No hardcoded secrets or API keys in source code

### 4.4 Cross-Platform
- [ ] Path separators use `path.join()` or `/` (not `\`)
- [ ] Shell commands work on both Linux and Windows (or have fallbacks)
- [ ] Install scripts (`install.sh` + `install.ps1`) are in parity

---

## 5. File Ownership Map

| Area | Owner File | Description |
|------|-----------|-------------|
| **📋 Status** | `docs/STATUS.md` | Master tracker — the single source of truth for what's done |
| **📐 Plan** | `docs/plans/SERVER_PLAN.md` | Architecture, schemas, endpoints, implementation phases |
| **🔐 Secrets** | `.env` (gitignored) | All API keys, tokens, passwords |
| **📦 Dependencies** | `requirements.txt` | Complete manifest of ALL dependencies |
| **⚙️ Config Template** | `docs/reference/.env.example` | Template for new devs to copy |
| **🧭 Docs Hub** | `docs/index.md` | Navigation and links to all docs |
| **📊 Research** | `docs/reference/API_FINDINGS.md` | YupFlix API analysis |
| **🔬 Research** | `docs/research/TMDB_API_RESEARCH.md` | TMDB integration research |
| **🖥️ Server** | `server/package.json` | Backend dependency manifest |
| **🛠️ CLI** | `cli/package.json` | CLI dependency manifest |
| **⚡ PM2** | `ecosystem.config.js` | Process manager configuration |
| **📜 Install** | `install.sh` + `install.ps1` | Cross-platform setup scripts |
| **🔍 Audit** | `scripts/sync-check.js` | Governance validation script |

---

## 6. Sync Check Protocol

Run `novactl sync-check` to automatically validate:

### 6.1 What It Checks

| Check ID | Validation | Failure Type |
|----------|-----------|-------------|
| `ENV_VARS` | `.env.example` vars match `config/env.js` Zod schema | Error |
| `DEPS_SERVER` | `requirements.txt` vs `server/package.json` | Error |
| `DEPS_CLI` | `requirements.txt` vs `cli/package.json` | Error |
| `STATUS_TASKS` | STATUS.md tasks match actual file existence | Warning |
| `DOC_LINKS` | `docs/index.md` links to all doc files | Warning |
| `PLAN_DIRS` | Server/CLI dirs in plan match actual structure | Warning |
| `BASH_PARITY` | Install scripts have same sections | Warning |
| `GITIGNORE` | `.env` is gitignored | Error |

### 6.2 Frequency

| When | Action |
|------|--------|
| Before every commit | Run `novactl sync-check` |
| After adding/removing any dependency | Update `requirements.txt` |
| After changing `.env` schema | Update `.env.example` |
| After completing any task | Update `docs/STATUS.md` |
| Weekly (end of session) | Full audit: re-read all sync matrix pairs |

---

## 7. Drift Recovery

If `novactl sync-check` reports a drift, here's how to resolve each type:

### 7.1 Environment Variable Drift
```bash
# .env.example is missing a var that env.js validates
# Fix: Add the var to docs/reference/.env.example
# Then re-run: novactl sync-check
```

### 7.2 Dependency Drift
```bash
# requirements.txt doesn't match package.json
# Fix: Update requirements.txt with the correct package + version
# Then re-run: novactl sync-check
```

### 7.3 Status Drift
```bash
# STATUS.md says a task is done but files are missing
# Fix: Either complete the task or mark it as not started
# Then re-run: novactl sync-check
```

### 7.4 Document Link Drift
```bash
# A new doc exists but docs/index.md doesn't link to it
# Fix: Add a link to docs/index.md
# Then re-run: novactl sync-check
```

---

## 8. Change Log

Every significant governance update should be logged here.

| Date | Change | Author |
|------|--------|--------|
| 2026-06-30 | Initial governance document created | — |

---

## 9. Quick Reference Card

```bash
# Before coding
cat GOVERNANCE.md             # Review rules

# After coding
novactl sync-check            # Validate everything
node scripts/sync-check.js    # (or run directly)

# When adding deps
npm install <pkg>             # Install
# Then update requirements.txt with the exact version

# When done with a task
# 1. Update docs/STATUS.md (mark task done)
# 2. Run novactl sync-check
# 3. Commit

# Weekly
# 1. Check all env vars in config/env.js are in .env.example
# 2. Check all package.json deps are in requirements.txt
# 3. Review STATUS.md against actual project state
```
