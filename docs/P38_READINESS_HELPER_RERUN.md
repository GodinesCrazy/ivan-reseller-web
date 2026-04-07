# P38 Readiness Helper Rerun

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Rerun the local readiness helper and prove whether the pack is ready.

## Command

```powershell
cd C:\Ivan_Reseller_Web\backend
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

## Conclusion

The pack is still not ready:

- `ready = false`
- `missingRequired = ["cover_main", "detail_mount_interface"]`
- `invalidRequired = []`

