# NovaStream Audit Governance

> **Purpose:** This document governs all audit phases. It defines workflows, classifications, policies, and rules for every audit finding. All AI agents and human auditors MUST follow this document.
>
> **Applies to:** All files under `audit/`
> **Last Updated:** July 2, 2026

---

## 1. Audit Lifecycle

Every finding MUST follow this complete lifecycle. No step may be skipped.

```
DISCOVER
    ↓
VERIFY
    ↓
ROOT CAUSE ANALYSIS
    ↓
DOCUMENT
    ↓
PROPOSE REMEDIATION
    ↓
USER APPROVAL
    ↓
IMPLEMENT
    ↓
SELF REVIEW
    ↓
BUILD TEST
    ↓
USER BROWSER TEST
    ↓
REGRESSION TEST
    ↓
CERTIFICATION
    ↓
CLOSED
```

### 1.1 DISCOVER
- Identify an issue during a phase audit
- Classify by category, severity, and risk (see §7, §8, §9)

### 1.2 VERIFY
- Confirm the issue is real and reproducible
- Gather evidence (logs, screenshots, code references)

### 1.3 ROOT CAUSE ANALYSIS
- Identify the underlying cause, not just the symptom
- Trace through the full call chain

### 1.4 DOCUMENT
- Create a finding entry in the current phase's `FINDINGS.md`
- Every field in the finding template MUST be filled (see template)

### 1.5 PROPOSE REMEDIATION
- Describe exactly what code changes are needed
- Include file paths, approach, and trade-offs

### 1.6 USER APPROVAL
- Present the finding + remediation proposal to the user
- Wait for explicit approval before implementing

### 1.7 IMPLEMENT
- Apply the approved code changes
- Change ONLY the files specified in the remediation

### 1.8 SELF REVIEW
- Review your own changes for correctness
- Verify no unintended side effects

### 1.9 BUILD TEST
- Run build/typecheck: `npx vite build` (client) or `node -e 'require(...)'` (server)
- Fix any build errors before proceeding

### 1.10 USER BROWSER TEST
- User verifies the fix works in the browser
- Describe what the user should test and what to look for

### 1.11 REGRESSION TEST
- Verify existing functionality is not broken
- Test related features and edge cases

### 1.12 CERTIFICATION
- Mark the finding as CERTIFIED in FINDINGS.md
- Update AUDIT_STATUS.md

### 1.13 CLOSED
- Finding is complete
- No further action required

---

## 2. AI Behavior Rules

The AI MUST obey the following rules:

1. **Never work on multiple findings simultaneously** — One finding at a time. Complete the full lifecycle before starting the next.
2. **Never implement speculative improvements** — Only implement what an approved finding requires.
3. **Never perform unrelated refactoring** — Change only the files specified in the remediation.
4. **Never silently change architecture** — All architecture changes must be documented and approved.
5. **Never rename files without approval** — File renames must be part of an approved finding.
6. **Never change public interfaces without approval** — API contracts, function signatures, and component props are public interfaces.
7. **Never move folders** — Directory structure changes require explicit approval.
8. **Never replace dependencies unless required by an approved finding** — Dependency changes must be justified by the finding.
9. **Never skip user approval** — Every remediation MUST be approved before implementation.
10. **Never certify its own work** — Certification requires user confirmation.
11. **Never continue after failed testing** — Stop. Fix the failure. Re-test. Do not proceed to the next step until tests pass.
12. **Never reopen certified findings without documented justification** — Reopening requires a new entry in DECISIONS.md explaining why.

---

## 3. Approval Workflow

| Change Type | Approver | Method |
|-------------|----------|--------|
| Finding classification | AI agent | Automatic — logged in DECISIONS.md |
| Remediation strategy | Human | MUST ask user before implementing |
| Build test results | AI agent | Automatic — documented in FINDINGS.md |
| Browser test results | Human | User confirms in browser |
| Phase certification | Human | User confirms — AI cannot self-certify |
| Governance change | Human | MUST ask user before modifying GOVERNANCE.md |

---

## 4. Testing Workflow

