# Import runtime deploy — final verdict

## Verdict summary

| Layer | State at verification |
|--------|------------------------|
| **GitHub `main`** | `99766fb` |
| **Railway backend runtime** | **`99766fb`** — **aligned** |
| **Vercel frontend runtime** | **Stale bundle** vs local `99766fb` build (entry asset hash mismatch) |
| **Authenticated E2E import** | **Not executed** in this pass (no production user token) |

## FINAL VERDICT (single label)

**FRONTEND_DEPLOY_MISMATCH** — backend production is on the hardened revision; the public Vercel `index.html` sampled did not match the current local production build fingerprints, so **redeploy Vercel** before claiming full web E2E parity.

After Vercel matches `main`, expect **PRODUCTION_IMPORT_FIX_ACTIVE_AND_OPERATIONAL** for users with DS and/or Affiliate, modulo honest API failures.

## Remaining human step

1. Deploy / redeploy **ivan-reseller-web** on Vercel from `main` @ `99766fb`.
2. Run the checklist in `IMPORT_RUNTIME_PRODUCTION_RETEST.md` while logged in.
