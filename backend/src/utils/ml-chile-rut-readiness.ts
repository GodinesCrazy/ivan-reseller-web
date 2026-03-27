export type MlChileRutReadiness =
  | 'absent_but_likely_required'
  | 'partially_modeled'
  | 'already_modeled'
  | 'not_evidenced_yet';

export interface MlChileRutReadinessResult {
  classification: MlChileRutReadiness;
  reason: string;
}

export function classifyMlChileRutReadiness(params: {
  placeOrderSupportsRutNo: boolean;
  shippingAddressSupportsRutNo: boolean;
}): MlChileRutReadinessResult {
  if (params.placeOrderSupportsRutNo && params.shippingAddressSupportsRutNo) {
    return {
      classification: 'already_modeled',
      reason: 'The supplier checkout request already models Chile rut_no capture and mapping.',
    };
  }

  if (params.placeOrderSupportsRutNo || params.shippingAddressSupportsRutNo) {
    return {
      classification: 'partially_modeled',
      reason: 'Chile RUT appears partially modeled but not end-to-end in supplier checkout payload mapping.',
    };
  }

  return {
    classification: 'absent_but_likely_required',
    reason: 'AliExpress trade.buy.placeorder is expected to require rut_no for Chile, but the current checkout request shape does not model it yet.',
  };
}
