# StageOS Web App

Next.js App Router frontend for StageOS with:

- React Query data layer
- Zustand client state
- TailwindCSS UI system
- PWA support (manifest + service worker + offline page)
- Responsive shell for mobile, tablet, and desktop

## Environment

Copy the template:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Required values:

- `NEXT_PUBLIC_API_URL` (default: `http://localhost:4000/api`)
- `NEXT_PUBLIC_DEFAULT_BAND_ID` (optional convenience for seeded/local data)

## Development

From repo root:

```bash
corepack pnpm install
corepack pnpm --filter @stageos/web dev
```

## Checks

```bash
corepack pnpm --filter @stageos/web lint
corepack pnpm --filter @stageos/web typecheck
corepack pnpm --filter @stageos/web test:e2e
```

## Production build

```bash
corepack pnpm --filter @stageos/web build
corepack pnpm --filter @stageos/web start
```

Docker image build:

```bash
docker build -f apps/web/Dockerfile -t stageos-web:local .
```
