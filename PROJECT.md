# Project overview

> This file is the single source of truth for the project's structure.
> Keep it up to date whenever you add, rename, or remove pages, features, API endpoints, or infrastructure.

## Stack

- **Client**: React 19, Vite 7, Chakra UI v3 ("instrument" design system in `client/src/theme/system.ts`: control-hardware look — off-white device shell with white modules and dark hairlines, graphite in dark mode, one safety-orange signal colour, LED status lights; fonts Space Grotesk (UI) / Geist Mono (labels, codes, money) / Doto (dot-matrix readouts) via `@fontsource-variable`), React Flow (`@xyflow/react`), react-router 7, TanStack Query, better-auth client
- **Server**: Express 5, Node 22 (native TypeScript), Prisma 6, Better Auth (organizations, teams, admin, API keys, feature flags), WebSockets
- **Database**: local PostgreSQL — `valio` (app data) and `valio_events` (event store)

## Entry points (dev)

- `http://localhost:5173` — Vite dev server (`cd client && npm run dev`); proxies `/api` and `/ws` to `:3000`
- `http://localhost:3000` — Express (`cd server && npm start`); also serves `client/dist` with an SPA fallback after `npm run build`

Setup and database commands: see `README.md`.

## Pages (React SPA)

| Route | File | Description |
|---|---|---|
| `/` | `client/src/pages/Landing.tsx` | Public landing page (full-bleed, own header) |
| `/login` | `client/src/pages/auth/login.tsx` | Email + password sign-in (`AuthLayout` split screen) |
| `/signup` | `client/src/pages/auth/register.tsx` | Registration (`AuthLayout` split screen) |
| `/accept-invitation/:inviteId` | `client/src/pages/auth/acceptInvite.tsx` | Org invite flow (dual-mode: anon → signup, authed → auto-accept) |
| `/app` | `client/src/pages/home/` | Home: "What do you need?" box (→ `/app/new?text=`) with two example chips, "Waiting for you" (pending approvals, each opens its order) only when there are any, "Recent orders" (5 rows: request, status dot, total → its order), one link to standing orders |
| `/app/new` | `client/src/pages/workspace/index.tsx` (`NewOrderPage`) | The order page before placing — the same layout as a placed order. Top: the request as one sentence (click to change it → read again), one status sentence from a live dry run (`POST /orders/preview`, signed + unsigned draft: "Goes through on its own · €171.50" / "Needs X's OK — …" / "Can't be ordered — …"), one button (Place order, or the fix: use the substitute / another date), product rows (unsure match → "check"; click a name to swap, change the amount or remove) and the delivery date. Below: the order graph full width — Valio stock → (substitute, when used) → the rules, one node each with ✓ / ! / ✕ for this order → the approver's OK → place order. Click a rule: why, its fields ready to edit (saved into the draft on their own), Remove rule; "+ Add a rule" takes plain words — all into the unsigned draft, re-checked at once; "Rule changes — not in effect until signed · Save & sign · Discard" strip. In the judge sandbox the rules come from the request: each parse SETS the policy's rules to exactly the ones the words state (`rules` from `/requests/parse`: "local only" → Finnish origin, "lactose-free", "gluten-free", "under €300", "ask me if over €200"; product words never) — applied + signed by you in one step (`useRequestRules` in `hooks.ts`), leftovers from earlier requests cleared, rules added/edited by hand on this order kept, the approval route kept; one header line says "Rules from your request: Only products from Finland · Undo". Outside the sandbox the signed rules change only by explicit edits. With no rules the lane says how to get some and the approval step reads "Not needed". The key reads "Sign rules & place order" in the judge sandbox (signs the draft as you, then places), "Save & sign rules…" (the signing dialog) elsewhere Query: `?text=`, `?from=<orderId>`, `?automation=<id>`, `?line=CODE:QTY:UNIT&date=`, `?describe=` (opens Add a rule), `?try=<challenge>` |
| `/app/runs/:orderId` | `client/src/pages/workspace/index.tsx` (`RunOrderPage`) | The same layout during and after: the graph lights up step by step from the real audit trail; a pending approval opens as a card at the approval step and the header button becomes Approve / Decline; when done the status sentence says what happened (with an "Audit log" link), the rows show what was ordered, and the button is New order. Click the sentence to start a new order from changed words |
| `/app/approvals` | `client/src/pages/approvals/` | Head chef's inbox: asked vs proposed, triggered rules, quote countdown, approve / decline / in-stock only, phone view |
| `/app/activity` | `client/src/pages/orders/` | Orders (masthead "Orders") with KPIs, filters and a detail panel (`/app/orders` redirects here) |
| `/app/policy` | `client/src/pages/policies/` | Rules (masthead "Rules"): readable policy, rules as sentences, versions, review & sign (`/app/policies` redirects here) |
| `/app/policy/graph` | `client/src/pages/playbook/index.tsx` | Playbook editor: the policy as a graph, edit rules, test run, sign (`/app/playbook` redirects here; `?policy=<key>`) |
| `/app/standing` | `client/src/pages/home/Standing.tsx` | Standing orders (automations): list, create, edit, run now — linked from Home |
| `/app/try` | `client/src/pages/tryit/` | Judge "Try it" challenges (six, ticked when the real outcome is seen) — linked from the masthead's sandbox chip |
| `/app/audit` | `client/src/pages/audit/` | Hash-chained log grouped by order, verify chain, export JSON, entry detail; `?order=VA-…` filters to one run |
| `/app/agents` | `client/src/pages/agents/` | Agent cards, MCP / OpenAPI connection snippets, tools reference, API keys, sandbox key |
| `/app/catalog` | `client/src/pages/catalog/` | Catalog as the agent sees it (real Valio file when loaded, else samples): LACS, allergens, reliability, unit conversion, live price, JSON |
| `/app/profile/*` | `client/src/pages/user/index.tsx` | User profile settings (+ account deletion) |
| `/app/organization/*` | `client/src/pages/organization/index.tsx` | Org settings, members, teams, teams/:teamId |
| `/app/create-organization` | `client/src/pages/auth/createOrganization.tsx` | Mandatory gate if user has zero orgs |

