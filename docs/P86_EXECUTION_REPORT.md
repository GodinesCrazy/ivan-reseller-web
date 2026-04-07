# P86 — Execution report

## Objective

Calibrate the Commercial Finalist Floor against a **small labeled starter set** without redesigning the pipeline.

## Method

- Formalized Good / Borderline / Weak protocol and trace fields (`P86_CALIBRATION_SET_DEFINITION.md`, `P86_DATA_COLLECTION_EXTRACTION.md`).
- Used **two trace-derived rows** from SKU 32690 (Good = preference winner, Weak = runner-up) in `artifacts/ml-calibration/p86_starter_labeled_traces.json`.
- Compared metric distributions (`P86_THRESHOLD_CALIBRATION_ANALYSIS.md`) and updated `COMMERCIAL_FINALIST_FLOOR_DEFAULTS` (`P86_COMMERCIAL_FLOOR_TUNING.md`).

## Key outcome

**Tightened** washout ceiling (**0.52 → 0.42**) so a weak-but-relative finalist with washout **0.456** fails the absolute bar; raised readability, silhouette, preference min; slightly tightened max dead space; left center signal and subject area unchanged pending more Borderline samples.

## Non-regression

Policy / conversion / hero / integrity unchanged; floor remains env-tunable and default-on.
