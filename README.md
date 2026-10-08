# StudyScribe — YouTube → handwritten revision notes

Turns any YouTube lecture into a bound notebook: ruled paper, highlighter marks,

sticky notes, inline SVG diagrams and doodles — rendered in the browser **and**

printed to an A4 PDF from the same stylesheet.

```text
Browser (React 19 + Vite, :5273)

        │ fetch + Bearer JWT
        ▼
API (Express 5, :5055) ──► Postgres (:5455)    generations, users, refresh tokens

        │ BullMQ job
        ▼
Redis (:6479) ──► Worker ──► youtube-transcript ──► Gemini Interactions API
                              └──────────────► Puppeteer (PDF) ◄── shared CSS/geometry
```

## Ports (deliberately non-default)

| Service               | Host port | Notes                                                |
| --------------------- | --------- | ---------------------------------------------------- |
| Web dev server (Vite) | **5273**  | `strictPort`, so it fails loudly instead of drifting |
| API                   | **5055**  | `PORT` in `server/.env`                              |
| Postgres              | **5455**  | container port 5432                                  |
| Redis                 | **6479**  | container port 6379                                  |

Nothing binds 3000/5000/5173/5432/6379, so this stack runs beside another copy of

the project on the same machine.

Ports alone are not enough to keep two copies apart. Compose identifies

containers by **project name + service name**, not by `container_name`, and the

project name defaults to the directory name — two checkouts each living in a

folder called `studyscribe` both become project `studyscribe`, so

`docker compose up` in one steals and recreates the containers of the other.

`docker-compose.yml` therefore pins `name: studyscribe`, which also puts the

volumes in their own namespace (`studyscribe_pg_data`, `studyscribe_redis_data`).

The API port has a second trap: `dotenv` never overrides a variable that is

already present in `process.env`, so a `PORT` exported by a shell profile, an IDE

run configuration or a container host silently wins over `server/.env`. Some

hosts export `PORT=0` meaning "pick any free port", which would leave the API on

an unreachable ephemeral port — so `server/src/lib/port.ts` accepts the value

only when it is a usable port and otherwise falls back to 5055 with a warning.

## First run

```bash
npm run setup             # installs server + web dependencies

cp server/.env.example server/.env   # then fill in the blanks

npm run dev:infra         # postgres + redis (Docker)

npm run migrate           # creates the schema (incl. 005 notes/model columns)

npm run dev               # api + worker + web together
```

Open http://localhost:5273, create an account (5 free credits) and paste a

YouTube link.

Environment (`server/.env`):

| Key                                            | Purpose                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                                 | `postgres://notes_user:notes_dev_password@localhost:5455/notes_app`           |
| `REDIS_URL`                                    | `redis://localhost:6479`                                                      |
| `PORT`                                         | API port (5055); invalid or inherited values fall back to 5055 with a warning |
| `CORS_ORIGIN`                                  | comma-separated allowed web origins (5273)                                    |
| `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` | JWT signing secrets                                                           |
| `GOOGLE_CLIENT_ID`                             | Google OAuth **web** client id (optional)                                     |
| `GEMINI_API_KEY`                               | Google AI Studio key                                                          |
| `GEMINI_MODEL`                                 | optional default model override                                               |

## API

| Method | Path                                                             | Auth | Purpose                                                |
| ------ | ---------------------------------------------------------------- | ---- | ------------------------------------------------------ |
| `GET`  | `/health`                                                        | –    | Postgres + Redis readiness (503 when down)             |
| `GET`  | `/auth/config`                                                   | –    | Public Google client id for the web app                |
| `POST` | `/auth/register` | `/login` | `/refresh` | `/logout` | `/google` | –    | Auth (JWT access + rotating refresh)                   |
| `GET`  | `/auth/me`                                                       | ✔    | Current user + credits                                 |
| `GET`  | `/generate/models`                                               | –    | Models the API accepts (drives the UI picker)          |
| `POST` | `/generate`                                                      | ✔    | Queue a generation → `202 { generationId }`            |
| `GET`  | `/generate/history?page=&limit=`                                 | ✔    | Paginated list                                         |
| `GET`  | `/generate/:id`                                                  | ✔    | Status + **persisted notes JSON** when done            |
| `GET`  | `/generate/:id/preview`                                          | ✔    | Standalone handwriting HTML (same template as the PDF) |
| `GET`  | `/generate/:id/download`                                         | ✔    | The PDF                                                |

