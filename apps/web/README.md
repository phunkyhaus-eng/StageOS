# StageOS Signal Lab (Next.js + Supabase)

Ultra-lightweight, mobile-first survey app for fast feature validation:

- 20 required 1-5 ratings (`q1` to `q20`)
- required top 3 feature picks (`top_three`)
- required band type (`band_type`)
- short free-text pain-point answer (`pain_point`)
- anonymous submit (no login)
- password-protected `/admin` results dashboard
- CSV export from admin

## 1) Project structure

```text
apps/web
├─ app
│  ├─ admin
│  │  ├─ export/route.ts
│  │  ├─ actions.ts
│  │  └─ page.tsx
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ .env.example
├─ components
│  └─ survey-form.tsx
├─ lib
│  ├─ admin-auth.ts
│  ├─ aggregations.ts
│  ├─ csv.ts
│  ├─ survey.ts
│  ├─ types.ts
│  └─ supabase
│     ├─ client.ts
│     └─ server.ts
├─ supabase
│  └─ setup.sql
├─ next.config.mjs
├─ package.json
├─ postcss.config.mjs
├─ tailwind.config.ts
└─ tsconfig.json
```

## 2) Environment variables

Set these in `apps/web/.env.local` for local development and in Vercel for production:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
```

You can copy from `apps/web/.env.example`.

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used by the public survey form.
- `SUPABASE_SERVICE_ROLE_KEY` is only used server-side for `/admin` and `/admin/export`.
- `ADMIN_PASSWORD` protects `/admin` via a server-set HTTP-only session cookie.

## 3) Supabase setup (5-10 minutes)

1. Create a Supabase project (free tier).
2. Open Supabase SQL Editor.
3. Run `apps/web/supabase/setup.sql`.

This creates:

- `public.responses` table
- strict constraints for rating values, band type, and exactly 3 unique `top_three` feature IDs
- RLS enabled
- anonymous insert allowed
- public select disallowed

## 4) RLS policy SQL

`apps/web/supabase/setup.sql` includes:

```sql
alter table public.responses enable row level security;
revoke all on table public.responses from anon, authenticated;
grant insert on table public.responses to anon;

create policy responses_anon_insert
  on public.responses
  for insert
  to anon
  with check (true);
```

No `select` policy is created for `anon`/`authenticated`. The service role key is used server-side for admin reads.

## 5) Local run

From repo root:

```bash
pnpm install
pnpm --filter @stageos/web dev
```

Routes:

- Survey: [http://localhost:3000](http://localhost:3000)
- Admin: [http://localhost:3000/admin](http://localhost:3000/admin)

## 6) Vercel deploy (under 20 minutes)

1. Push repo to GitHub.
2. Import repo in Vercel.
3. Set Root Directory to `apps/web`.
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
5. Deploy.

## 7) Admin dashboard behavior

`/admin` includes:

- average score per question
- percent of responses rated 4 or 5 per question
- top-three feature mention counts
- band type breakdown
- raw response table
- CSV export button

## 8) Aggregation logic

For each `q1..q20`:

- `average = sum(scores) / count(scores)`
- `highRatingCount = count(scores >= 4)`
- `highRatingPercent = highRatingCount / count(scores) * 100`

For `top_three`:

- iterate every selected feature ID in each response
- increment mention count per feature ID (`"1"` to `"20"`)

For `band_type`:

- increment count per band type label
