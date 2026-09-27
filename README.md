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
- **Joining a family:** a mobile number belongs to one person. When the family lists someone with their number (a spouse, a grown child), that person doesn't sign up. The family, or its branch committee, creates an invite code from the family page, and the person enters it with their number on **Join your family** (`/join`). Their new sign-in is linked to the person already listed, in the same family, and the family keeps its verification status. Sign-up refuses a number that is already listed in a family and points to Join instead, so households aren't registered twice. Invite codes are 8 characters, work once, expire after 7 days, allow 5 tries, and are stored hashed; a new code replaces the old one.
- **Committee enrolment:** for households without a smartphone, or at an enrolment camp, committee members (in their own branch and the towns inside it) and admins use **Enrol a family** on the Review screen. They enter the head and the family details, and the family starts verified, because its reviewer created it. They then add the rest of the household and give invite codes to anyone who wants their own sign-in.
- **Verification:** new families wait for their branch committee to review them. The committee reviews a whole household at once and either verifies it or sends it back with a note, and the family can fix its details and resubmit. The directory shows only verified families, and members of a family that isn't verified yet can open only their own family page. Committee members can't review their own family; an admin can.
- **Branches:** districts, with cities and towns inside them (two levels). The seed creates Jalgaon District with Amalner and Dharangaon. Admins add, rename and remove branches on the Branches screen; a branch can only be removed while it has no families and nothing inside it, and names must be unique within a district in both English and Marathi.
- **Gotra:** chosen from a fixed list in [packages/shared/src/gotras.ts](packages/shared/src/gotras.ts), with English and Marathi names. The database stores the id, so spellings can't drift, and "Not listed / not sure" is always available. The six gotras there now are placeholders: replace them with the samaj's real list, and keep the ids stable once families use them.
- **Roles:** `member` can read the directory and edit their own family. `committee` can also see contact details, edit families and review new ones, but only inside their own branch and the branches below it. `admin` works in every branch: review, branches, and making people members or committee. `superadmin` (the samaj's trustees) can do everything an admin can and is the only role that can appoint or remove admins and super admins. Nobody can change their own role, and the app won't demote the last super admin. The table is in [packages/shared/src/rbac.ts](packages/shared/src/rbac.ts), and the per-record rules (own family, branch scope) are in [apps/api/src/services/access.ts](apps/api/src/services/access.ts).
- **People and roles:** admins find any account on Admin → People (by name or mobile number) and set its role and branch. For a committee member, the branch is the one they manage, including every town inside it. Changes take effect on that person's next request, and each one is recorded with who made it. An admin can't change their own role.
- **Setting up committees:** Admin → Branches shows each district's and town's committee. *Committee for …* lets an admin add anyone with an account (search by name or number) as committee for that branch, optionally listing them on the Committee page under a post, and remove them again, which makes them a member in their own family's branch. It uses the same role change as People, so it's recorded in role history. People without an account can be enrolled with their family first.
- **Forgotten passwords:** there is no SMS. A committee member (for ordinary members of their branch) or an admin (for anyone) creates a one-time code from the family page or the People screen and gives it to the person by phone. The code is 8 characters, works once, expires after 30 minutes, allows 5 tries, and is stored hashed. Using it signs that account out everywhere. Codes only work downwards (committee for members of their branch, admins for members and committee, super admins for anyone), because a code lets you sign in as that person. Signed-in users can change their password from Profile.
- **Matrimony:** verified families create profiles for unmarried members of legal age (21 for men, 18 for women), confirming the person's consent. The branch committee approves each profile before others see it, and can remove one with a note. Search is always on behalf of one of your own live profiles: opposite gender, never the same gotra, never your own family (the API enforces this for interests too). Photos are visible to verified members; contact details only after the other family accepts an interest. Marking a profile married closes it and withdraws its open interests. The rules are summarised at the top of [packages/shared/src/schemas/matrimony.ts](packages/shared/src/schemas/matrimony.ts).
- **Community:** the landing tab, with three sections. **Notices** (announcements, meetings, celebrations, condolences) and **Events** (with a per-family RSVP headcount) are posted by a branch committee and reach families in that branch and every town under it. **Committee** lists each branch's office-bearers with phone numbers, so families, including those still waiting for verification, know who to call. Committee members maintain all three for their own branch and the towns under it; admins anywhere.
- **Installable app (PWA):** members can add Samaj to their home screen (Profile shows an Install button on Android Chrome). The app itself, and the directory, families, notices and events a person has already opened, work offline, with a banner saying so. Changes always need a connection. Saved data is wiped on sign-in and sign-out, so a shared phone never shows the previous person's data. The service worker runs only in production builds: test it with `npm run build -w @samaj/web && npm run preview -w @samaj/web` (http://localhost:4173, with the API running).
- **Photos:** resized to 512px JPEG in the browser (which also removes location data), checked by file signature on the server, and stored on disk under `UPLOAD_DIR` (`apps/api/uploads` by default), or in MongoDB GridFS with `PHOTO_STORAGE=mongodb` when more than one API server runs. They are served only to people allowed to see that family. With disk storage, back this folder up along with the database.
- **Adding people to a family:** the family (anyone in it with an account) or its branch committee adds people. Once a family is verified, people the family adds wait for the committee: they show on the family page with "Waiting for committee" but not in the directory, can't get an invite code or a matrimony profile, and appear under Review → New people. The committee approves, or turns them down with a reason (they come off the family). People the committee adds, and people added while the whole family is still waiting for verification, need no separate approval. A committee member doesn't approve additions to their own family; an admin may.
- **Related families:** on another family's page, "Link to my family" proposes a link (parents' family, son's or daughter's family, brother's or sister's family, in-laws, relatives). Anyone with an account in the other family, or its committee, accepts or declines it from the Requests box on their family page; Home shows a card while requests wait. Accepted links show on both family pages to anyone who can see the family, each side reading the relation its own way round. Either family can remove a link. Both families must be verified.
- **Moving someone to another family** (usually after a marriage): on the other family's page, "Someone moved to our family" names the person and their relation in the new family. Their current family agrees or declines from its Requests box, then the committee of the new family's branch approves under Review → Moves. The person keeps their sign-in, which now belongs to the new family; an open matrimony profile closes as married. A family head can't move until their family chooses a new head.
- **Home:** the first screen after sign-in has a greeting, a member search, shortcuts, the next events and the latest notices; committee and admins also see their branch's key figures. On phones the tab bar is Home, Directory, Updates, Family, plus Matrimony for members, Review for committee or Admin for admins.
- **Dashboard** (committee and admins, `/dashboard`): families, the review queue, members, matrimony profiles, events and notices for their branch and everything under it (admins: every branch); a verification bar; new families per week for eight weeks; figures per town or district, with branches that have no committee flagged; quick actions. Every figure is an indexed count, cached for a minute (`GET /api/dashboard`).
- **Lists:** every list has the same toolbar: search with a clear button, filters (inline on wide screens, a bottom sheet on phones), the filters in use as chips you can remove one by one, a result count and, where it helps, a sort. Long lists load the next page as you scroll. The directory filters by branch and gotra, People by role and branch, the review queue by branch with oldest or newest first (and flags families waiting over a week), and Branches, Events, Committee and matrimony search have their own filters.
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
| (no sign-in yet) | 9800000006 | Member Demo's spouse. Sign in as 9800000003, open My family and give her a sign-in (phone icon), then sign out and use **Have an invite code?** |

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
| `npm run db:migrate` | Builds indexes and fills derived fields on existing records. Run once per release, before starting it (`node apps/api/dist/migrate.js` in a built deployment). |
| `npm run db:up` / `db:down` | Start or stop MongoDB in Docker          |

