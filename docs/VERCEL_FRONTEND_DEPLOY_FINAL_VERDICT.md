# Vercel frontend deploy — final verdict

**Date of verification:** 2026-03-30 (HTTP `Date` header on deployment fetch)

## Verdict

**VERCEL_PRODUCTION_FRONTEND_ALIGNED**

Production custom domains serve HTML whose entry assets match the successful Vercel Production build for project `ivan-martys-projects/ivan-reseller-web` (deployment inspect: `57YK4Uugz7hdtfJiNMgfiMNrvB5g`).

## Evidence summary

| Item | Value |
|------|--------|
| Git SHA on `main` (config fix pushed) | `bfffb2154d9e30143868e867c376409accaff427` |
| Vercel project | `ivan-martys-projects/ivan-reseller-web` |
| Deploy inspect | `https://vercel.com/ivan-martys-projects/ivan-reseller-web/57YK4Uugz7hdtfJiNMgfiMNrvB5g` |
| Deployment URL | `https://ivan-reseller-jdja6u65n-ivan-martys-projects.vercel.app` (401 without SSO) |
| Production aliases verified | `https://www.ivanreseller.com`, `https://ivanreseller.com` |
| Live entry JS | `/assets/index-DYu6xa-v.js` |
| Live entry CSS | `/assets/index-BI8lM2P0.css` |
| Matches Vercel build log | Yes |

## Blockers

None for public bundle verification.

## Next human step

In a browser with a valid session: **Opportunities → Import → Products** retest (authenticated). Not reproducible here without your auth cookies.
