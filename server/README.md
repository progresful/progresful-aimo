# Server

See the root `README.md` for setup. Useful scripts:

- `npm start` — run the API (`--env-file=.env`, native TypeScript).
- `npm run generate:all` — regenerate both Prisma clients after a schema change.
- `npm run reset:events` / `npm run reset:app` — drop and re-migrate the event-store / app database.
- `npm run seed:app` — seed users, organizations and teams through event-sourced commands.
- `npm run reset:seed:app` — reset the app database and seed it.
- `npm run seed:app-from-events` — rebuild the app database by replaying the event store.
