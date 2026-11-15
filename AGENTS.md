# Agent Instructions

An Express + Prisma + Better Auth server (`server/`) and a Vite + React SPA (`client/`), run directly with npm against a local PostgreSQL. See `README.md` for setup and `PROJECT.md` for the map of routes, endpoints, data models and key files.

## The non-negotiables

1. **Every `import` you write must point to a file that actually exists.**
   If you add `import X from './foo'`, create `./foo.tsx` in the same turn or remove the import. Vite blocks on missing imports.

2. **After editing `server/prisma/schema.prisma` (or `prisma/events/schema.prisma`)** create a migration — never `prisma db push`:
   ```
   cd server && npx prisma migrate dev --name <name>
   cd server && npx prisma migrate dev --schema=prisma/events/schema.prisma --name <name>
   ```
   Then restart the server so it picks up the regenerated client. **Commit the migration dir** (`prisma/migrations/<timestamp>_<name>/`) — deploys run `prisma migrate deploy`. A stale client shows up as `P2021 "table does not exist"` / `P2022 "column does not exist"`.

3. **Seeds must be idempotent.** Use check-then-insert or `upsert` with a stable key; never `deleteMany()` + re-insert. New seed files must be wired into `server/seed/withCommands.ts` — that's what `npm run seed:app` runs.

4. **New routes:**
   - Server: register in the domain's `*.routes.ts`, mount it in `server/app.ts`. For event-sourced domains also add a side-effect `import '...commands.ts'` in `server/src/services/auth/auth.ts` (and `server/seed/fromEventsDB.ts`) so event replay sees the command.
   - Client: add to `client/src/App.tsx`, or an `/app/<domain>/*` sub-router for deeper trees.

5. **Verify before claiming it works** — curl the running server (`http://localhost:3000/api/...`) or go through Vite (`http://localhost:5173/api/...`). A JSON file on disk ≠ data in the DB.

6. **Never hardcode `http://` in client code, tracking scripts or embed snippets.** Production is HTTPS. Use relative paths (`/api/track`) or `window.location.origin`.

7. **External-facing API endpoints** (webhooks, public APIs used from other domains) need explicit CORS headers — Helmet CSP is disabled but CORS isn't automatic.

8. **Don't kill the user's running `npm start` / `npm run dev`.** If you need your own server for testing, run it on another port (`PORT=3200 npm start`) and stop it when done.

## Commit hygiene

- Commit code, schema, migrations and seed data — anything needed to boot from a fresh clone.
- Never commit `server/.env` (it's gitignored); update `server/example.env` when adding variables.
- Delete `.bak` files before committing.
