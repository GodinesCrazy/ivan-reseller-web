# P36 Reactivation Ready Handoff

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Leave the listing ready for the manual MercadoLibre asset replacement step once the approved files exist.

## Current State

Status: `DONE`

The reactivation handoff path is fully defined, but execution remains blocked by missing approved replacement files.

## Exact Upload Order

1. Remove the current non-compliant cover from listing `MLC3786354420`
2. Upload `cover_main` first
3. Upload `detail_mount_interface`
4. Upload `usage_context_clean` only if it exists, is approved, and is actually used
5. Save the listing changes
6. If MercadoLibre still keeps the listing paused, use the reactivate or resubmit action required by the seller interface

## Evidence To Capture

Capture all of the following after upload:

- seller-tool screenshot before image replacement
- seller-tool screenshot showing the new cover as primary image
- seller-tool screenshot showing the final gallery
- post-save listing status
- any MercadoLibre review, pause, or approval message
- public listing view after replacement, if accessible

## Gate Reminder

Do not perform the upload sequence with placeholder files or unapproved images. The manual reactivation step only becomes executable once the real approved files exist in the pack.

