# Development, tests and API

## Run without Docker for the apps

You need Node.js 20+. Docker still runs PostgreSQL and Redis.

```bash
# Databases (opens ports 5432 and 6379)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis

# API, terminal 1 (http://localhost:4000)
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev

# Worker, terminal 2
cd backend
npm run worker

# UI, terminal 3 (http://localhost:5173)
cd frontend
npm install
npm run dev
```

## Tests

The 44 backend tests use their own database, `infra_portal_test`, which is emptied on every run.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
docker compose exec postgres createdb -U portal infra_portal_test   # first time only
cd backend
npm test
```

The 6 LDAP login tests are skipped unless `LDAP_TEST_URL` points to the demo directory. CI runs them.

To test a running portal end to end (needs `curl` and `jq`):

```bash
scripts/smoke-test.sh http://localhost:8080
```

## CI

GitHub Actions runs on every push and pull request.

| Job | What it checks |
|---|---|
| backend | Typecheck, all tests, build |
| frontend | Lint, build |
| terraform | Generated files pass `terraform fmt` and `terraform validate` |
| docker | `docker compose up --build`, then the smoke test |

## API

All paths start with `/api`. Everything except login needs `Authorization: Bearer <token>`.

| Method | Path | Who |
|---|---|---|
| POST | `/auth/login` | Anyone |
| GET | `/auth/me` | Logged in |
| GET | `/catalog` | Logged in |
| POST, PATCH | `/catalog`, `/catalog/:id` | Admin |
| GET, POST | `/requests` | Logged in |
| GET | `/requests/pending-approvals` | Approver, admin |
| GET | `/requests/:id` | Owner, team approver, admin |
| POST | `/requests/:id/approve`, `/reject` | Team approver, admin |
| POST | `/requests/:id/retry`, `/decommission`, `/extend` | Owner, team approver, admin |
| GET | `/teams/quota` | Logged in |
| PUT | `/teams/:id/quota` | Admin |
| GET | `/audit` | Admin |
