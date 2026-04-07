# R1 — Image selection patterns

## What “strong platforms” actually do (evidence)

### 1. Rule-based selection (most documented)

**Channable:** Image generation is driven by **image rules** with **IF conditions** and **THEN template**; “an item can only be edited by one rule — the first rule that selects the item.” This is **priority-ordered rule selection**, not ML embedding similarity.

**Evidence:** Channable Help Center — Create and edit your images (R1 fetch).

### 2. Separate feeds per channel → implicit “selection per channel”

**Channable:** Recommends creating or **copying a feed per channel** before optimizing images for that channel. The “primary” image for output is therefore **whatever that feed’s mapping and rules produce**, not a global single winner.

**Evidence:** Channable Help Center.

### 3. No automatic “best photo” ranking (common gap)

**SellerActive (support articles):** Describes **one primary** + **secondary URLs** imported uniformly — **no** documented automatic ranking of supplier images by quality.

**Evidence:** SellerActive support — Secondary Images article (search hit).

**INFERENCE:** Many mid-market multichannel tools assume **merchant or supplier ordering** in the source; automation is **mapping**, not **aesthetic ranking**.

### 4. AI selection / generation (narrow, channel-specific)

**Helium 10 (marketing):** Listing Builder advertises **AI image generation** from prompts/product context — selection becomes **generate new candidates** rather than **score existing URLs**.

**Evidence:** Helium 10 blog/product pages (search synthesis).

**INFERENCE:** Used heavily for **Amazon** lifestyle / Posts / A+ adjacent use cases; **not** proven as generalized cross-marketplace compliance selector.

## Auto-detection of text, logos, hands, etc.

| Detection type | In competitor public docs (R1) |
|----------------|--------------------------------|
| Text / logo / watermark | **Rare** as automated detection; policies are usually **channel rules** + **human QC** or **template avoidance** |
| Background | **Background removal** as **transform** — **Akeneo Smart Edit** (explicit); **segmentation APIs** (ecosystem, not suite) |
| Hands / clutter | **NOT PROVEN** as automated classifiers in tools reviewed |

## Patterns you can implement (software-shaped)

1. **Ordered rule list:** first match wins (Channable-style).
2. **Per-channel candidate pools:** e.g. `images_amazon[]` vs `images_default[]` (Sellercloud-style **concept**).
3. **Scorecard layer (optional):** implement **internally** — most vendors don’t productize this openly; **inference** from need, not from their docs.

## Unknown / not proven

- Internal **computer vision** stacks at ChannelAdvisor, Rithum, etc.
- **Mercado Libre–specific** auto-ranking in partner tools (English doc gap).
