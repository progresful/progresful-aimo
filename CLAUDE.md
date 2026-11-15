# Claude Code Instructions

See `AGENTS.md` — the rules there apply to every agent working on this project, Claude Code included.

## Stack

- **Server** (Express 5 + Prisma 6 + Better Auth, native TypeScript on Node 22) on `:3000` — `cd server && npm start`
- **Client** (Vite + React 19 + Chakra UI v3) on `:5173` — `cd client && npm run dev`, proxies `/api` and `/ws` to `:3000`
- **PostgreSQL** (local) with two databases: `valio` (app) and `valio_events` (event store)

`PROJECT.md` is the canonical map of routes, endpoints, models and key files — read it at the start of every turn.

## Must follow

1. Every `import` must resolve to an existing file in the same turn.
2. Schema edit → `npx prisma migrate dev --name <name>` (in `server/`) → restart the server. Never `db push`. Commit the generated migration dir.
3. Seeds must be idempotent; new seed files are wired into `server/seed/withCommands.ts`.
4. Never hardcode `http://` in client code — use relative paths or `window.location.origin`.
5. External-facing endpoints need explicit CORS headers.
6. Don't kill the user's running server or client; test on another port.

## Full reference

- `README.md` — setup, running, database changes, worktrees
- `PROJECT.md` — routes, endpoints, data models, key files (source of truth)
- `AGENTS.md` — the change-safety contract in detail
