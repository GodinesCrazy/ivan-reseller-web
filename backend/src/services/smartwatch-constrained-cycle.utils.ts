/**
 * Pure helpers for smartwatch constrained cycle (keep tests light — no heavy service imports).
 */

export function isSmartwatchTitleForConstrainedCycle(title: string): boolean {
  return /\bsmart[\s-]?watch(?:es)?\b/i.test(title) || /\bsmartwatch\b/i.test(title);
}
