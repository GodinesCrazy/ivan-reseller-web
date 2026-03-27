import { classifyAliExpressFreightCompatibility } from './aliexpress-freight-compatibility';

describe('classifyAliExpressFreightCompatibility', () => {
  it('marks missing session as incompatible', () => {
    const result = classifyAliExpressFreightCompatibility({
      appFamily: 'affiliate',
      tokenFamily: 'none',
      hasAccessToken: false,
      hasRefreshToken: false,
      lastFailureReason: 'missing session',
    });

    expect(result.freightCredentialCompatibility).toBe('freight_endpoint_incompatible');
  });

  it('marks invalid app key on dropshipping session as incompatible endpoint', () => {
    const result = classifyAliExpressFreightCompatibility({
      appFamily: 'dropshipping',
      tokenFamily: 'dropshipping_session',
      hasAccessToken: true,
      hasRefreshToken: true,
      aliSubCode: 'isv.appkey-not-exists',
      lastFailureReason: 'Invalid app Key',
      accountInfoUsable: true,
    });

    expect(result.freightCredentialCompatibility).toBe('freight_endpoint_incompatible');
  });

  it('marks quote-found as compatible', () => {
    const result = classifyAliExpressFreightCompatibility({
      appFamily: 'dropshipping',
      tokenFamily: 'dropshipping_session',
      hasAccessToken: true,
      hasRefreshToken: true,
      freightOptionsCount: 2,
    });

    expect(result.freightCredentialCompatibility).toBe('freight_quote_found_for_cl');
  });

  it('marks IncompleteSignature as a signature-blocked freight method when secret and session look consistent', () => {
    const result = classifyAliExpressFreightCompatibility({
      appFamily: 'dropshipping',
      tokenFamily: 'dropshipping_session',
      hasAccessToken: true,
      hasRefreshToken: true,
      lastFailureReason: 'IncompleteSignature',
      secretConsistency: 'secret_consistent',
      sessionBindingConsistency: 'session_binding_consistent',
    });

    expect(result.freightCredentialCompatibility).toBe('freight_method_present_signature_blocked');
  });
});
