# P36 Asset Pack Readiness Verification

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Verify whether the local replacement asset pack is actually ready for MercadoLibre replacement.

## Readiness Helper

Script:

- `backend/scripts/check-ml-asset-pack-readiness.ts`

Validation rules:

- `cover_main` must exist
- `detail_mount_interface` must exist
- `usage_context_clean` is optional
- any present asset must be square-like
- any required asset must be at least `1200x1200`

## Command

```powershell
cd backend
npx tsx scripts/check-ml-asset-pack-readiness.ts
```

## Result

Status: `DONE`

Exact output:

```json
{
  "packDir": "C:\\Ivan_Reseller_Web\\artifacts\\mlc3786354420",
  "ready": false,
  "missingRequired": [
    "cover_main",
    "detail_mount_interface"
  ],
  "invalidRequired": [],
  "results": [
    {
      "assetKey": "cover_main",
      "required": true,
      "exists": false,
      "path": null,
      "width": null,
      "height": null,
      "squareLike": null,
      "min1200": null
    },
    {
      "assetKey": "detail_mount_interface",
      "required": true,
      "exists": false,
      "path": null,
      "width": null,
      "height": null,
      "squareLike": null,
      "min1200": null
    },
    {
      "assetKey": "usage_context_clean",
      "required": false,
      "exists": false,
      "path": null,
      "width": null,
      "height": null,
      "squareLike": null,
      "min1200": null
    }
  ]
}
```

## Verification Conclusion

- `cover_main exists = false`
- `detail_mount_interface exists = false`
- `pack ready = false`

