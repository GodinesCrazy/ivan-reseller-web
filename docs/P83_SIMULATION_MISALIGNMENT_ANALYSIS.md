# P83 — Simulation misalignment analysis

## What P82 fixed

P82 ranked remediation sources using **preview recipes** + **hero + integrity + simulation dual-gate** on the preview output. That aligns selection with post-recipe gates better than P81 source-only heuristics.

## Where P82 still diverged from “final portada” quality

1. **`simScore` was mostly gate-pass plus raw hero/integrity scalars** — it underweighted **commercial readability** (subject presence in the buyer’s focal area, washout, flat energy).
2. **Low-res preview** (960–1152 class outputs, 900px max input) **smooths or hides** fine edge texture and some silhouette cues that appear at production scale.
3. **“All gates pass” could still look weak** — e.g. high near-white fraction with a technically passing hero/integrity band, or a washy center that still clears thresholds.
4. **Dead space and min(width,height) subject share** were not explicit score dimensions; a pass could still feel “small on canvas” commercially.

## Blind spots (formalized)

| Dimension | Symptom | P82 gap |
|-----------|---------|---------|
| Center readability | product feels tiny or lost in white | No explicit center signal metric |
| Washout / flat | low visual energy, pastel fog | `nearWhite` alone insufficient |
| Silhouette / pop | weak separation at glance | Underweighted contrast × signal interaction |
| Edge / halo busyness | ugly frame at full res | Preview resolution muted penalty |
| False “clean pass” | gates pass but looks empty | No **suspicious-pass** down-rank |

## Why calibration + optional hi-fi (P83)

- **Calibrated metrics** on the **same** simulated buffer close the semantic gap without touching production gates.
- **Higher-fidelity preview** for the top 1–2 candidates recovers resolution-dependent cues at bounded cost.