The `/app/*` subtree is wrapped in `<AppGate />` (`client/src/providers/session/index.tsx`), which redirects unauthenticated users to `/login?redirect=<original>`.

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `ALL` | `/api/auth/*` | — | Better Auth (login, register, session, org, teams, invitations, etc.) |
| `GET/POST/PATCH/DELETE` | `/api/message/*` | authed | Example messaging domain |
| `GET` | `/api/openapi.json` | public, CORS | OpenAPI 3.1 spec of the gateway (`server/src/domains/gateway/openapi.ts`) |
| `POST` | `/mcp` | agent key | MCP server (Streamable HTTP, stateless): search_products, get_product, get_quote, rank_substitutes, place_order, parse_request, get_order, get_policy |
| `GET` | `/api/gw/health` | public | Health, Valio ping or simulator mode, signing kid, chain head |
| `GET` | `/api/gw/keys` | public | Gateway Ed25519 public key (JWKS) |
| `POST` | `/api/gw/quotes/verify` | public | Verify a quote (`{quote}` or `{id}`): signature + expiry |
| `GET` | `/api/gw/products` · `/products/:code` | key/session | Ranked catalog search (`q` = English/Finnish name words, brand or code; `category` = code or prefix e.g. `dairy`; `lactoseFree, missingAllergens, hasSubstitute`; `limit` ≤ 200 (default 50), `offset`) → `{products, total, offset, limit, nextOffset, categories:[{code,count}], source}`; each product carries `listPrice` (live, cached 10 min; `source: live\|simulator\|unknown`) / one full product |
| `POST` | `/api/gw/products/search` | key/session | Same search with a JSON body (`query`, …, `offset`) |
| `POST` | `/api/gw/quotes` · `GET /quotes/:id` | key/session | Signed quote valid 15 min / stored quote + verification |
| `POST` | `/api/gw/substitutes/rank` | key/session | Rank substitutes under the bound policy (read-only) |
| `POST` | `/api/gw/orders` | key/session | Place order → executed / pending_approval / blocked; returns order, checks, quote, approval, audit entries |
| `POST` | `/api/gw/orders/preview` | key/session | Dry run of an order (same body as `POST /orders`, plus `policyId` for a draft version, session only): decision, checks, lines, steps, `suggestedDate`. Writes nothing |
| `GET` | `/api/gw/orders` · `/orders/:id` | key/session | Orders (`?status=`, `?agentId=`, `?automationId=`; agents see their own; each has `automationId`) / order + quote + approval + audit |
| `POST` | `/api/gw/requests/parse` | key/session | `{text, agentId?}` → draft lines matched against the catalog + Helsinki delivery date + `rules: [{rule, sentence, words}]` the words state (origin, lactose, allergens, spend limits — deterministic, `gateway.constraints.ts`; Gemini only splits) (`parser: gemini\|rules`). Matching prefers products that meet those rules. Never orders, saves nothing |
| `GET` | `/api/gw/automations` · `/automations/:id` | key/session | Standing orders (agents see the ones that run as them): schedule + label, lines, agent, policy, lastRun, nextRunAt, runsLast7Days |
| `POST/PATCH/DELETE` | `/api/gw/automations` · `/automations/:id` | session | Create (`{name, schedule:{days,time,leadDays}, lines, agentId?, enabled?, allowSubstitutes?}`) / patch / delete |
| `POST` | `/api/gw/automations/:id/run` | key/session | Run now: a REAL order for today + leadDays (Helsinki) through `placeOrder`; schedule unchanged |
| `GET` | `/api/gw/stats` | key/session | Week KPIs: orders, auto share, spend vs limit, median approval time, entries today |
| `GET` | `/api/gw/approvals` | key/session | Approvals inbox (`?status=pending`) with order, trade-offs, fallback |
| `POST` | `/api/gw/approvals/:id/decide` | session | `{decision: approve\|decline\|partial, comment?}` — signed, then orders / partial / nothing |
| `POST` | `/api/gw/approvals/:id/expire` | session, DEMO_MODE | Force the timeout fallback now |
| `GET` | `/api/gw/audit` · `/audit/verify` | key/session | Entries (`orderId, limit, before`) / recompute the whole hash chain |
| `GET` | `/api/gw/policy` | key/session | The signed policy the calling agent is bound to |
| `GET/POST` | `/api/gw/policies` · `GET/PATCH /policies/:id` | key/session (writes: session) | Policies with versions; PATCH a signed one → new draft version |
| `POST` | `/api/gw/policies/:id/compile` · `/sign` | session | Plain language → rules (Gemini or rule-based) / sign the draft, supersede the old version |
| `POST` | `/api/gw/policies/:id/rules/draft` | session | One sentence → one validated rule `{ rule, sentence, supported, compiler, notes, warnings }`; not saved (client inserts + PATCHes). PATCH rejects invalid `product.attribute` / `limit.perLine` / `delivery.days` rules with 422 |
| `DELETE` | `/api/gw/policies/:id/draft` | session | Discard the unsigned draft; the signed version stays in effect |
| `GET` | `/api/gw/agents` | key/session | Agents, bound policy, key prefix, usage |
| `POST/DELETE` | `/api/gw/agents/:id/keys` · `/keys/:keyId` | session | Issue (plaintext once, revokes previous) / revoke an agent key |
| `POST` | `/api/gw/demo/run` | key/session, DEMO_MODE | `{scenario: routine\|stockout\|timeout}` through the real orchestration as the Gemini agent |

