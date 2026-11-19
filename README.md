# Tattoo Quotes

A small quote manager for a tattoo studio. Clients describe the tattoo they want and upload reference
images. Artists review requests in a shared inbox, reply with questions and extra references, and send
a price with an estimate of sessions and hours. Clients follow everything through a private link.

This is **v1**: it works end to end for one studio, with a few deliberate gaps (see
[Known v1 limitations](#known-v1-limitations)).

- **API**: Node 22 + Express 5 + zod + multer, storing data in SQLite through Node's built-in
  `node:sqlite` (no native modules, no external database). Uploaded images go to a folder on disk.
- **Web**: Angular 21 (standalone components, signals, OnPush, zoneless), plain CSS.
- **Language**: TypeScript everywhere. npm workspaces monorepo.
- **Money** is always integer cents (`*_cents INTEGER`) with a currency code next to it. MXN is the default.

## Requirements

- Node.js **22.13 or newer** (`node:sqlite` works without a flag from 22.13; tested on 22.21) and npm 10+.
- No internet access is needed after `npm ci`. Nothing downloads at install or run time.

## Quick start

```bash
npm ci          # install exactly what package-lock.json pins
npm run seed    # optional: reset ./data and ./uploads with 3 artists and 10 sample requests
npm run dev     # API on :4410 + Angular dev server on :4400
```

Open **http://localhost:4400/**. The Angular dev server proxies `/api` to the API.

Production-style single server (API also serves the built web app):

```bash
npm run build
npm start       # open http://127.0.0.1:4410/
```

### Try it

1. **Request a quote**: fill in the form, attach one or more images (JPEG, PNG, WebP or GIF, up to 5 MB each)
   and send. You land on your private page (`/r/<token>`); save that link.
2. **Artist inbox**: pick an artist (for example *Diego Salas*). The new request shows up under **New**.
3. Open it, write a reply and optionally attach images. The first reply moves the request to **In review**
   and assigns it to you.
4. Reply again with **Include a price** checked (fixed or range, sessions, total hours). The request becomes
   **Quoted** and the client page shows the quote.
5. Use **Mark accepted by client** or **Decline** to close it. The history at the bottom lists every change.

After `npm run seed`, the seed prints a private client link for each sample request.

## Scripts (run from the repo root)

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts API (`node --watch` + `tsx`, port 4410) and web (`ng serve`, port 4400) together; prints the URLs. |
| `npm run build` | Compiles the API to `apps/api/dist` and builds the web app to `apps/web/dist/web/browser`. |
| `npm start` | Runs the compiled API, which also serves the built web app (after `npm run build`). |
| `npm test` | API tests (vitest: unit + HTTP tests against a temp SQLite file and uploads folder), then web tests (`ng test`, vitest + jsdom). |
| `npm run lint` | ESLint (typescript-eslint) over the whole repo. |
| `npm run typecheck` | `tsc --noEmit` for the API (src + tests) and the web app (app + specs). |
| `npm run seed` | **Deletes** the database and the generated images in the uploads folder, then recreates sample data ending today. |

The scripts work the same on Windows, macOS and Linux: no `VAR=value cmd` syntax, and `scripts/dev.mjs`
starts npm through Node itself.

## Configuration

Environment variables read by the API (all optional):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4410` | API port. The dev proxy in `apps/web/proxy.conf.json` targets 4410, so change both together. |
| `HOST` | `127.0.0.1` | Interface to listen on. |
| `DB_PATH` | `./data/tattoo-quotes.sqlite` | SQLite file (created on first run, migrations applied automatically). |
| `UPLOADS_DIR` | `./uploads` | Folder for uploaded images. |
| `MAX_UPLOAD_BYTES` | `5242880` (5 MB) | Maximum size of one image. |
| `MAX_UPLOAD_FILES` | `6` | Maximum images per request or message. |
| `WEB_PORT` | `4400` | Angular dev server port (`npm run dev` only). |

`data/` and `uploads/` are git-ignored.

## Folder layout

```
apps/
  api/
    src/
      main.ts                 # starts the HTTP server
      app.ts                  # Express app: routers, SPA fallback, error handler
      config.ts               # env-driven settings (ports, paths, upload limits)
      services.ts             # composition root (repositories -> services)
      seed.ts, seed-data.ts   # `npm run seed`: synthetic artists, requests, conversations, images
      db/                     # node:sqlite wrapper, append-only migrations
      http/                   # HttpError helpers, error handler, shared zod schemas
      lib/                    # clock, tokens, image sniffing, tiny PNG encoder
      modules/
        artists/              # seeded artists, X-Artist-Id "auth" middleware
        requests/             # quote requests: schemas, status rules, inbox, public view
          request-status.ts   #   the lifecycle and every allowed transition
          requests.service.ts #   create, client view, artist view, inbox, status changes
          requests.routes.ts  #   public endpoints (form + private link)
          inbox.routes.ts     #   artist endpoints
          catalog.ts          #   styles, color modes, placements
        messages/             # conversation: client messages, artist replies (+ quote)
        quotes/               # quote validation (fixed/range, sessions, hours) and storage
        attachments/          # multer config, upload validation, file store, image serving
    test/                     # vitest: unit, service and HTTP tests
  web/
    src/app/
      core/                   # API client, models, money helpers, artist session + interceptor
      shared/                 # status badge, image picker, gallery, thread, quote card
      features/
        request-form/         # public quote request form
        client-request/       # client's private page (/r/:token)
        artist/               # pick artist, inbox, request detail (reply, quote, status)
        home/
scripts/dev.mjs               # runs API + web together
```

## How it works

### Request lifecycle

```
new ──► in_review ──► quoted ──► accepted
 │          │           │
 └──────────┴───────────┴──────► declined
```

- All rules live in `apps/api/src/modules/requests/request-status.ts`. Every status change goes through
  `assertTransition`, and invalid moves return **409** with the allowed targets.
- `quoted` can only be reached by an artist reply that includes a price (the status endpoint refuses it).
- An artist reply to a `new` request moves it to `in_review` automatically.
- The first artist who acts on an unassigned request becomes its owner. Other artists get **403** on
  replies and status changes for that request.
- Messages are allowed in every status except `declined`. A price can be sent only while the request is
  `new` or `in_review`, and each request has at most one quote (`quotes.request_id` is UNIQUE).
- Each change is recorded in `status_events` (who, when, optional note) and shown as the request history.

### Uploads

- Multipart forms use the field name `images`. multer keeps files in memory and enforces the size and
  count limits while streaming (413 for an oversized file).
- `attachments/upload-validation.ts` then checks the real content type from the file's magic bytes
  (JPEG, PNG, WebP, GIF). The browser's MIME type and the file extension are never trusted.
- Files are written to `UPLOADS_DIR` with random names (`img_<24 chars>.<ext>`) only after validation,
  and removed again if the database transaction fails. Metadata lives in the `attachments` table.
- `GET /api/uploads/:storedName` serves a file with its stored MIME type and `nosniff`. The random name
  is the capability: anyone with the request's page has the links.

### Who can see what

- **Clients** have no account. Creating a request returns a 32-character random token; `/r/<token>`
  shows the request, the conversation and the quote, and lets the client add messages and images.
- **Artists** pick their name in the web app, which sends `X-Artist-Id` on `/api/inbox/*` calls.
  There is no password in v1 (see limitations).

### API summary

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET /api/health` | anyone | Liveness check. |
| `GET /api/meta` | anyone | Styles, color modes, placements, statuses, upload limits. |
| `GET /api/artists` | anyone | Active artists (for "preferred artist" and the artist picker). |
| `POST /api/requests` | client | Multipart: request fields + `images` (1 or more). Returns the client view with `publicToken`. |
| `GET /api/requests/:token` | client | Client view: details, images, messages, quote. |
| `POST /api/requests/:token/messages` | client | Multipart or JSON: `body` + optional `images`. |
| `GET /api/inbox/requests` | artist | `?status=&assigned=all|me|unassigned&q=&page=&pageSize=`; includes per-status counts. |
| `GET /api/inbox/requests/:id` | artist | Full detail, status history, allowed transitions. |
| `POST /api/inbox/requests/:id/status` | artist | JSON `{ status, note? }`. |
| `POST /api/inbox/requests/:id/replies` | artist | Multipart or JSON: `body`, optional `images`, optional quote fields `priceType` (`fixed`/`range`), `amountMinCents`, `amountMaxCents`, `currency`, `estimatedSessions`, `estimatedHours`. |
| `GET /api/uploads/:storedName` | anyone with the link | The image bytes. |

Errors are JSON: `{ "error": { "code", "message", "details?" } }` with codes such as `validation_error`,
`invalid_upload`, `unauthorized`, `forbidden`, `not_found`, `conflict`.

Example (with the API running and seed data loaded):

```bash
curl -s -H 'X-Artist-Id: 1' 'http://127.0.0.1:4410/api/inbox/requests?status=new'
curl -s -F clientName='Ana Ejemplo' -F clientEmail=ana@example.com \
  -F description='Small fine line moon on the wrist' -F placement=Wrist -F widthCm=4 -F heightCm=4 \
  -F style=fine_line -F colorMode=black_grey -F images=@reference.png http://127.0.0.1:4410/api/requests
```

## Testing

```bash
npm test             # everything
npm test -w @tattoo-quotes/api
npm test -w @tattoo-quotes/web
```

- `apps/api/test/request-status.test.ts`: the full transition table and the message/quote rules.
- `apps/api/test/quote.test.ts`: fixed vs range prices, required fields, integer cents.
- `apps/api/test/upload-validation.test.ts`: magic-byte sniffing, size/count limits, file name cleaning, file store.
- `apps/api/test/requests.service.test.ts`: services against a real SQLite file (assignment, quotes, cleanup on failure, inbox filters).
- `apps/api/test/api.test.ts`: the real Express app over HTTP, including multipart uploads and error codes.
- `apps/api/test/seed.test.ts`, `migrations.test.ts`: seed data and schema.
- `apps/web/src/**/*.spec.ts`: money helpers, the request form (multipart body, client-side checks), inbox filters, request detail actions.

API tests use a temporary database and uploads folder per test and never touch `./data` or `./uploads`.

## Known v1 limitations

- **No real authentication for artists.** Picking a name sets `X-Artist-Id`; fine for a trusted studio
  computer, not for the internet. Client access relies only on the unguessable link.
- **One quote per request.** Once quoted, the price cannot be revised; the artist records the client's
  answer with *Mark accepted by client* or *Decline*. Clients cannot accept or counter-offer from their page.
- **No scheduling.** Availability is free text; there is no calendar, booking or artist availability.
- **No payments or deposits.**
- **No notifications.** Nobody is emailed when a request or reply arrives.
- Images are stored as uploaded (no resizing or thumbnails) and are never deleted except by `npm run seed`.