Every remediation MUST pass these tests before certification:

1. **Build test** — Run `npx vite build` (client) or `node -e 'require(...)'` (server)
2. **Self review** — Check for correctness and side effects
3. **Browser test** — User verifies in browser
4. **Regression test** — Verify existing features still work

Document test results in the finding entry. If any test fails, stop and fix before proceeding.

---

## 5. Phase Exit Criteria

A phase may ONLY be certified when ALL of the following are true:

- [ ] All findings are CLOSED (CERTIFIED, CLOSED, or WONT_FIX with justification)
- [ ] All build tests pass for every remediation
- [ ] Browser verification completed for every remediation
- [ ] Regression testing completed for every remediation
- [ ] CERTIFICATION.md is updated with phase summary
- [ ] AUDIT_STATUS.md is updated
- [ ] DECISIONS.md logs all decisions made during the phase
- [ ] CHATGPT_CONTEXT.md is updated

Only then may the next phase begin.

---

## 6. Documentation Policy

- **No unnecessary markdown files** — All audit docs live inside `audit/`
- **No temporary reports** — Each finding is documented permanently in its phase's FINDINGS.md
- **No duplicated summaries** — MASTER_INDEX.md is the single entry point; do not summarize elsewhere
- **No extra notes** — Use DECISIONS.md for all non-finding decision logging
- **PROJECT_PRINCIPLES.md** is the only document that changes rarely — it defines permanent engineering philosophy

### 6.1 File Structure

```
audit/
├── GOVERNANCE.md            ← This file — audit rules
├── PROJECT_PRINCIPLES.md    ← Permanent engineering philosophy
├── MASTER_INDEX.md          ← Index of all 10 phases
├── AUDIT_STATUS.md          ← Live status dashboard
├── REMEDIATION_ROADMAP.md   ← Remediation roadmap
├── DECISIONS.md             ← Architectural decisions
├── CHATGPT_CONTEXT.md       ← Single context file for ChatGPT
├── templates/
│   ├── FINDINGS.md          ← Finding entry template
│   └── CERTIFICATION.md     ← Phase certification template
├── phase-01-foundation/
│   ├── FINDINGS.md
│   └── CERTIFICATION.md
├── phase-02-security/
... (phases 03-10 follow same pattern)
```

---

## 7. Audit Categories

Every finding MUST belong to exactly one category:

| Category | Description |
|----------|-------------|
| **Architecture** | Structural design, layering, separation of concerns |
| **Security** | Authentication, authorization, data protection, input validation |
| **Backend** | Server logic, routes, controllers, services |
| **API** | Endpoint contracts, response format, error handling |
| **Database** | Schema design, indexes, queries, data integrity |
| **Streaming** | HLS pipeline, stream tokens, thumbnails, external sources |
| **Frontend** | Pages, components, state management, routing |
| **Performance** | Bundle size, render optimization, query speed, caching |
| **Accessibility** | ARIA attributes, keyboard navigation, screen reader support |
| **UX** | User experience, visual design, interaction patterns |
| **DevOps** | Docker, deployment, CI/CD, monitoring |
| **Code Quality** | Readability, maintainability, consistency, duplication |
| **Testing** | Test coverage, test quality, test infrastructure |
| **Documentation** | Missing or outdated documentation |

---

## 8. Status Enumeration

Only these status values are valid. No custom statuses permitted.

| Status | Definition |
|--------|------------|
| **OPEN** | Finding identified but not yet verified |
| **VERIFIED** | Confirmed real and reproducible |
| **APPROVED** | Remediation plan approved by user |
| **IMPLEMENTING** | Code changes in progress |
| **IMPLEMENTED** | Code changes applied |
| **BUILD PASSED** | Build/typecheck passed |
| **WAITING USER TEST** | Awaiting user browser verification |
| **REGRESSION PASSED** | Regression testing completed |
| **CERTIFIED** | All tests passed, finding resolved |
| **CLOSED** | Finding complete and archived |
| **REJECTED** | Finding deemed not valid |
| **WONT_FIX** | Acknowledged but not fixing (with justification) |