## Data models (Prisma)

See `server/prisma/schema.prisma`. Key models:

- **User** — email, name, role, ban status
- **Account** — auth provider links (credential, GitHub)
- **Organization** — multi-tenant container
- **Member** — user ↔ org relationship with role (`owner`/`admin`/`member`)
- **Team** / **TeamMember** — sub-groups within an org
- **Session** / **Verification** / **Apikey** — Better Auth internals
- **Message** / **MessageRecipient** — example domain
- **Feature** / **FeatureFlag** — feature-flag plugin
- **Policy** (`gw_policy`) — versioned by `key` (`pol_…`); status `draft|signed|superseded`; `document` = compiled `mandate.policy/v1`; Ed25519 signature over document + signer
  - `nutrition` and `product.attribute` / `limit.perLine` rules take an optional `scope` (`{categories, codes}`); when no line is in scope the check passes with `applies: false` ("No dairy in this order — the rule doesn't apply"), and a scoped nutrition rule only asks for its nutrient (data.missing) on products it covers
  - Rule types: `limit.perOrder`, `limit.perWeek`, `limit.perLine` (any single line over `max` l/kg/pcs/EUR, optional `scope`), `category.allow`, `nutrition`, `allergen.exclude` (GS1 codes), `product.attribute` (origin/vendor/temperatureClass/deliveryReliability/co2eKgPerKg/pricePerBase/categoryCode/group/nutrition.X vs `= != < <= > >= in not_in`, `hard`, `onMissing`, `scope`; also applied to substitute candidates), `delivery.days` (ISO weekdays), `data.missing`, `substitution`, `substitution.rank`, `approval`. Unknown types fail closed (a person decides)
