# P70 — Buyer PDP sanity check

## API (strong)

After P70 `p49`:

- **`status`:** `active`
- **`sub_status`:** `[]`
- **Pictures:** `895233-MLC108580069640_032026`, `937773-MLC108580306370_032026`

## Public PDP automation (weak)

Same limitation as P69: unauthenticated fetch often hits **login / challenge / cookie** surfaces — **not** used here as PDP health proof.

## Separation of concerns

- **Seller photo warning** and **`items` moderation state** can diverge from **anonymous scraper** views.
- **API clean + active** supports operational continuity; **human** PDP check remains optional confirmation.
