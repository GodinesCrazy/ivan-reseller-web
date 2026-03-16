/**
 * Formatea lastRun evitando fechas inválidas (ej. solo hora que se interpreta como 2006)
 */
export function formatLastRun(lastRun: string | null | undefined): string {
  if (!lastRun) return '—';
  const d = new Date(lastRun);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  if (y < 2010 || y > 2030) return '—';
  return d.toLocaleString();
}
