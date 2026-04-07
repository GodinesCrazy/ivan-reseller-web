# P85 — Relative-winner failure analysis

## Relative vs absolute

| Concept | Meaning |
|---------|---------|
| **Relative winner** | Highest `preferenceScore` among finalists that **passed** Policy + Conversion + Hero + Integrity (P84). |
| **Absolute publish-worthy** | Meets a **minimum** commercial bar independent of other finalists — weak set should not produce a live portada. |

## Failure mode after P84

P84 guarantees: *if* multiple finals pass gates, the **best among them** is chosen. It does **not** guarantee that the best is **good enough** for publication. Example: two washed-out, low-center-signal covers might both pass integrity/hero by threshold luck; the “winner” is still mediocre.

## What already helps

- **Hero + integrity gates** — block extreme trim false positives, near-blank fields, tiny subjects (within threshold bands).
- **Preference score** — correlates with readability, washout, center signal, silhouette proxies.

## What P85 adds

**Absolute floors** on the same commercial proxies the preference model uses, so a relative winner below the bar triggers `human_review_required` instead of pack emission.
