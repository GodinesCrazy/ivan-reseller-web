import type { AliExpressFreightOption } from './aliexpress-freight-normalizer';

export interface MlChileFreightSelectionResult {
  selected: AliExpressFreightOption | null;
  reason: string;
}

function isStandardLike(serviceName: string): boolean {
  return /(standard|tracked|tracking|registered|premium|select|cainiao.*standard)/i.test(
    serviceName,
  );
}

export function selectMlChileFreightOption(
  options: AliExpressFreightOption[],
): MlChileFreightSelectionResult {
  if (!options.length) {
    return {
      selected: null,
      reason: 'No freight options were returned by AliExpress freight calculation.',
    };
  }

  const valid = options.filter(
    (option) =>
      Number.isFinite(option.freightAmount) &&
      option.freightAmount >= 0 &&
      Boolean(String(option.serviceName || '').trim()),
  );
  if (!valid.length) {
    return {
      selected: null,
      reason: 'Freight options existed but none had a usable service name and amount.',
    };
  }

  const preferredPool = valid.filter((option) => option.isTrackedLike || isStandardLike(option.serviceName));
  const pool = preferredPool.length > 0 ? preferredPool : valid;
  const selected = [...pool].sort((a, b) => a.freightAmount - b.freightAmount)[0] || null;

  return {
    selected,
    reason: selected
      ? preferredPool.length > 0
        ? 'Selected the cheapest tracked/standard-like freight option.'
        : 'Selected the cheapest usable freight option.'
      : 'No usable freight option remained after filtering.',
  };
}
