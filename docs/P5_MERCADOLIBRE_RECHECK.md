## P5 MercadoLibre Recheck

### Decision
`START ONLY AFTER FIRST EBAY VALIDATED PRODUCT`

### Reason
P5 was intentionally narrow. eBay is now the strongest connector path and still lacks the first valid product candidate. Starting MercadoLibre before that would split attention across marketplaces while the dominant blocker is still supplier reality.

### Current Opportunity Cost
- eBay already has real OAuth usability
- eBay now has real destination/subscription webhook proof
- the next blocker is sourcing quality and supplier stock reality, not marketplace breadth

### Why Not Advance MercadoLibre Yet
- It would not solve the present `VALIDATED_READY = 0` problem
- It would add marketplace branching before first-product recovery is proven on the strongest current path
- It would increase noise while the supplier-side bottleneck is still the main constraint

### Re-open Condition
Re-open MercadoLibre only after:
- first real eBay `VALIDATED_READY` candidate exists
or
- the team concludes with evidence that eBay US is structurally worse than MercadoLibre for the current supplier stack
