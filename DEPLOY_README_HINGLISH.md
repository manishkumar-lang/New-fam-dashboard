# Wellversed FAM Dashboard — Fresh Deployment

This package is prepared for a **new Netlify project connected to GitHub**.

## Repository structure

- `site/` — static dashboard (Netlify publish directory)
- `netlify/functions/health.js` — deployment/health check
- `netlify/functions/fam-data.js` — authenticated Google Sheets sync
- `netlify.toml` — Netlify build + functions configuration

Netlify must use `site` as the Publish directory and `netlify/functions` as the Functions directory. The functions directory is intentionally outside the publish directory.

## Required Netlify environment variables

Set these in Netlify UI. **Never commit the service-account private key to GitHub.**

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_KNO_SHEET_ID` (optional; the verified FAM KNO Sheet ID is already the fallback)
- `GOOGLE_CLIENT_ID` (optional; the package contains the verified public OAuth client ID as a fallback)
- `GOOGLE_ALLOWED_DOMAIN` (optional; defaults to `wellversed.in`)

## Google OAuth

The browser Client ID is:

`255689281984-2t3k3fe19srh84tnjqk3um3psfda58ie.apps.googleusercontent.com`

After the new Netlify site has its final URL, add that exact `https://...netlify.app` URL under **Authorized JavaScript origins** for this Web OAuth client. Do not add a path or trailing slash.

## Deployment verification order

1. Deploy from GitHub through Netlify.
2. Open `https://YOUR-SITE/.netlify/functions/health`.
3. Confirm the JSON says `ok: true` and both functions are listed.
4. Open the dashboard. It should render from the bundled snapshot immediately.
5. Sign in with Google.
6. After sign-in, the dashboard requests live Sheets data in the background.
7. If live sync fails, the local snapshot remains available; the UI does not freeze.

## Performance design

- Immediate in-memory snapshot for first paint.
- IndexedDB persistence is opened in the background and never gates startup.
- localStorage is only a fallback.
- Vendor aggregation uses `Map`/`Set` for near-linear O(n) processing.
- Google Sheets reads use `values:batchGet` in chunks rather than one HTTP request per sheet.
- Backend source processing uses bounded concurrency to reduce total sync time without flooding the Sheets API.
- Live data is fetched only after Google sign-in because the backend validates the Google ID token.
