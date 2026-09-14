# Wellversed FAM v3.3.0 — QA Report

## Verified offline
- Seed Vendor Matrix: 542
- Seed Solution Matrix: 233
- Seed distinct vendors: 343
- Seed categories: 7
- Seed Knowledge Base docs: 165
- Seed reference docs: 10
- Seed employees: 17
- JavaScript syntax: all application pages and Netlify Functions pass `node --check`
- `netlify.toml`: publish `site`, functions `netlify/functions`, Node 20
- Public browser bundle does not contain the full dashboard dataset; the verified seed remains server-side in `netlify/functions/seed-data.js`.

## Runtime protections
- Server-side last-known-good merge/fallback for partial Google Sheets responses.
- Five-minute shared warm-instance dashboard cache and in-flight request deduplication.
- Google Sheets retry/backoff and request timeouts.
- Browser-side dataset integrity gate prevents an incomplete remote response from replacing a valid workspace.
- KPI count rendering clamps invalid/negative values to zero.
- Navigation is driven by the centralized hashchange router.
- Personal Sheets are isolated by verified Google email and return explicit permission errors.

## Environment-dependent tests still required on Netlify
- Google OAuth against the production origin.
- Live Google Sheets permissions/service-account access.
- Actual Netlify function runtime and Google API responses.
- Personal Sheet connection with a real Sheet shared to the service account as Viewer.

These cannot be truthfully certified offline without the real Google/Netlify credentials and runtime.