## Gemini pipeline

`server/src/services/gemini.service.ts` uses the **Interactions API**

(`ai.interactions.create`) — not the legacy `models.generateContent` path — with

`response_format: { type: "text", mime_type: "application/json", schema }`, where

the schema is plain JSON Schema (verified live: nested `anyOf` block unions are

accepted). Every response is then validated by Zod, and a failed validation

triggers one repair pass that feeds the validation errors back to the model.

* **Model picker**: `gemini-3.8-flash` (default), `3.7-flash`, `3.1-pro-preview`,
  chosen per generation and stored on the row.

* **Fallback chain**: on rate limits (429) or 5xx the request re-runs on
  `3.5-flash`, then `2.5-flash`. This fired for real during development: 3.8 Flash
  returned `503 high demand` and 3.5 Flash produced the notebook. The row records
  the model that actually answered, so a fallback is visible instead of hidden.

* **Decoration can never fail a run**: `doodles` are margin scribbles with no
  meaning, and a live model returned `{"top": 1.2e+160}` with no text at all.
  Since a rejected response costs a whole extra generation (plus its multi-minute
  repair pass), unusable doodles are dropped and a wild `top` is clamped to the
  printable band; headings, blocks, tables and diagrams are still validated
  strictly.

* **Retries are bounded**: a structural failure (invalid notes, no captions) is
  reported with `UnrecoverableError`, so BullMQ does not spend its second attempt
  on a job that cannot succeed. Transient failures (503s that outlived the
  in-process chain, DB blips) still retry once.

* **Long transcripts**: >120k chars are sampled as up to 3 full-size windows
  spread across the whole video (start → end) rather than truncated at the head.

* **Foreign captions**: auto-captions are often not English; the prompt tells the
  model to translate and the detected track language is stored per generation.

## Caching and credits

A finished notebook is cached in Redis for 30 days under

`notes:{videoId}:{language}:{model}` and is served instantly with **no charge**

(`creditsUsed: 0`, `wasCached: true` on `GET /generate/:id`).

Because one request can involve two models (the requested one, plus whichever

fallback answered), the entry is written under **both** keys. Caching only under

the model that answered would make the next request — the one the user actually

picked — miss, which is precisely the situation in which Gemini is overloaded

and another call is least welcome. The cached payload keeps the model that

produced the notes, so a cache hit reports that model rather than the requested

name.

Credits are charged once, by the worker, only when a cold generation completes;

failed runs are not charged.

## Shared layer (why the preview matches the PDF)

`server/src/shared/` is imported by **both** sides (the web app aliases

`@shared` → that folder):

* `notebook-css.ts` — the ruled-paper/spiral/sticky-note stylesheet, injected into
  the app and inlined into the print template.

* `geometry.ts` — `escapeHtml`, `inlineFormat`, `truncateLabel` and the SVG
  diagram layouts.

* `types.ts` — the notes structure; `schemas/notes.schema.ts` asserts Zod/shared
  parity at compile time.

* `models.ts` — the model list, shared by the API validator and the UI picker.

## Testing

```bash
npm test

npm run typecheck

npm run pipeline -- "https://www.youtube.com/watch?v=..." english gemini-3.8-flash

npm run e2e
```

The PDF/renderer checks deliberately include injection attempts (`<script>`,

`<img onerror>`, quotes inside diagram `fill` attributes) because model output

is never treated as trusted markup.


