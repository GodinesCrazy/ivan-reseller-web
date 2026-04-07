# P15 ML Chile Issue Queues Refined

## Objective

Refine ML Chile issue queues so they reflect the new truth after logistics forensics.

## Refined Queue Names

- `no_destination_support_cl_true_supplier_side`
- `no_destination_support_cl_gate_false_negative`
- `supplier_data_incomplete`
- `no_cl_sku`
- `cl_sku_no_stock`
- `category_family_poor_for_cl`
- `near_valid_waiting_on_one_blocker`

## Queue Truth After P15

### Discovery Gate False Negative

This queue is now proven real for the old logic:

- previous gate wrongly collapsed:
  - `ship_to_country = CL`
  - `delivery_time present`
  - `shipping method/cost absent`
into:
  - `no_destination_support_cl`

So the old `no_destination_support_cl` result for the P14 discovery layer should now be treated as:

- `no_destination_support_cl_gate_false_negative`

### True Supplier-Side Destination Absence

This is not the dominant result in P15.

The representative forensic sample showed:

- `0/8` cases of true Chile destination absence

### New Dominant Queue

After the safe gate correction, the dominant queue is now:

- `cl_sku_no_stock = 8`

### Category Queue

- `category_family_poor_for_cl` is not supported as the dominant blocker in P15

## P15 Interpretation

The lead blocker moved again:

1. old blocker: false `no_destination_support_cl`
2. new blocker: `cl_sku_no_stock`

## P15 Verdict

`ISSUE QUEUE REFINEMENT = DONE`
