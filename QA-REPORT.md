# Wellversed FAM v3.1.1 — QA Report

## Automated checks completed

- All JavaScript files pass `node --check` syntax validation.
- ZIP archive integrity verified with `unzip -t`.
- Retained baseline dataset counts verified:
  - 542 vendor matrix records
  - 233 solution matrix records
  - 343 distinct vendors
  - 7 categories
  - 165 knowledge-base documents
  - 10 reference documents
  - 17 employees
- `fam-data` mocked Google API integration tested for:
  - unauthenticated request -> 401
  - authenticated request -> 200
  - admin permission mapping
  - warm cache reuse
  - 10 simultaneous requests sharing one in-flight build
  - invalid credential remains 401 even when cache exists
  - stale-cache fallback -> 200
  - server-side retained seed fallback -> 200 with the original 542-record baseline
- `personal-data` mocked Google API integration tested for:
  - unauthenticated request -> 401
  - user isolation: only the signed-in user's registry row is returned
  - connected-sheet read path
  - connect/update path
- Frontend contract checks verified:
  - authentication boot is deduplicated
  - duplicate `fam-data` calls on reload are prevented
  - remote sync is in-flight deduplicated
  - late IndexedDB startup cannot race with the local fallback
  - public `site/js/data-bundle.js` is no longer served
  - legacy contact import is retained outside public site assets
- Static site asset references were checked; only the Netlify HUD endpoint is expected to be unavailable in a plain local static-server test.

## Reliability changes

- 5-minute shared dashboard cache per warm function instance.
- 10-minute FAM Index cache.
- In-flight request deduplication.
- Service-account access-token caching and deduplication.
- Google Sheets retry/backoff for transient 408/429/5xx failures.
- Upstream request timeouts.
- Per-source read failure isolation so one source does not automatically destroy the entire dataset.
- Stale cache fallback after a previously successful build.
- Server-side baseline seed fallback after authentication if Google Sheets is temporarily unavailable.
- Frontend authentication and live-sync request deduplication.

## Important limitation

These tests use mocked Google OAuth/Sheets responses. They cannot reproduce the user's private Netlify environment, Google API quotas, exact source-sheet permissions, or live Google token. The package is therefore hardened and locally tested, but a final Deploy Preview smoke test against the real Netlify environment is still required before merging to `main`.
