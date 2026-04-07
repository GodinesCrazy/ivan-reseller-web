import { resolveMercadoLibrePreflightOverallState } from '../mercadolibre-publish-preflight.service';

describe('resolveMercadoLibrePreflightOverallState', () => {
  const allOk = {
    productStatusOk: true,
    hasAliUrl: true,
    packageOk: true,
    credentialsOk: true,
    mlApiOk: true,
    languageOk: true,
    imagesOk: true,
    pricingOk: true,
    postsaleOk: true,
  };

  it('returns ready_to_publish when all gates pass', () => {
    expect(resolveMercadoLibrePreflightOverallState(allOk)).toBe('ready_to_publish');
  });

  it('prioritizes product status over pricing', () => {
    expect(
      resolveMercadoLibrePreflightOverallState({
        ...allOk,
        productStatusOk: false,
        pricingOk: false,
      })
    ).toBe('blocked_product_status');
  });

  it('returns blocked_postsale_readiness when only postsale fails', () => {
    expect(
      resolveMercadoLibrePreflightOverallState({
        ...allOk,
        postsaleOk: false,
      })
    ).toBe('blocked_postsale_readiness');
  });

  it('returns blocked_physical_package when package data is incomplete', () => {
    expect(
      resolveMercadoLibrePreflightOverallState({
        ...allOk,
        packageOk: false,
      })
    ).toBe('blocked_physical_package');
  });
});
