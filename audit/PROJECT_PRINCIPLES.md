# NovaStream — Project Principles

> **Purpose:** Permanent engineering philosophy for the NovaStream project. These principles define how code is written, how architecture is structured, and how decisions are made. They change rarely.
>
> **Last Updated:** July 2, 2026

---

## 1. Provider-Agnostic Architecture

The platform must never be locked into a single provider. All external dependencies (streaming sources, metadata providers, CDNs) must be accessed through abstraction layers. Current provider is YupFlix; future providers must be integrable without rewriting application logic.

## 2. Security First

Security is not a feature — it is a fundamental constraint. Every endpoint, every input, every data path must be protected by default. Authentication, authorization, rate limiting, input validation, and output sanitization are non-negotiable.

## 3. Maintainability Before Cleverness

Code is read far more often than it is written. Favor clarity over cleverness. Use descriptive names, explicit patterns, and straightforward logic. If a solution is hard to explain, it is too complex.

## 4. Production-Ready Code Only

No half-implemented features. No TODO comments without associated tasks. No dead code paths. Every merged change must work correctly in production. If a feature cannot be completed, it should not be merged.

## 5. Thin Controllers

HTTP controllers must contain zero business logic. Their sole responsibility is parsing request input, calling the appropriate service, and formatting the response. Everything else belongs in services.

## 6. Business Logic in Services

All business logic lives in service modules. Services are testable, reusable, and independent of HTTP concerns. A service method receives plain data and returns plain data — it knows nothing about requests or responses.

## 7. Consistent API Contracts

Every API response follows the same structure: `{ success, data, message, timestamp }`. Paginated responses add `{ pagination }`. Errors use `{ success: false, message, details, timestamp }`. No endpoint may deviate from these contracts.

## 8. Scalable Design

Design for horizontal scaling from the start. Sessions are stored in the database (not in memory). Rate limiting is per-IP (not per-instance). Caching is explicit and configurable. Stateless where possible, stateful where necessary.

## 9. Performance Conscious

Every query, every render, every network request must be intentional. N+1 queries are unacceptable. Bundle size must be monitored. Caching must be used where appropriate. Performance regressions are treated as bugs.

## 10. No Hidden Technical Debt

Every known issue must be documented. If a shortcut is taken, it must be recorded with a plan to address it. Silent accumulation of technical debt erodes the entire codebase.

## 11. Testable Code

Code should be written in a way that makes testing straightforward. Dependency injection, pure functions where possible, and clear separation of concerns. If code is hard to test, it is poorly designed.

## 12. Documentation-Driven Changes

Every significant change must be documented before it is implemented. The audit framework governs this process. Documentation and code are both first-class deliverables.

## 13. Minimal Complexity

Every line of code carries a maintenance cost. Do not add code that is not needed. Do not abstract before there is a clear need. Do not over-engineer for hypothetical futures. Solve today's problems today.

## 14. Long-Term Maintainability

The project must remain maintainable 12 months from now. This means clear naming, consistent patterns, thorough documentation, and disciplined governance. Short-term convenience must never compromise long-term maintainability.

## 15. No Vendor Lock-In

No dependency may become irreplaceable. Database choices, cloud providers, streaming services, and authentication providers must all have fallback options or clear migration paths. The platform belongs to the project — not to any vendor.
