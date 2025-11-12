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

    res.send(`
      <html>
        <head>
          <title>Autorización completada</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
            .success { color: green; font-size: 18px; margin: 20px 0; }
            .error { color: red; font-size: 18px; margin: 20px 0; }
            .info { color: #666; font-size: 14px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">✅ Autorización completada exitosamente</div>
          <div class="info">Puedes cerrar esta ventana y regresar a la aplicación.</div>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth_success', marketplace: '${req.params.marketplace}' }, '*');
              }
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } catch (e: any) {
    const errorMessage = e?.message || 'Unknown error';
    const isUnauthorizedClient = errorMessage.toLowerCase().includes('unauthorized_client') || 
                                 errorMessage.toLowerCase().includes('oauth client was not found');
    
    let userFriendlyMessage = 'Error al completar la autorización OAuth.';
    let troubleshooting = '';
    
    if (isUnauthorizedClient) {
      userFriendlyMessage = '❌ Error: El App ID de eBay no fue encontrado o no es válido.';
      troubleshooting = `
        <div style="text-align: left; max-width: 600px; margin: 20px auto; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px;">
          <h3 style="margin-top: 0;">Posibles causas:</h3>
          <ul>
            <li>El <strong>App ID</strong> que ingresaste no existe en eBay Developer Portal</li>
            <li>El <strong>App ID</strong> es de <strong>Production</strong> pero estás usando <strong>Sandbox</strong> (o viceversa)</li>
            <li>El <strong>App ID</strong> no está correctamente registrado en tu cuenta de eBay Developer</li>
            <li>El <strong>Redirect URI (RuName)</strong> no coincide con el registrado en eBay Developer Portal</li>
          </ul>
          <h3>¿Qué hacer?</h3>
          <ol>
            <li>Ve a <a href="https://developer.ebay.com" target="_blank">eBay Developer Portal</a></li>
            <li>Verifica que tu aplicación esté creada y activa</li>
            <li>Confirma que el <strong>App ID</strong>, <strong>Dev ID</strong> y <strong>Cert ID</strong> sean correctos</li>
            <li>Verifica que el <strong>Redirect URI (RuName)</strong> coincida exactamente</li>
            <li>Si estás usando <strong>Sandbox</strong>, asegúrate de usar credenciales de Sandbox</li>
            <li>Si estás usando <strong>Production</strong>, asegúrate de usar credenciales de Production</li>
          </ol>
        </div>
      `;
    }
    
    res.status(500).send(`
      <html>
        <head>
          <title>Error de autorización</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .error { color: red; font-size: 18px; margin: 20px 0; text-align: center; }
            .details { color: #666; font-size: 12px; margin-top: 10px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="error">${userFriendlyMessage}</div>
          <div class="details">Error técnico: ${errorMessage}</div>
          ${troubleshooting}
          <div style="text-align: center; margin-top: 30px;">
            <button onclick="window.close()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
              Cerrar ventana
            </button>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'oauth_error', 
                marketplace: '${req.params.marketplace}',
                error: '${errorMessage.replace(/'/g, "\\'")}'
              }, '*');
            }
          </script>
        </body>
      </html>
    `);
  }
});

export default router;

