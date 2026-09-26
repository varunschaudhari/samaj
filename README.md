# Samaj

The Teli Samaj app: a member directory for the community, organised by district, city and town branches. Members use it on their phones, in English or Marathi. Committee members and admins also use it on desktop.

## What's here

```
apps/api         Express + MongoDB API (auth, RBAC, directory)
apps/web         React + Vite web app (mobile first)
packages/shared  zod schemas, types, RBAC table, constants. Imported by both apps.
```

- **Auth:** mobile number and password. The access token (JWT, 15 minutes) and a rotating refresh token (30 days) are stored in httpOnly cookies. Passwords are hashed with argon2id.
- **Roles:** `member` can read the directory. `committee` can also see contact details and, later, verify and edit members, but only inside their own branch and the branches below it. `admin` can do everything. The table is in [packages/shared/src/rbac.ts](packages/shared/src/rbac.ts).
- **Languages:** English (the default) and Marathi. Each user picks their language and it's saved to their account. Strings live in [apps/web/src/i18n](apps/web/src/i18n).

## Requirements

- Node 20.19 or newer (`.nvmrc`)
- Docker, for the local MongoDB

## Set up

```sh
npm install                 # first run also downloads a MongoDB binary for the API tests
cp .env.example .env        # every variable is documented in the file
npm run db:up               # starts MongoDB in Docker
npm run seed                # sample branches, members and three sign-in accounts
npm run dev                 # API on :4000, web on :5173, both with hot reload
```

Open http://localhost:5173. The seed script prints the demo accounts. All of them use the password `samaj-dev-2026`:

| Role      | Mobile     | Scope                    |
| --------- | ---------- | ------------------------ |
| admin     | 9800000001 | everything               |
| committee | 9800000002 | Jalgaon District and its towns |
| member    | 9800000003 | directory only, no phone numbers |

**Port 27017 already in use?** If you have MongoDB installed as a service, set `MONGO_PORT=27018` in `.env` and change `MONGODB_URI` to `mongodb://localhost:27018/samaj`.

The API validates `.env` at startup. If anything is missing or malformed, it prints which variable and why, then exits.

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | API and web together, hot reload                |
| `npm run typecheck` | `tsc --noEmit` in every workspace               |
| `npm test`          | Vitest in every workspace; API tests use an in-memory MongoDB |
| `npm run build`     | Bundles the API (`apps/api/dist`) and web (`apps/web/dist`) |
| `npm run seed`      | Wipes and reseeds the dev database. Refuses to run in production. |
| `npm run db:up` / `db:down` | Start or stop MongoDB in Docker          |

## Design system

Open http://localhost:5173/styleguide to see every token and primitive in every state, including a dark mode preview.

- Tokens: [apps/web/src/styles/tokens.css](apps/web/src/styles/tokens.css), mapped into Tailwind 4 in [index.css](apps/web/src/styles/index.css). Tailwind's default palette, type scale and radii are removed, so only our tokens exist as classes.
- Fonts: Noto Sans Devanagari (UI and body) and Eczar (display). Both are self-hosted, variable, and limited to the Latin and Devanagari subsets. Metric-matched fallbacks keep the layout from shifting when the fonts load. `lang="mr"` on `<html>` switches both fonts to Marathi letterforms.
- Icons: `lucide-react` only, through the [`Icon`](apps/web/src/components/ui/Icon.tsx) wrapper (16, 20 or 24px, stroke 1.75).
- Primitives: [apps/web/src/components/ui](apps/web/src/components/ui). Variants use `class-variance-authority`, and classes are composed with `cn()`.

## Conventions

- Routes stay thin. Controllers parse input with the shared zod schemas. Services hold the logic and don't depend on Express.
- Validation messages are dictionary keys (`validation.phone`), not sentences, so the same schema produces English or Marathi errors in the browser and the API returns the same keys.
- All errors are written by one handler ([error-handler.ts](apps/api/src/middleware/error-handler.ts)). Responses never include stack traces. Every response carries an `x-request-id` that also appears in the logs.
- Every list and page implements four states: loading skeleton, empty (saying what to do next), error with retry, and loaded.
