# Opportunities discovery UX (web)

## Page: `/opportunities`

### Search

- **Search** always starts at **page 1** for the current term (does not change page when only tweaking unrelated state unless you click Search).
- **Enter** in the keyword field runs the same as **Search**.

### Page size

- Select **10 por página** or **20 por página** (matches Affiliate API max page size).

### Browsing beyond the first batch

- **Siguiente** / **Anterior** call the same endpoint with `page` incremented or decremented.
- Summary line shows: current page, count in view, page size, and a hint when more pages may exist.

### No auto-refresh

- Results do not poll or auto-refresh; the user explicitly runs Search or changes page.

### Import / publish

- **Importar** and marketplace actions are unchanged; they operate on the visible row.

### Tips

- If you change **por página**, click **Search** again to refresh from page 1 with the new size (optional but avoids mixing semantics).