- **Quote** (`gw_quote`) — `qt_…`; signed payload of prices + dated availability; expires after 15 min
- **Order** (`gw_order`) — `VA-20458…`; status `executed|pending_approval|partial|declined|blocked|expired`; lines (with per-line status, incl. `open`), checks, candidates, `committedTotal` (counts toward the weekly cap)
- **Approval** (`gw_approval`) — `apr_…`; one per order; `pending|approved|declined|partial|timed_out`; reasons, fallback lines, signed decision
- **AuditEntry** (`gw_audit_entry`) — global hash chain: `hash = sha256(canonicalJson({seq, at, orderId, step, status, actor, message, payload}) + prevHash)`, genesis = 64 zeros
- **Agent** (`gw_agent`) — outside AI buyer; `policyId` = bound policy key; `apiKeyId` = its Better Auth API key
- **Automation** (`gw_automation`) — `aut_…` standing order: ISO `days` (1 = Mon), `time` (HH:MM Helsinki), `leadDays`, `lines`, `agentId`, `enabled`, `nextRunAt` (null when disabled). Its orders carry `request.automationId` and the automation name as title

All domain writes go through event-sourced commands under `server/src/domains/*/*.commands.ts`, registered with `eventStore.registerCommand()`.

## Key files

| Path | Purpose |
|---|---|
| `package.json` | `npm run setup` (deps, Prisma clients, git hooks) and `npm run init` (setup + reset/migrate/seed both databases) |
| `server/app.ts` | Express app setup, middleware, routes, SPA fallback |
| `server/src/services/auth/auth.ts` | Better Auth server config + replay imports for every command file |
| `server/src/services/eventStore.ts` | Event store — command registry, event log, replay |
| `server/seed/withCommands.ts` | Main seed (idempotent) — users, orgs, members, teams; calls `seed/gateway.ts` |
| `server/seed/gateway.ts` | Gateway demo data: org rename, Mikko Laine, policies v1–v3, agents + keys, this week's orders, today's scenarios, three automations |
| `server/src/domains/gateway/` | AI-MO gateway: `gateway.routes.ts` (all routes + CORS), `gateway.orders.ts` (orchestration), `policy.engine.ts` (pure rules), `policy.compiler.ts` (plain language → rules), `policy.rules.ts` (one sentence → one rule: Gemini form + validation + rule-based parser, which also runs when Gemini declines; "local" / "domestic" / "made in Finland" = origin FI; a refusal is one plain sentence), `policy.describe.ts` (`describeRule`: plain-English sentence per rule), `gateway.constraints.ts` (the rules a request states, split from its products), `policy.phrases.ts` (shared phrase detectors), `valio.client.ts` (Valio API / simulator), `audit.*.ts` (hash chain), `gateway.signing.ts` (Ed25519), `gateway.mcp.ts`, `openapi.ts`, `gateway.automations.ts` + `gateway.schedule.ts` (standing orders + 30 s sweeper), `gateway.parse.ts` (plain-language requests) |
| `server/data/products.sample.json` | 20-product fallback catalog (4 real Valio products + 16 samples) when `VALIO_PRODUCTS_FILE` isn't set |
| `data/` (repo root, git-ignored) | Valio's challenge files: product JSON (+ schema), delivery-reliability and carbon-footprint CSVs — Junction 2026 licence, never commit |
| `server/src/domains/gateway/gateway.products.ts` | Catalog loader (sample or real file), `Product` type, substitute pool (≤ 12, most similar first), paged search, `productView` |
| `server/src/domains/gateway/gateway.valio-file.ts` | Valio product record → `Product`: litres / kg per sales unit (units hierarchy × synkka consumer-unit volume / net weight, else the name), allergens (CONTAINS + MAY_CONTAIN), nutrition per 100 g, temperature class |
| `server/src/domains/gateway/gateway.categories.ts` | Numeric category → semantic code (`dairy.milk`, `dry.pasta`, `other.<slug>`) by majority vote of en/fi name keywords |
| `server/src/domains/gateway/gateway.search.ts` | Token index (en/fi/sv names, brand, code) + ranking; used by `/products?q=` and the request parser |
| `server/src/domains/gateway/gateway.prices.ts` | Live list prices for the catalog (batched, 10 min cache) + startup unit calibration against Valio's comparison prices |
| `server/prisma/migrations/` | Committed app migrations (`server/prisma/events/migrations/` for the event store) |
| `server/example.env` | Template for `server/.env` |
| `client/src/App.tsx` | React router, top-level layout |
| `client/src/providers/session/index.tsx` | `SessionProvider` + `AppGate` (auth redirect + org context) |
| `client/src/lib/auth-client.ts` | Better Auth client config |
| `client/src/lib/api.ts` | Typed REST client for first-party endpoints |
| `client/src/components/Masthead.tsx` | The app's top bar (in `AppShell.tsx`): logo glyph + AI-MO wordmark, nav as a segmented control (Home, Approvals, Rules, Orders; Agents & keys, Catalog, Audit log under "More"), a status strip of LEDs (Valio live / simulator, `SandboxChip.tsx` "Sandbox / Try it / Reset", signing key id), the orange "+ New order" key, theme switch, org/account menu |
| `client/src/theme/system.ts` | Design tokens ("the instrument"): `shell`/`graphite`/`brand` (safety orange) palettes, `status.*` text inks and `led.*` LED colours (auto/pending/blocked/running/idle), `kind.*`, `canvas.*` (board), `node.*`, `edge.*` (traces), `key.edge`; fonts (body Space Grotesk, `mono`, `dot`), text styles (`hero` dot-matrix, `display` / `title` / `heading` grotesk, `caps`, `label` mono engraved caption, `readout` dot-matrix), small machined radii, flat shadows (`node`, `float`, `key`/`keyLight` keycap travel), button recipe as keycaps, keyframes (`flow-march`, `ink-draw`, `led-blink`, `caret`, `readout-on`), `.tnum`, reduced-motion switch |
| `client/src/demo/scenario.ts` | Playbook steps, edges, policy, products and the three demo scenarios (stock-out, routine, approval timeout) |
| `client/src/demo/*.ts` | Per-page demo fixtures; `approvals.ts` also holds a tiny shared store (`useApprovals`) used by Approvals, Orders and the masthead badge |
| `client/src/pages/workspace/` | Order page (`/app/new`, `/app/runs/:id`): `index.tsx` (both pages, one layout), `Top.tsx` (one readout module: 01 request sentence + status + the one key, 02 verdict as a dot-matrix word with LED — CLEAR / HOLD / BLOCKED / RUNNING / ORDERED / APPROVED…, 03 lines as a spec table with a dot-matrix total and the date), `Graph.tsx` (`buildOrderGraph` + canvas as a circuit board: step modules with port jacks and LEDs, the rules lane as a rack of R01… rows with hard-rule switches, orange traces with a travelling signal pulse, an LED legend, cards docked to the right), `Cards.tsx` (rule card as a control panel with autosave / Remove, step card, approval two-key panel with countdown, Add a rule with keycap examples), `hooks.ts` (`usePolicyDraft`, `usePlan` dry runs), `model.ts` (rule verdicts, plain words: `ruleShort`, `planSentence`, `doneSentence`, `plain`), `request.ts` (the editable request); `RequestEditor.tsx` is the playbook test's request form |
| `client/src/components/kit.tsx` | Shared page primitives (Page, PageHeader mono trail, PageIntro, Panel module, List, Section, Caption engraved "01 INPUT" label, Corners registration marks, Readout dot-matrix figure, Dot LED, Stamp LED status / indicator plate, RuleNo "R01", Leader spec line, Keycap, segmented Meter, Code, EmptyHint, `board` dot grid…) — use these for new pages |
| `client/src/components/SignalBoard.tsx` | The landing / auth illustration: an order as a signal pulse travelling AGENT → RULES → APPROVAL → VALIO on a small SVG circuit board (CSS-only loop, static under reduced motion) |
| `client/vite.config.ts` | Vite config — dev proxy to `localhost:3000` |
| `.githooks/post-checkout` + `.claude/settings.json` | Link `node_modules` and `server/.env` into new git worktrees |

