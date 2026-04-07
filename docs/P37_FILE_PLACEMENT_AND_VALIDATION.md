# P37 File Placement And Validation

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Define the exact steps required once the replacement image files are produced.

## Final Placement Rules

Place the finished image files into:

- `C:\Ivan_Reseller_Web\artifacts\mlc3786354420`

Accepted filename mapping:

- `cover_main.png` or `cover_main.jpg` or `cover_main.jpeg` or `cover_main.webp`
- `detail_mount_interface.png` or `detail_mount_interface.jpg` or `detail_mount_interface.jpeg` or `detail_mount_interface.webp`
- `usage_context_clean.png` or `usage_context_clean.jpg` or `usage_context_clean.jpeg` or `usage_context_clean.webp`

## Validation Command

```powershell
cd C:\Ivan_Reseller_Web\backend
npx tsx scripts/check-ml-asset-pack-readiness.ts
```

## Success Condition

The output counts as success only if it shows all of the following:

- `"ready": true`
- `"missingRequired": []`
- `"invalidRequired": []`
- `cover_main.exists = true`
- `detail_mount_interface.exists = true`
- required assets report `squareLike = true`
- required assets report `min1200 = true`

## Current Validation Result

Status: `PARTIAL`

Current exact output:

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

