# Samaj

The Teli Samaj app: a member directory for the community, organised by district, city and town branches. Members use it on their phones, in English or Marathi. Committee members and admins also use it on desktop.

## What's here

```
apps/api         Express + MongoDB API (auth, RBAC, directory)
apps/web         React + Vite web app (mobile first)
packages/shared  zod schemas, types, RBAC table, constants. Imported by both apps.
```

- **Auth:** mobile number and password. The access token (JWT, 15 minutes) and a rotating refresh token (30 days) are stored in httpOnly cookies. Passwords are hashed with argon2id.
- **Families:** every account belongs to a family (a household) and starts as its head. The family lists everyone in the household: relation to the head, gender, birth year, occupation, education, an optional phone and a photo.
- **Verification:** new families wait for their branch committee to review them. The committee reviews a whole household at once and either verifies it or sends it back with a note, and the family can fix its details and resubmit. The directory shows only verified families, and members of a family that isn't verified yet can open only their own family page. Committee members can't review their own family; an admin can.
- **Branches:** districts, with cities and towns inside them (two levels). The seed creates Jalgaon District with Amalner and Dharangaon. Admins add, rename and remove branches on the Branches screen; a branch can only be removed while it has no families and nothing inside it, and names must be unique within a district in both English and Marathi.
- **Gotra:** chosen from a fixed list in [packages/shared/src/gotras.ts](packages/shared/src/gotras.ts), with English and Marathi names. The database stores the id, so spellings can't drift, and "Not listed / not sure" is always available. The six gotras there now are placeholders: replace them with the samaj's real list, and keep the ids stable once families use them.
- **Roles:** `member` can read the directory and edit their own family. `committee` can also see contact details, edit families and review new ones, but only inside their own branch and the branches below it. `admin` works in every branch: review, branches, and making people members or committee. `superadmin` (the samaj's trustees) can do everything an admin can and is the only role that can appoint or remove admins and super admins. Nobody can change their own role, and the app won't demote the last super admin. The table is in [packages/shared/src/rbac.ts](packages/shared/src/rbac.ts), and the per-record rules (own family, branch scope) are in [apps/api/src/services/access.ts](apps/api/src/services/access.ts).
- **People and roles:** admins find any account on Admin → People (by name or mobile number) and set its role and branch. For a committee member, the branch is the one they manage, including every town inside it. Changes take effect on that person's next request, and each one is recorded with who made it. An admin can't change their own role.
- **Forgotten passwords:** there is no SMS. A committee member (for ordinary members of their branch) or an admin (for anyone) creates a one-time code from the family page or the People screen and gives it to the person by phone. The code is 8 characters, works once, expires after 30 minutes, allows 5 tries, and is stored hashed. Using it signs that account out everywhere. Codes only work downwards (committee for members of their branch, admins for members and committee, super admins for anyone), because a code lets you sign in as that person. Signed-in users can change their password from Profile.
- **Matrimony:** verified families create profiles for unmarried members of legal age (21 for men, 18 for women), confirming the person's consent. The branch committee approves each profile before others see it, and can remove one with a note. Search is always on behalf of one of your own live profiles: opposite gender, never the same gotra, never your own family (the API enforces this for interests too). Photos are visible to verified members; contact details only after the other family accepts an interest. Marking a profile married closes it and withdraws its open interests. The rules are summarised at the top of [packages/shared/src/schemas/matrimony.ts](packages/shared/src/schemas/matrimony.ts).
- **Community:** the landing tab, with three sections. **Notices** (announcements, meetings, celebrations, condolences) and **Events** (with a per-family RSVP headcount) are posted by a branch committee and reach families in that branch and every town under it. **Committee** lists each branch's office-bearers with phone numbers, so families, including those still waiting for verification, know who to call. Committee members maintain all three for their own branch and the towns under it; admins anywhere.
- **Installable app (PWA):** members can add Samaj to their home screen (Profile shows an Install button on Android Chrome). The app itself, and the directory, families, notices and events a person has already opened, work offline, with a banner saying so. Changes always need a connection. Saved data is wiped on sign-in and sign-out, so a shared phone never shows the previous person's data. The service worker runs only in production builds: test it with `npm run build -w @samaj/web && npm run preview -w @samaj/web` (http://localhost:4173, with the API running).
- **Photos:** resized to 512px JPEG in the browser (which also removes location data), checked by file signature on the server, and stored on disk under `UPLOAD_DIR` (`apps/api/uploads` by default). They are served only to people allowed to see that family. Back this folder up along with the database.
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

| Role      | Mobile     | What to try                                             |
| --------- | ---------- | ------------------------------------------------------- |
| superadmin | 9800000005 | everything, including appointing admins                 |
| admin     | 9800000001 | Review, People and Branches in every branch; can't appoint admins |
| committee | 9800000002 | Review tab: families waiting in Jalgaon District, Amalner and Dharangaon |
| member    | 9800000003 | verified family in Amalner: directory, own family, photo upload, and matrimony for their son Rohit Demo |
| member    | 9800000004 | pending family in Dharangaon: directory is closed until the committee verifies it |

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