## Running at scale

The app is built for lakhs of members. On a generated database of 75,000 families and 3 lakh members, every list (directory, search, People, review queues, notices) returns its page in 4–10 ms, because each one reads a single index in page order. Two-word searches take about 100 ms.

- **Indexes do the work.** Records carry `branchPath` (their branch and every branch above it) and word-prefix search tokens, both filled by Mongoose plugins in [models/plugins.ts](apps/api/src/models/plugins.ts). A new query needs an index that covers both its filter and its sort. Check it with `.explain('executionStats')` against a large database before shipping.
- **Totals are capped** at 1,000 (`COUNT_CAP`); screens show "1,000+" beyond that.
- **Production doesn't build indexes at boot.** Run `npm run db:migrate` with each release.
- **More than one API process:** set `WEB_CONCURRENCY` to the number of CPU cores, or run several containers. Rate limit counts are then shared through MongoDB automatically, and photos need `PHOTO_STORAGE=mongodb` (or, later, object storage behind the interface in [utils/storage.ts](apps/api/src/utils/storage.ts)).
- **Behind a load balancer or proxy,** set `TRUST_PROXY=1` so rate limits see real client addresses. Signed-in people are limited per account, not per IP, because mobile networks put thousands of phones behind one address.
- **The web app downloads in pieces.** Home and the directory are in the first download (about 190 KB gzipped). Forms, matrimony, admin and event pages load when first opened, and the service worker keeps them after that.
- **MongoDB:** use a replica set (for example Atlas M10 or larger) with backups. `DB_POOL_SIZE` sets connections per process.

