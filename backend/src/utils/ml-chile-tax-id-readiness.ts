export type MlChileTaxIdReadinessClassification =
  | 'absent_but_likely_required'
  | 'partially_modeled'
  | 'already_modeled'
  | 'not_evidenced_yet';

export interface MlChileTaxIdReadinessInput {
  chileSpecificHitCount: number;
  genericTaxOrCustomsHitCount: number;
  checkoutFieldHitCount: number;
}

export function classifyMlChileTaxIdReadiness(
  input: MlChileTaxIdReadinessInput,
): MlChileTaxIdReadinessClassification {
  if (input.chileSpecificHitCount > 0) {
    return 'already_modeled';
  }

  if (input.genericTaxOrCustomsHitCount > 0 || input.checkoutFieldHitCount > 0) {
    return 'partially_modeled';
  }

  if (
    input.chileSpecificHitCount === 0 &&
    input.genericTaxOrCustomsHitCount === 0 &&
    input.checkoutFieldHitCount === 0
  ) {
    return 'absent_but_likely_required';
  }

  return 'not_evidenced_yet';
}
