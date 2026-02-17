This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment Setup

This app supports monorepo-style env loading:
1. Root-level `/.env.local`
2. App-level `apps/web/.env.local` (overrides root values)

Start from `apps/web/.env.example` and provide required keys, especially:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Smoke Check (Protected Routes)

Run the unauthenticated protected-route smoke check:

```bash
npm run smoke:protected-routes
```

Optional overrides:
- PowerShell example:
```powershell
$env:SMOKE_BASE_URL = "http://localhost:3001"
npm run smoke:protected-routes
```
- `SMOKE_EXPECTED_PATH_PREFIX` defaults to `/auth/sign-in`
- `SMOKE_TIMEOUT_MS` defaults to `15000`

## CI Gate

GitHub Actions workflow: `.github/workflows/ci.yml`

Pipeline jobs:
1. `Quality Gates`: install, type-check, lint, unit tests
2. `Smoke Protected Routes`: starts app, runs `npm run smoke:protected-routes`

Required repository secrets for smoke job:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
