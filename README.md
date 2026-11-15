# base

Express + Prisma + Better Auth server and a Vite + React client.

## Setup

Requires Node 22 and a local PostgreSQL (e.g. Postgres.app) on `localhost:5432`.

```bash
cp server/example.env server/.env   # adjust the Postgres user/password if needed
npm run init                        # install deps, generate Prisma clients, create + migrate + seed both databases
```

`npm run init` resets the `valio` and `valio_events` databases — run it once, or whenever you want a clean slate.
`npm run setup` only installs dependencies, generates the Prisma clients and enables the git hooks.

## Run

```bash
cd server && npm start      # API on http://localhost:3000
cd client && npm run dev    # app on http://localhost:5173 (proxies /api and /ws to :3000)
```

Log in as `demo@example.com` (Anna Virtanen, purchasing manager) or `mikko@example.com` (Mikko Laine, head chef — the
approver) with `SEED_USER_PASSWORD` from `server/.env` (`hackjunction` by default).

## AI-MO gateway (server/src/domains/gateway)

The gateway that outside AI buyer agents order through. It enforces the buyer's signed policy on every order, signs
quotes (Ed25519) and appends every step to a hash-chained audit log.

- **REST**: `/api/gw/*` — spec at `GET /api/openapi.json` (source: `server/src/domains/gateway/openapi.ts`).
- **MCP**: Streamable HTTP at `/mcp` (POST JSON-RPC, stateless). Tools: `search_products`, `get_product`, `get_quote`,
  `rank_substitutes`, `place_order`, `get_order`, `get_policy`.
- **Auth**: agents send `x-api-key: mk_live_…`; the key's agent row fixes the org and the bound policy. The web UI uses
  the session cookie (approvals, signing and key management are people-only).
- **Seed**: `cd server && npm run seed:app` (idempotent) adds policies v1–v3, the Gemini + Nemotron agents with API keys
  (printed once and written to `server/.agent-keys.local.json`, gitignored), this week's orders (€2,793 before today
  on the real catalog, €2,828 on the sample one) and today's three demo scenarios (VA-20480 routine, VA-20481 stock-out
  approved, VA-20482 approval timeout).
- **Valio**: set `VALIO_API_URL` + `VALIO_API_KEY` for the real API, otherwise a deterministic simulator answers.
- **Real product catalog**: put Valio's challenge files in the git-ignored `data/` folder (licence: Junction 2026
  only — never commit or copy them into the repo) and set, in `server/.env`:
  ```
  VALIO_PRODUCTS_FILE=../data/valio_aimo_junction26_product_data.json
  VALIO_RELIABILITY_FILE=../data/valio_aimo_junction26_delivery_reliability.csv
  VALIO_CARBON_FILE=../data/valio_aimo_junction26_carbon_footprint.csv
  ```
  17.5k products load at startup (~1 s; ~450 MB RSS). Without them the 20-product `server/data/products.sample.json`
  is used. With the live API the whole catalog is priced once at startup to check litres / kg per sales unit against
  Valio's comparison prices; catalog list prices are fetched live per page (cached 10 min).
- **Automations**: standing orders (`/api/gw/automations`) the gateway places itself on a Europe/Helsinki schedule, as the chosen agent and under its signed policy — real orders. Swept every 30 s; missed slots older than 2 h are skipped.
- **Plain-language requests**: `POST /api/gw/requests/parse` (MCP `parse_request`) turns "1,000 l lactose-free milk for Monday" into catalog lines + a date (Gemini if `GEMINI_API_KEY`, else rules). It never orders.
- **Tests**: `cd server && npm test` (policy engine, audit chain, schedule math, request parser, real-catalog loader /
  categories / search — the last skip when `data/` is absent — `node --test`).

```bash
KEY=$(node -p "require('./server/.agent-keys.local.json').agt_gemini.key")
curl -s localhost:3000/api/gw/health
curl -s -H "x-api-key: $KEY" -H 'content-type: application/json' localhost:3000/api/gw/orders \
  -d '{"lines":[{"code":"464398","quantity":400,"unit":"l"}],"requestedDate":"2026-11-16"}'
curl -s -H "x-api-key: $KEY" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  localhost:3000/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Database changes

```bash
cd server
npx prisma migrate dev --name <name>                                    # app schema
npx prisma migrate dev --schema=prisma/events/schema.prisma --name <name>  # event-store schema
```

Commit the generated `prisma/migrations/<timestamp>_<name>/` directory. Never use `prisma db push`.

## Worktrees

`npm run setup` points git at `.githooks/`. Its `post-checkout` hook links `client/node_modules`, `server/node_modules`
and `server/.env` (listed in `.claude/settings.json`) into new worktrees and generates the Prisma clients there.
