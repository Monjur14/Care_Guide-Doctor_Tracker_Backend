# Doctor Tracker: backend

The REST API behind Doctor Tracker. It is a standalone Express 5 server written in TypeScript, storing data in
MongoDB through Mongoose. It handles authentication, doctors, patients, dashboard statistics and filter
options. The [frontend](https://github.com/Monjur14/Care_Guide-Doctor_Tracker_Frontend) is its only client.

- **Stack:** Node.js 22, Express 5, Mongoose 9, Zod 4, JWT session cookie, Pino logging
- **Tests:** Vitest + Supertest against an in-memory MongoDB (43 tests)
- **API docs:** OpenAPI 3.1 generated from the same Zod schemas used for validation, served with Swagger UI

## Quick start

Requires **Node.js 22.9+** (see `.nvmrc`) and a MongoDB database (local, or a free Atlas cluster).
```bash
git clone https://github.com/Monjur14/Care_Guide-Doctor_Tracker_Backend.git
cd Care_Guide-Doctor_Tracker_Backend
npm install
cp .env.example .env     # then set MONGODB_URI, JWT_SECRET, SEED_ADMIN_*
npm run seed             # admin user + 40 doctors + 800 patients (skipped if data exists)
npm run dev              # http://localhost:4000 (restarts on change)
```

Check it is up:

```bash
curl http://localhost:4000/api/health      # {"status":"ok"}
```

Then open **http://localhost:4000/api/docs**: sign in with **Auth → POST /auth/login → Try it out** using the
seeded admin, and every other endpoint can be tried from the browser (the session cookie is sent automatically).

## Configuration

All variables are validated with Zod at startup. A missing or invalid value stops the server with a message
naming the variable (never its value). See [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | *(required)* | `mongodb://` or `mongodb+srv://` connection string |
| `JWT_SECRET` | *(required)* | At least 32 characters. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `NODE_ENV` | `development` | `production` enables secure cookies and stricter checks |
| `PORT` | `4000` | HTTP port |
| `LOG_LEVEL` | `info` | Pino level (`silent` in tests) |
| `SESSION_TTL_MINUTES` | `480` | Session lifetime (5 to 1440) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated frontend origins, used for CORS and the CSRF origin check |
| `TRUST_PROXY` | `1` | Number of proxies in front of the API (1 on Vercel), so rate limiting sees the real client IP |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost (must be 10 or more in production) |
| `API_DOCS_ENABLED` | on, off in production | Set `true` to publish Swagger UI in production |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | | Used only by `npm run seed`. The password needs 12+ characters |

> If your network blocks DNS SRV lookups, `mongodb+srv://` fails to resolve. Use the standard
> `mongodb://host1,host2,host3/...?replicaSet=...&tls=true` form from Atlas → Connect → Drivers instead.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with `tsx watch`, reading `.env` |
| `npm run build` / `npm start` | Bundle with tsup to `dist/`, then run it |
| `npm test` | Run the test suite (downloads a MongoDB binary on first run) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Create or update the admin user, and add 40 doctors + 800 patients if the database is empty. `npm run seed -- --reset` regenerates them |
| `npm run db:indexes` | Sync the indexes declared in the models to the database |
| `npm run db:explain` | Print the query plan of every hot query (should show index scans, no `COLLSCAN`) |

## Project structure

```
.
├─ api/index.js        Vercel serverless entry (exports the bundled Express app)
├─ src/
│  ├─ app.ts           Express app: middleware order, routers, error handling
│  ├─ server.ts        Local entry: connects to MongoDB and listens
│  ├─ routes.ts        /api/v1 router; everything after /auth requires an admin session
│  ├─ config/          env validation, Mongo connection (cached across invocations), logger
│  ├─ middleware/      auth, security headers + CORS + CSRF, rate limits, request logging, errors
│  ├─ models/          User, Doctor, Patient schemas; each index commented with the query it serves
│  ├─ modules/         auth, doctors, patients, stats, meta. Each is routes → controller → service
│  ├─ docs/            OpenAPI document built from the Zod schemas + Swagger UI route
│  └─ utils/           search tokens, pagination helpers, AppError, serialization
├─ scripts/            seed, sync-indexes, explain (+ shared query definitions in lib/)
├─ shared/             @doctor-tracker/shared: Zod schemas, enums and API types (also in the frontend repo)
└─ tests/              Vitest suites; helpers create an admin and a logged-in agent
```

Request validation schemas, enums and response types live in [`shared/`](shared), installed as the local
package `@doctor-tracker/shared` (`"file:./shared"`). The frontend repo carries the same folder, so its forms
validate with exactly the same rules as the API. **When you change a schema, copy `shared/` to the other repo.**

## API overview

Base path: **`/api/v1`**. JSON in and out. Every route except `/auth/login` and `/api/health` needs an admin
session.

- **Lists** return `{ data, meta: { page, limit, total, totalPages } }`. `limit` defaults to 10, max 100.
- **Errors** return `{ error: { code, message, details?, requestId } }`. Validation errors list each failing
  field in `details`; duplicate emails return `409` with the field name.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → sets the session cookie |
| POST | `/auth/logout` | Revokes every session of the user |
| GET | `/auth/me` | Current user |
| GET | `/doctors` | `page, limit, search, specialization, hospital, from, to, sort=createdAt\|name, order` |
| POST | `/doctors` | `{ name, specialization, hospital, phone, email }` |
| GET / PATCH | `/doctors/:id` | Includes `patientCount` |
| GET | `/doctors/:id/patients` | Same filters as `/patients` |
| POST | `/doctors/:id/patients` | Add a patient under this doctor |
| DELETE | `/doctors/:id/patients/:patientId` | Remove a patient from this doctor's list |
| GET | `/patients` | `page, limit, search, condition, status, gender, doctorId, minAge, maxAge, from, to, sort=admissionDate\|createdAt\|name\|age, order` |
| GET / PATCH / DELETE | `/patients/:id` | PATCH accepts `doctorId` to reassign the patient |
| GET | `/stats/overview` | Totals, counts by status and condition, last 30 days |
| GET | `/stats/patients-per-doctor` | Top `limit` doctors by patient count |
| GET | `/stats/timeline` | `from, to, interval=day\|month, tz` (IANA zone); empty buckets filled with 0 |
| GET | `/meta/filters` | Dropdown options: specializations, conditions, statuses, genders, hospitals |
| GET | `/api/health` | Public liveness check |
| GET | `/api/docs`, `/api/openapi.json` | Swagger UI and the raw OpenAPI spec |

Example:

```bash
curl -c /tmp/dt-cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@doctortracker.dev","password":"<your SEED_ADMIN_PASSWORD>"}' \
  http://localhost:4000/api/v1/auth/login

curl -b /tmp/dt-cookies.txt 'http://localhost:4000/api/v1/patients?status=admitted&condition=Diabetes&limit=5'
```

## Authentication and security

- **Session:** an HS256 JWT (algorithm pinned, issuer and audience checked) in an `httpOnly`, `SameSite=Lax`
  cookie (`__Host-dt_session` and `Secure` in production). JavaScript can't read it.
- **Revocation:** each user has a `tokenVersion`. Logout increments it, which invalidates every outstanding
  token. A rejected cookie is also cleared, so the frontend's redirect gate can't loop.
- **Brute force:** login is rate limited per IP (10 failures per 15 min) and the account locks for 15 minutes
  after 5 failed attempts. The lockout is stored in MongoDB, so it holds across serverless instances. Unknown
  email and wrong password return the same message.
- **CSRF:** state-changing requests must come from an allowed `Origin`, on top of `SameSite` cookies.
- **Input:** strict Zod schemas reject unknown fields, the `simple` query parser blocks `?a[$ne]=` operator
  injection, and JSON bodies are capped at 10 kB.
- **Other:** Helmet security headers, `Cache-Control: no-store` on API responses, a general limit of 600
  requests per 15 minutes per IP, and request IDs on every log line and error.

Full mapping to the OWASP Top 10:2025: [SECURITY.md](SECURITY.md).

## Query performance

- **Every list query uses an index.** Compound indexes end with `_id` to match the stable sort, so MongoDB
  reads results in index order instead of sorting in memory. `npm run db:explain` prints each plan, and
  `tests/indexes.test.ts` fails if any hot query falls back to a collection scan.
- **Search** stores normalized word tokens in a multikey `searchTokens` index and queries them with
  anchored prefix regexes. It is case and accent insensitive, matches any word ("smi" finds "John Smith")
  and uses index bounds rather than scanning names.
- **Pagination** runs the page query and the count in parallel; unfiltered totals use
  `estimatedDocumentCount` (collection metadata, no scan).
- **No N+1 queries:** patient counts for a page of doctors come from one `$group`, and doctor names on a page
  of patients from one `populate` (`$in`) query.
- **Dashboard:** status and condition counts are parallel index-only count scans; patients per doctor groups
  over a covered index and joins only the top N doctors; the timeline is a range scan on `admissionDate`
  grouped in the viewer's time zone.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs type checking, the test suite and `npm audit` on every push
and pull request. Dependabot opens weekly dependency update PRs.

## Testing

```bash
npm test
```

Each run starts an in-memory MongoDB (`mongodb-memory-server`), so no database setup is needed. Suites cover
auth and session security, doctors, patients, stats, index usage, and an OpenAPI contract test that checks
real responses against the documented schemas.

## Deployment (Vercel)

Import this repo as a Vercel project (no root directory change needed). `vercel.json` builds with tsup and
rewrites every path to the serverless function in `api/index.js`.

1. Set the environment variables above in the Vercel project (`NODE_ENV=production`,
   `CORS_ORIGINS=https://<your-frontend-domain>`, `TRUST_PROXY=1`).
2. In MongoDB Atlas, allow connections from Vercel (Network Access).
3. Run `npm run seed` once against the production database from your machine.
4. Set the frontend's `API_URL` to this deployment's URL.

The Mongo connection is cached on the module, so warm invocations reuse it, and the `ensureDb` middleware
connects lazily on cold starts.