## Design system

Open http://localhost:5173/styleguide to see every token and primitive in every state, including a dark mode preview.

- Tokens: [apps/web/src/styles/tokens.css](apps/web/src/styles/tokens.css), mapped into Tailwind 4 in [index.css](apps/web/src/styles/index.css). Tailwind's default palette, type scale and radii are removed, so only our tokens exist as classes.
- Fonts: Google Fonts, self-hosted through fontsource so the app works offline and nothing is fetched from Google: Noto Sans Devanagari for UI and body, Poppins (500–700) for headings, names and figures. Only the Latin and Devanagari subsets are declared, and an English-only page never downloads the Devanagari files. Metric-matched fallbacks keep the layout from shifting when the fonts load. `lang="mr"` on `<html>` switches both fonts to Marathi letterforms.
- Icons: Phosphor, listed once in [icons.ts](apps/web/src/components/ui/icons.ts) (each imported from its own file) and drawn through the [`Icon`](apps/web/src/components/ui/Icon.tsx) wrapper: 16, 20, 24 or 32px; `regular` for UI, `fill` for the current tab, `duotone` for tiles and dashboard figures.
- Primitives: [apps/web/src/components/ui](apps/web/src/components/ui). Variants use `class-variance-authority`, and classes are composed with `cn()`.
- Look: a warm ivory canvas, peacock green for actions, and a peacock `bg-hero` band finished with a `zari-border` (a row of gold triangles, like a Paithani border) on Home and the sign-in screens. Filter rows use `Chip` in a `ChipRow`, which scrolls sideways on phones. Lists use [`ListToolbar`](apps/web/src/components/ui/ListToolbar.tsx) and [`LoadMore`](apps/web/src/components/ui/LoadMore.tsx).

## Conventions

- Routes stay thin. Controllers parse input with the shared zod schemas. Services hold the logic and don't depend on Express.
- Validation messages are dictionary keys (`validation.phone`), not sentences, so the same schema produces English or Marathi errors in the browser and the API returns the same keys.
- All errors are written by one handler ([error-handler.ts](apps/api/src/middleware/error-handler.ts)). Responses never include stack traces. Every response carries an `x-request-id` that also appears in the logs.
- Every list and page implements four states: loading skeleton, empty (saying what to do next), error with retry, and loaded.
