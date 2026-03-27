import { MarketplaceService } from '../marketplace.service';

describe('MarketplaceService - eBay OAuth local callback precedence', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'x'.repeat(64),
      EBAY_APP_ID: 'test-app-id',
      EBAY_CERT_ID: 'test-cert-id',
      FRONTEND_URL: 'https://www.ivanreseller.com',
      WEB_BASE_URL: 'https://www.ivanreseller.com',
      EBAY_REDIRECT_URI: 'https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('uses localhost callback when the request originates locally', async () => {
    const service = new MarketplaceService();
    jest.spyOn(service, 'getCredentials').mockResolvedValue({
      credentials: {
        appId: 'test-app-id',
        certId: 'test-cert-id',
        redirectUri: 'https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay',
      },
      environment: 'production',
    } as any);

    const url = await service.getEbayOAuthStartUrl(1, 'production', {
      requestBaseUrl: 'http://localhost:4000',
      frontendBaseUrl: 'http://localhost:3000',
    });

    expect(url).toContain(
      'redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fapi%2Fmarketplace-oauth%2Foauth%2Fcallback%2Febay'
    );
  });
});
