# PortWise web app

The calculator (`/`), the methodology page (`/how-it-works`) and the admin dashboard (`/admin`). See the [main README](../README.md) for the overview, demo script and deployment.

```bash
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:8000
npm run dev               # http://localhost:5173
npm test                  # unit tests
npm run e2e               # browser tests (desktop and mobile)
```

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | PortWise API origin, no trailing slash (also used for the CSP `connect-src`) |
| `VITE_USE_MOCKS` | `true` serves every call from the in-browser mock (labelled "Sample data") |
| `VITE_SITE_URL` | The site's own URL, for link previews |

`?demo=1` on any URL switches a tab to the mock API (`?demo=0` switches it back); with demo on, `?mockfail=prohibited_item|unknown_hs_code|internal_error|network|slow` rehearses failure states.

| Path | What it is |
| --- | --- |
| `src/lib/api/` | Contract (`schemas.ts`), client with Rumpty wake-up handling, hooks |
| `src/features/calculator/` | Form, product search, presets, error copy |
| `src/features/results/` | The docket: container bar, breakdown, regime switch, sensitivity, show the math, sharing |
| `src/features/admin/` | Admin dashboard (lazy-loaded) |
| `src/mocks/` | Demo-mode mock API that mirrors the engine to the kobo |
| `scripts/` | Screenshots, OG image, CSP check, admin walkthrough |
| `DESIGN.md` | Design decisions |
