# P34 Reviewed-Proof Metadata Preparation

Date: 2026-03-23

## Goal

Prepare the exact reviewed-proof structure required by the new ML image-policy gate once the replacement cover is approved.

## Canonical fields

The reviewed-proof record must include:

- `mlChileImageCompliance.status`
- `reviewedAt`
- `reviewedBy`
- `assetSource`
- `primaryImageUrl`
- `visualSignals`

## Exact values to write after approval

Use this target structure after the compliant cover is approved:

```json
{
  "mlChileImageCompliance": {
    "status": "ml_image_policy_pass",
    "reviewedAt": "<ISO-8601 approval timestamp>",
    "reviewedBy": "ivan_reseller_operator",
    "assetSource": "manual_replacement",
    "primaryImageUrl": "<approved replacement cover URL>",
    "visualSignals": [],
    "notes": "Reviewed against P34 MercadoLibre Chile asset contract for listing MLC3786354420."
  }
}
```

## Valid field semantics

### `status`

Must be:

- `ml_image_policy_pass`

It must not remain:

- `ml_image_manual_review_required`
- `ml_image_policy_fail`

### `reviewedAt`

Must be the real timestamp when the replacement cover was approved.

### `reviewedBy`

Recommended exact value for this controlled operation:

- `ivan_reseller_operator`

### `assetSource`

Recommended exact value for the active listing replacement:

- `manual_replacement`

Allowed values by the gate also include:

- `clean_local_asset`
- `internal_generated`

### `primaryImageUrl`

Must be the exact URL of the approved replacement cover, not the old supplier image.

It must not point to:

- `https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg`

### `visualSignals`

For an approved safe cover, this should be:

- `[]`

If any risky visual signal remains, the asset should not be approved as pass.

## Write timing

This metadata should be written only after:

1. the replacement cover file exists
2. the reviewer confirms P34 asset compliance
3. the exact approved cover URL is known

## P34 preparation conclusion

The reviewed-proof structure is ready, but it cannot truthfully be written as `pass` until the replacement cover file is actually produced and approved.

