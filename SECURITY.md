# Security: OWASP Top 10 (2025) mapping

How the Doctor Tracker API addresses each OWASP Top 10:2025 category. Every row points at the code
that implements the control, and most controls are covered by an automated test in `tests/`.

| # | Category | Controls in this project | Where |
|---|---|---|---|
| A01 | Broken Access Control | Deny by default: every `/api/v1` route except `POST /auth/login` sits behind `requireAuth` + `requireRole('admin')`, including unknown routes (401, not 404, so routes can't be enumerated). Nested deletes are scoped (`DELETE /doctors/:id/patients/:pid` only deletes a patient that belongs to that doctor). CORS allows only the configured frontend origins with credentials. No outbound HTTP calls, so no SSRF surface. | `src/routes.ts`, `src/middleware/auth.ts`, `src/middleware/security.ts` |
| A02 | Security Misconfiguration | Helmet with an API-only CSP (`default-src 'none'`, `frame-ancestors 'none'`), HSTS, `no-referrer`, `X-Powered-By` removed. `Cache-Control: no-store` on all API responses (patient data). Environment validated at startup (fails fast; reports names of bad variables, never their values). `autoIndex` off in production. JSON body limit 10 KB. Swagger UI (`/api/docs`) is off by default in production (`API_DOCS_ENABLED`). | `src/middleware/security.ts`, `src/config/env.ts`, `src/app.ts` |
| A03 | Software Supply Chain Failures | Small dependency set of well-maintained packages, `package-lock.json` committed, `npm ci` in CI, `npm audit --omit=dev --audit-level=high` gate in CI, Dependabot weekly updates. Swagger UI assets are loaded from a pinned version with Subresource Integrity hashes, and the docs page runs under its own strict CSP with a per-request nonce. | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| A04 | Cryptographic Failures | Passwords hashed with bcrypt (cost 12, ≥10 enforced in prod; 72-byte limit checked). JWT signed HS256 with a ≥32-char secret from env, algorithm pinned on verify. Cookie is `HttpOnly`, `Secure` and `__Host-` prefixed in production. TLS terminated by Vercel / Atlas (`mongodb+srv` uses TLS). | `src/modules/auth/*`, `src/config/env.ts` |
| A05 | Injection | Every body, query and path param is parsed by a strict Zod schema (unknown keys rejected, primitives only), so `{"email":{"$ne":null}}` is a 400. Express `simple` query parser: `?a[$ne]=x` is a literal key, never an object; repeated params are rejected. Mongoose `strictQuery`. Search terms are reduced to word characters, regex-escaped and anchored (no regex injection / ReDoS). Sort fields come from an allow-list. | `shared/src/schemas/*`, `src/utils/search.ts`, `src/app.ts` |
| A06 | Insecure Design | Pagination caps (`limit` ≤ 100, `page` ≤ 1000) and date-range caps on analytics so a single request can't trigger an expensive scan. Mass-assignment prevented by explicit schemas (clients can't set `_id`, `createdAt`, `searchTokens`, `role`). Seed script refuses to run in production without `--force`. | shared schemas, `scripts/seed.ts` |
| A07 | Authentication Failures | Generic "Invalid email or password" for both unknown email and wrong password, with a dummy bcrypt compare so timing doesn't reveal which emails exist. Per-account lockout (5 failures → 15 min) stored in MongoDB, so it holds across serverless instances. Per-IP login rate limit. Server-side revocation: logout bumps `tokenVersion`, so a stolen token stops working immediately. Session TTL 8 h by default. | `src/modules/auth/auth.service.ts`, `src/middleware/rateLimit.ts` |
| A08 | Software or Data Integrity Failures | JWT verified with pinned algorithm, issuer and audience (rejects `alg: none` and forged tokens). No deserialization of untrusted data beyond JSON. CSRF defence: `SameSite=Lax` cookie + Origin allow-list on writes (same-origin requests from `/api/docs` are allowed) + JSON-only bodies (a cross-site form can't send JSON without a CORS preflight). CI must pass before merge. | `src/modules/auth/session.ts`, `src/middleware/security.ts` |
| A09 | Security Logging and Alerting Failures | Structured JSON logs (pino) with a request ID returned in `X-Request-Id` and in error bodies. Security events logged with an `event` field: `auth.login_success`, `auth.login_failed`, `auth.account_locked`, `auth.logout`, revoked or invalid tokens, blocked origins. Cookies, auth headers and passwords are redacted; request bodies (patient data) are never logged. | `src/config/logger.ts`, `src/middleware/requestLogger.ts` |
| A10 | Mishandling of Exceptional Conditions | One central error handler maps every error type (Zod, Mongoose cast/validation, duplicate key, malformed or oversized JSON) to a consistent `{ error: { code, message, details, requestId } }` with the right status. Unknown errors become a generic 500; stack traces and submitted values are never returned. Express 5 forwards async errors automatically. The DB connection retries cleanly after a failed connect; unhandled rejections are logged and stop the local process. | `src/middleware/errorHandler.ts`, `src/config/db.ts`, `src/server.ts` |

## Known limitations

- The per-IP rate limiter uses an in-memory store, which is per serverless instance. The account
  lockout in MongoDB is the durable control; a shared store (e.g. Upstash Redis) would make the
  IP limit global.
- Single `admin` role. `requireRole` is in place so more roles can be added without touching routes.
- No MFA, and patient fields are not encrypted at the field level (they rely on Atlas encryption at rest).
- Logs go to stdout (Vercel log drains). Alerting on `auth.account_locked` spikes would be set up in
  the log platform.

## Operational checklist

- Generate `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- Atlas: a dedicated database user with `readWrite` on the app database only, and a network access list.
- Set `CORS_ORIGINS` to the exact production frontend URL.
- Run `npm run db:indexes` after deploying schema changes.
