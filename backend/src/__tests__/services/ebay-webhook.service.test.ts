import crypto from 'crypto';
import {
  buildEbayChallengeResponse,
  decodeEbaySignatureHeader,
  resolveEbayWebhookEndpoint,
  verifyEbayNotificationSignatureWithKey,
} from '../../services/ebay-webhook.service';

describe('ebay-webhook.service', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds the eBay challenge response from challenge code, token, and endpoint', () => {
    const challengeResponse = buildEbayChallengeResponse({
      challengeCode: 'abc123',
      verificationToken: 'token-xyz',
      endpoint: 'https://example.com/api/webhooks/ebay',
    });

    expect(challengeResponse).toBe(
      crypto
        .createHash('sha256')
        .update('abc123token-xyzhttps://example.com/api/webhooks/ebay')
        .digest('hex')
    );
  });

  it('resolves the public webhook endpoint from BACKEND_URL', () => {
    process.env.BACKEND_URL = 'https://backend.example.com/';
    delete process.env.EBAY_WEBHOOK_ENDPOINT;

    expect(resolveEbayWebhookEndpoint()).toBe(
      'https://backend.example.com/api/webhooks/ebay'
    );
  });

  it('verifies an eBay notification signature using the provided public key', () => {
    const payload = JSON.stringify({ orderId: '17-14370-63716' });
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const signer = crypto.createSign('sha1');
    signer.update(Buffer.from(payload));
    signer.end();
    const signature = signer.sign(privateKey).toString('base64');
    const encodedHeader = Buffer.from(
      JSON.stringify({
        alg: 'ECDSA',
        kid: 'test-key',
        digest: 'SHA1',
        signature,
      }),
      'utf8'
    ).toString('base64');

    const decoded = decodeEbaySignatureHeader(encodedHeader);
    const valid = verifyEbayNotificationSignatureWithKey({
      payload,
      decodedSignature: decoded,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      digestAlgorithm: 'SHA1',
    });

    expect(valid).toBe(true);
  });
});
