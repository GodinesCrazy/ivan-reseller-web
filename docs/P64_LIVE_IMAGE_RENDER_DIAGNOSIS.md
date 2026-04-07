# P64 — Live image render diagnosis

**Listing:** `MLC3786354420` — **Product:** `32690`

## Observed buyer symptom (active truth)

PDP loads, but **main image / thumbnails look blank or washed out**.

## Live listing media (pre-P64 replacement)

From `p49` **`before`** snapshot during this sprint’s replacement run:

| # | Picture ID | `max_size` | CDN URL (pattern) |
|---|------------|------------|-------------------|
| 1 | `777356-MLC109380855063_032026` | 1200×1200 | `D_777356-MLC109380855063_032026-O.jpg` |
| 2 | `984076-MLC108575468668_032026` | 1156×1200 | `D_984076-MLC108575468668_032026-O.jpg` |

**ML API / upload path:** Succeeded historically; issue was **not** “missing pictures” on the item.

## Quantitative check on ML-hosted JPEGs (pre-P64)

Downloaded CDN bytes and ran luminance stats (`sharp.stats()`):

| Image | Bytes (approx) | Mean RGB | RGB stdev |
|-------|----------------|----------|-----------|
| Old 1 | 17 860 | **246.29** | **7.35** |
| Old 2 | 17 484 | **246.81** | **7.12** |

Interpretation: **extremely high mean luminance** (~246/255) and **very low stdev** (~7) → image is **almost flat near-white**. On a white PDP chrome, the product **visually disappears** (“blank / washed”).

## Root-cause classification

**Primary:** `visually_too_faint` / **near-uniform near-white raster** in the **source assets** that were uploaded (confirmed on local PNGs in `P64_LOCAL_ASSET_INTEGRITY_AUDIT.md`), reproduced on ML CDN after JPEG pipeline.

**Ruled out (this sprint):**

- **`malformed/corrupt upload`** — ML returned valid JPEGs; dimensions reported.
- **`alpha/transparency blanking on PDP`** — local audit showed **alpha present but fully opaque (255)** on originals; flattening alone would not explain flat-white appearance.
- **`wrong image variant uploaded`** — IDs matched intended pack paths; content was the issue.
- **`unknown_ml_media_issue`** — ML served bytes consistent with **washed** source; no ML-only artifact required to explain the metrics.

## Conclusion

The broken **buyer-visible** appearance was **content/contrast**, not MercadoLibre failing to attach pictures. Correction required **stronger tonal separation** in the files before (or during) upload.
