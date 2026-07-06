# NovaStream Audit — Remediation Roadmap

> **Purpose:** Strategic roadmap for fixing all audit findings, organized by priority and phase.
> **Last Updated:** July 2, 2026

---

## Priority Matrix

| Priority | Definition | Action |
|----------|------------|--------|
| **P0** | Security vulnerability or data loss risk | Fix immediately within current phase |
| **P1** | Functional bug or performance regression | Fix within current phase |
| **P2** | Code quality or missing edge case | Fix in current phase or defer to optimization phase |
| **P3** | Cosmetic or nice-to-have | Defer to later phase or backlog |

---

## Phase Roadmap

### Phase 01 — Foundation
**Status:** 🔄 Remediation in Progress (July 2, 2026)
**Target:** F-004, F-005 certified ✅

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-001 — No automated tests exist | P0 | XXL | Framework setup |
| F-002 — 401 interceptor causes full page reload | P1 | M | None |
| F-003 — Content routes global auth creates fragile ordering | P1 | M | None |
| F-005 — Duplicate validation: Zod vs inline | P2 | XS | None |
| F-006 — Magic numbers scattered without constants | P2 | XS | None |
| F-007 — Defensive trim logic duplicated across files | P2 | S | None |
| F-008 — `controllers/README.md` is dead code | P3 | XS | None |
| F-009 — Inline `require()` calls in admin routes | P2 | XS | None |
| F-010 — Inconsistent error responses | P2 | S | None |
| F-011 — No global request timeout middleware | P1 | XS | None |
| F-012 — No React Error Boundaries | P1 | S | None |
| F-013 — Segment filename lacks whitelist validation | P1 | XS | None |
| F-014 — `pino-pretty` could load in production | P2 | XS | None |
| F-015 — CLI creates new connection per command | P3 | S | None |
| F-016 — No OpenAPI/Swagger documentation | P3 | M | Zod schemas |
| F-017 — TMDB image URLs in multiple places | P3 | S | None |
| F-018 — Admin logs hardcodes PM2 log path | P2 | S | None |
| F-019 — No graceful degradation for external source | P2 | M | None |
| F-020 — Auth middleware sets both `_id` and `id` | P2 | XS | None |

### Phase 02 — Security
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-013 — Segment filename lacks whitelist validation | P1 | XS | None |
| F-020 — Auth middleware sets both `_id` and `id` | P2 | XS | None |

### Phase 03 — Backend
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-003 — Content routes global auth fragile ordering | P1 | M | None |
| F-009 — Inline `require()` calls in admin routes | P2 | XS | None |
| F-011 — No global request timeout middleware | P1 | XS | None |
| F-014 — `pino-pretty` could load in production | P2 | XS | None |

### Phase 04 — Database
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-006 — Magic numbers scattered without constants | P2 | XS | None |
| F-007 — Defensive trim logic duplicated across files | P2 | S | None |

### Phase 05 — Streaming
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-019 — No graceful degradation for external source | P2 | M | None |

### Phase 06 — Frontend
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-002 — 401 interceptor causes full page reload | P1 | M | None |
| F-012 — No React Error Boundaries | P1 | S | None |

### Phase 07 — Performance
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-001 — No automated tests exist | P0 | XXL | All phases (test coverage needed) |

### Phase 08 — Production
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-015 — CLI creates new connection per command | P3 | S | None |
| F-018 — Admin logs hardcodes PM2 log path | P2 | S | None |

### Phase 09 — Scalability
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| F-008 — `controllers/README.md` is dead code | P3 | XS | None |
| F-010 — Inconsistent error responses | P2 | S | None |
| F-016 — No OpenAPI/Swagger documentation | P3 | M | Zod schemas |
| F-017 — TMDB image URLs in multiple places | P3 | S | None |

### Phase 10 — Final Certification
**Status:** ⬜ Not Started
**Target:** [TBD]

| Finding | Priority | Effort | Dependencies |
|---------|----------|--------|--------------|
| — | — | — | All phases must be certified |

---

## Effort Estimates

| Effort | Range | Example |
|--------|-------|---------|
| **XS** | < 30 min | Simple config change, typo fix, one-file change |
| **S** | 1-2 hours | Small feature or bug fix, single service change |
| **M** | 2-4 hours | Cross-file change, new middleware, significant refactor |
| **L** | 4-8 hours | New service or endpoint, multi-layer change |
| **XL** | 1-3 days | Major architectural change, provider abstraction |
| **XXL** | 3-5 days | New feature or system, full-phase implementation |

---

---

## Track C — Dynamic Provider Plugin System Roadmap

**Status:** 🟡 ARCHITECTURE PROPOSAL — Implementation NOT STARTED
**Governance:** See `audit/phase-c-provider-system/` for full proposal

| Phase | Name | Effort | Dependencies | Priority |
|:-----:|------|:------:|--------------|:--------:|
| C1 | Documentation Freeze | XS | None | P0 (prerequisite) |
| C2 | Provider Framework (BaseProvider, ProviderManager, ProviderRegistry) | M | C1 | P1 |
| C3 | YupFlix Migration (embedded → plugin) | M | C2 | P1 |
| C4 | CastleTV Provider | M | C3 | P2 |
| C5 | Extractor System (ExtractorManager + streamwish/filemoon) | S | C2 | P2 |
| C6 | Provider Admin Management (API + CLI + Frontend) | M | C3, C5 | P3 |
| C7 | Remote Update Support (future) | L | C6 | P3 (deferred) |

**Principle:** Never break the existing streaming pipeline. Each phase must be independently deployable.

---

## Dependency Tracking

| Finding ID | Blocked By | Blocks |
|------------|------------|--------|
| F-001 | Testing framework decision | — |
| F-003 | Phase 2 (security) cert before backend changes | — |
| F-004 | — | F-005 (validation consistency) |
| C-001 | — | C-002 through C-007 |
| C-002 | C-001 | C-003 |
| C-003 | C-002 | C-004 |
