# inhumans.io Launch Readiness (main + dev)

## Branch strategy
- `main`: production branch, connected to Vercel production.
- `dev`: integration branch for daily work and preview deployments.
- Feature flow: `feature/*` -> PR into `dev` -> validate -> PR `dev` -> `main`.

## CI policy
- GitHub Actions runs on push to `dev` and `main`.
- Required checks before merge:
  - `typecheck`
  - `lint`
  - `test`
  - `build`
  - smoke checks where configured

## Vercel setup
- Repository: `hyhihitesh/inhumans.io`
- Root Directory: `apps/web`
- Production Branch: `main`
- Preview Branches: `dev` and feature branches
- Build command: `npm run build`
- Install command: `npm ci`

## Required environment variables
- Core:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CRON_SECRET`
- Configure additional OAuth, billing, scheduler, and webhook keys from `.env.example` based on enabled features.

## Scheduler and webhook auth headers
- Preferred scheduler header: `x-inhumans-scheduler-token`
- Preferred webhook signature header: `x-inhumans-signature`
- Legacy `x-councilflow-scheduler-token` and `x-councilflow-signature` are still accepted for backward compatibility.

## Release checklist for `main`
1. Merge latest `main` into `dev`.
2. Run local gates: `npm run typecheck && npm run lint && npm test && npm run build`.
3. Confirm required GitHub secrets are set for CI.
4. Confirm Vercel Production env vars are set.
5. Open PR from `dev` to `main` and require green checks.
6. Merge to `main` and verify Vercel production deployment status.
