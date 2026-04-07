# R1 — Policy compliance patterns

## Core pattern: marketplace-specific rules, not one global image

**Explicit — Sellercloud:** “Certain channels, such as Amazon, require images with a white background… This feature lets you set **different primary and secondary product images per channel**.”

**Source:** Sellercloud Help — Channel-Specific Images (fetched 2026-03-25).

**Explicit — Channable:** Image Editor tied to a **feed**; recommendation to **copy feed per channel**; rules and templates vary by channel needs.

**Source:** Channable Help Center.

**Explicit — Zentail (seller guidance):** Documents diverging requirements (e.g. Walmart **5 MB** max called out separately) and links to **Amazon**, **Walmart**, **eBay** official policies.

**Source:** Zentail Help — Product Images: Best Practices.

## Mechanical compliance (size, aspect, padding)

**Explicit — Feedonomics:** “Automatically **pad** your images to fit the requirements of each shopping destination” + team keeps specs current.

**Source:** Feedonomics — Dynamic image padding and processing (fetched).

**INFERENCE:** Padding addresses **aspect ratio / min dimension** class problems; it does **not** remove **text printed on product**.

## Main image vs secondary image

| Mechanism | Evidence |
|-----------|----------|
| Different files per channel for **same SKU** | Sellercloud **channel-specific** primary + supplemental + thumbnail + swatch + **SortIndex** |
| Feed field mapping | Channable — map generated URL to **channel field** in finalize step |
| Policy text differs by slot | **Amazon** main image rules cited via Zentail → Seller Central (white bg, 85% frame, no text) — **marketplace** rule, not Zentail code |

## Where policies live in software architecture

1. **Template / rule packs** per destination (feed tools).
2. **Channel profile** toggles (ERP tools — Sellercloud client setting).
3. **External links + validation** (listing platforms — Zentail-style guidance).

## NOT PROVEN in R1

- Automatic **Mercado Libre** “fondo claro / textos” classifiers inside Western multichannel suites.
- Real-time **policy DSL** shared across all tools (each vendor models differently).

## Implementable takeaway

Treat **policy** as **data**: `MarketplaceImagePolicy` objects (main vs gallery constraints, min px, max MB, bg color, text allowed boolean, etc.) + **validators** that run **before** publish, separate from **transform** recipes.