## Environment variables

See `server/example.env`:

- `DATABASE_URL`, `EVENTSTORE_URL` — the two Postgres databases
- `PORT` — Express port (default `3000`)
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_EMAILS`, `PUBLIC_FRONTEND_URL` — auth config
- `EMAIL_FROM_EMAIL`, `EMAIL_FROM_NAME` — sender for transactional emails (SMTP2GO)
- `SEED_USER_PASSWORD` — shared password for seed users
- `GATEWAY_SIGNING_SEED` — Ed25519 key seed (default: derived from `BETTER_AUTH_SECRET`)
- `VALIO_API_URL`, `VALIO_API_KEY`, `VALIO_CUSTOMER` — Valio Aimo API; empty → simulator
- `VALIO_PRODUCTS_FILE`, `VALIO_RELIABILITY_FILE`, `VALIO_CARBON_FILE` — Valio's real product JSON / delivery-reliability CSV / CO₂e CSV (paths relative to `server/`, e.g. `../data/valio_aimo_junction26_product_data.json`); unset → sample catalog
- `GEMINI_API_KEY`, `GEMINI_MODEL` — optional policy compiler and request parser (rules otherwise)
- `TRUSTED_ORIGINS` — extra comma-separated sign-in origins (e.g. a second dev client on :5180)
- `DEMO_MODE` — enables `/api/gw/demo/run` and `/approvals/:id/expire`

## Notes

- Seeds use fixed ULIDs for users/orgs, so re-runs after a reset are stable.
- Gateway timestamps are real instants (UTC ISO); the kitchen's day/week is reckoned in Europe/Helsinki — format with `timeZone: 'Europe/Helsinki'`.
- Demo runs (`/api/gw/demo/run`) evaluate the weekly cap against spend from before today, so every run of a scenario starts from the same state; real orders count everything.
- Automations place REAL orders. The sweeper (every 30 s, started in `server/app.ts` next to the approvals sweeper) claims each due slot with a compare-and-set on `nextRunAt`, orders with idempotencyKey `auto:<id>:<slot ISO>`, and skips (logs) slots missed by more than 2 h — restarts never double-order. Run-now keys are `auto:<id>:<deliveryDate>:<ms>`.
- Sample products with codes starting 9 are invented: against the live Valio API they have no availability, so automations/orders using them end `blocked` (stock). The demo seed (`server/seed/gateway.ts`) uses only real Valio codes; without `VALIO_PRODUCTS_FILE` it seeds just the history rows / automations whose codes the sample catalog has (464398, 463335, 463359) and warns about the rest. The simulator's sales-blocked example is real code 464128.
- Real catalog units: `salesUnit.size` = litres or kg in ONE sales unit (e.g. 463359 is sold per KI = 5 × 1 l → 1,000 l = 200 KI); `base: 'pcs'` when no content is known (≈ 11 %; l / kg requests for those → 422). In live mode every size is checked at startup against Valio's comparison price (`price ÷ comparison price`); disagreements take Valio's figure (`measureSource: 'valio-price'`).
- Allergens: CONTAINS and MAY_CONTAIN both count for `allergen.exclude` (fail safe); the view lists them separately (`allergens`, `mayContain`). ~59 % of products have no allergen data → `allergens: null` → fails closed.
- No price from Valio → the quote line is unavailable (`salesBlock: 'No price from Valio'`), never a €0 line. Simulator prices for real codes: `REFERENCE_PRICES` in `valio.client.ts` (live prices of 2026-11-14).
- Valio API field names in `valio.client.ts` (`mapValioResponses`) are verified against live responses.
- When `BETTER_AUTH_EMAILS=true`, account deletion requires email confirmation. When `false`, `authClient.deleteUser()` deletes immediately.
