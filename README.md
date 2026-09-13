# Wellversed FAM Intelligence — Secure Production Build

Privacy-first Netlify deployment for the Wellversed FAM dashboard.

## Architecture
- No vendor, employee, pricing, or dashboard snapshot is bundled in the public browser build.
- The dashboard shows no data until a verified Google Workspace login succeeds.
- Live shared FAM data is fetched server-side from Google Sheets after authentication.
- Personal Google Sheets can be connected from **My Workspace**. Each connection is stored against the signed-in email and is only returned to that same account.
- Personal sheets must be shared with the Wellversed service account as **Viewer** so the secure backend can read them.
- My Workspace refreshes its connected sheets automatically every 2 minutes while open.
- Admin and Trash are restricted to `manish.kumar@wellversed.in` in the UI; the live backend also returns an admin permission flag for the verified identity.

## Netlify
Publish directory: `site`
Functions directory: `netlify/functions`

Required environment variables:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_KNO_SHEET_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_ALLOWED_DOMAIN`

Optional:
- `GOOGLE_ADMIN_EMAIL` (defaults to `manish.kumar@wellversed.in`)

## OAuth
Production Web Client ID:
`255689281984-2t3k3fe19srh84tnjqk3um3psfda58ie.apps.googleusercontent.com`

Authorized JavaScript origin:
`https://wellversed-fam-dashboard-new.netlify.app`

Do not commit service-account private keys or client secrets.


## Backend reliability / privacy hardening
- The previous public `site/js/data-bundle.js` is no longer served. The retained baseline dataset is packaged server-side in `netlify/functions/seed-data.js` and is returned only after Google authentication.
- `fam-data` uses warm-instance caching, in-flight request deduplication, Google API retry/backoff, request timeouts, and stale/seed fallback responses to avoid turning transient Sheets failures into dashboard-breaking 500s.
- The Google authentication flow is deduplicated so a page reload cannot start multiple `fam-data` builds at once.
- Legacy contact-import data is retained under `legacy-retained/` and is not exposed as a public site asset.
