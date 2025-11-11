import { Router, Request, Response } from 'express';
import { MarketplaceService } from '../../services/marketplace.service';
import { EbayService } from '../../services/ebay.service';
import { MercadoLibreService } from '../../services/mercadolibre.service';
import crypto from 'crypto';

const router = Router();
const marketplaceService = new MarketplaceService();

function parseState(state: string) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length < 6) return { ok: false };
    const [userIdStr, mk, ts, nonce, redirB64, env = 'production', sig] = parts.length === 7
      ? parts
      : [...parts, 'production'];
    const payload = [userIdStr, mk, ts, nonce, redirB64, env].join('|');
    const secret = process.env.ENCRYPTION_KEY || 'default-key';
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (expectedSig !== sig) return { ok: false };
    const redirectUri = Buffer.from(redirB64, 'base64url').toString('utf8');
    const userId = parseInt(userIdStr, 10);
    if (!userId || !mk) return { ok: false };
    return { ok: true, userId, marketplace: mk, redirectUri, environment: env as 'sandbox' | 'production' };
  } catch {
    return { ok: false };
  }
}

// Public callback (no auth) to complete OAuth
router.get('/oauth/callback/:marketplace', async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.params;
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const parsed = parseState(state);
    if (!parsed.ok) {
      return res.status(400).send('<html><body>Invalid state</body></html>');
    }
    const { userId, redirectUri, environment } = parsed as any;

    if (marketplace === 'ebay') {
      const cred = await marketplaceService.getCredentials(userId, 'ebay', environment);
      const appId = cred?.credentials?.appId || process.env.EBAY_APP_ID || '';
      const devId = cred?.credentials?.devId || process.env.EBAY_DEV_ID || '';
      const certId = cred?.credentials?.certId || process.env.EBAY_CERT_ID || '';
      const sandbox = !!(cred?.credentials?.sandbox || (process.env.EBAY_SANDBOX === 'true'));
      if (!appId || !devId || !certId) {
        return res
          .status(400)
          .send('<html><body>Base credentials missing. Please save App ID, Dev ID and Cert ID before authorizing.</body></html>');
      }
      const ebay = new EbayService({ appId, devId, certId, sandbox });
      const tokens = await ebay.exchangeCodeForToken(code, redirectUri);
      const newCreds = { ...(cred?.credentials || {}), token: tokens.token, refreshToken: tokens.refreshToken };
      await marketplaceService.saveCredentials(userId, 'ebay', newCreds, environment);
    } else if (marketplace === 'mercadolibre') {
      const cred = await marketplaceService.getCredentials(userId, 'mercadolibre', environment);
      const clientId = cred?.credentials?.clientId || process.env.MERCADOLIBRE_CLIENT_ID || '';
      const clientSecret = cred?.credentials?.clientSecret || process.env.MERCADOLIBRE_CLIENT_SECRET || '';
      const siteId = cred?.credentials?.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLM';
      if (!clientId || !clientSecret) {
        return res
          .status(400)
          .send('<html><body>Base credentials missing. Please save Client ID and Client Secret before authorizing.</body></html>');
      }
      const ml = new MercadoLibreService({ clientId, clientSecret, siteId });
      const tokens = await ml.exchangeCodeForToken(code, redirectUri);
      const newCreds = { ...(cred?.credentials || {}), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, userId: tokens.userId };
      await marketplaceService.saveCredentials(userId, 'mercadolibre', newCreds, environment);
    } else {
      return res.status(400).send('<html><body>Marketplace not supported</body></html>');
    }

    res.send('<html><body>Authorization completed. You can close this window.</body></html>');
  } catch (e: any) {
    res.status(500).send(`<html><body>OAuth error: ${e?.message || 'Unknown'}</body></html>`);
  }
});

export default router;