---

## 9. Risk Classification

| Risk Level | Definition | Examples |
|------------|------------|----------|
| **Critical** | System compromise, security breach, data corruption, application unusable | SQL injection, auth bypass, data loss, crash on load |
| **High** | Major functionality broken, no practical workaround | Wrong business logic, broken API endpoint, memory leak |
| **Medium** | Incorrect behaviour, workaround exists | Wrong sort order, missing error state, slow query |
| **Low** | Minor defect, cosmetic issue | Misaligned CSS, typo in label, unused import |
| **Information** | Documentation, maintenance, cleanup | Missing comment, outdated doc, dead code |

---

## 10. Architecture Protection Rules

These rules are immutable audit law:

1. **Controllers remain thin** — Controllers MUST NOT contain business logic. Delegate to services.
2. **Business logic belongs in services** — All business logic MUST live in service modules, never in routes or controllers.
3. **React components never contain business logic** — Components handle presentation only. Data fetching and transformation belong in hooks, API modules, or context.
4. **Database access remains isolated** — Only models and services may query the database. Routes and controllers MUST NOT.
5. **Provider abstraction** — No application layer may directly depend on YupFlix. All external provider access must pass through provider abstraction interfaces (`content-source.service.js`, `external-source.routes.js`).
6. **No provider-specific logic inside UI** — Frontend components MUST NOT reference provider names or provider-specific data structures.
7. **Avoid circular dependencies** — Service A importing Service B that imports Service A is prohibited. Use dependency injection or event-based communication.
8. **Avoid duplicated business logic** — If the same logic appears in two places, extract it to a shared service.
9. **Avoid global mutable state** — Use React context, hooks, or props for state management. No global variables.
10. **Maintain clear separation of concerns** — Each module has one responsibility. If a module does two unrelated things, split it.
11. **API compatibility** — Never break backward compatibility for client-facing APIs without explicit approval.
12. **Data integrity** — Never modify database schemas without a migration plan.
13. **Security boundaries** — Never remove authentication or authorization without explicit approval.

---

## 11. Audit Restrictions

During audits the AI may NOT:

- Add features beyond the scope of the current finding
- Redesign UI unless directly required by the finding
- Upgrade dependencies unless the finding requires it
- Rename APIs, functions, or components without approval
- Move folders or restructure directories
- Perform broad refactors unrelated to the finding
- Rewrite working code without justification
- Modify modules unrelated to the current finding
- Expand project scope beyond what was approved

---

## 12. Context Preservation Rules

1. **CHATGPT_CONTEXT.md** is the single context file for ChatGPT sessions
2. Upload CHATGPT_CONTEXT.md at the start of every new ChatGPT conversation
3. After each phase, update CHATGPT_CONTEXT.md
4. After each significant decision, update DECISIONS.md

---

## 13. File Creation Policy

- Create files ONLY when part of the approved audit framework
- All new files must be listed in MASTER_INDEX.md
- No file outside `audit/` may reference audit findings directly (findings reference code, not the other way)
- Temporary files are prohibited — all work stays within the audit structure

---

## 14. Rollback Policy

If a remediation breaks existing functionality:

1. Revert the change immediately in code
2. Document the failure in the finding's FINDINGS.md entry (add a `FAILED_ATTEMPT` note)
3. Re-classify the finding if risk or severity changed
4. Re-enter the workflow at PROPOSE REMEDIATION with a different approach
5. Do not proceed to certification until all rollback actions are complete

---

## 15. Finding Status Lifecycle

```
OPEN
 ↓
VERIFIED
 ↓
APPROVED
 ↓
IMPLEMENTING
 ↓
IMPLEMENTED
 ↓
BUILD PASSED
 ↓
WAITING USER TEST
 ↓
REGRESSION PASSED
 ↓
CERTIFIED
 ↓
CLOSED

Branches:
  REJECTED (from VERIFIED — finding not valid)
  WONT_FIX  (from APPROVED — acknowledged but deferred)
  Any FAILED state returns to IMPLEMENTING
```
