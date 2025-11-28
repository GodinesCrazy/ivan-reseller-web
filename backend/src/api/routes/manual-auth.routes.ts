import { Router } from 'express';
import { z } from 'zod';
import ManualAuthService from '../../services/manual-auth.service';
import { authenticate } from '../../middleware/auth.middleware';
import { CredentialsManager } from '../../services/credentials-manager.service';
import { marketplaceAuthStatusService } from '../../services/marketplace-auth-status.service';

const router = Router();

const PROVIDER_LOGIN_URLS: Record<string, string> = {
  aliexpress: 'https://passport.aliexpress.com/mini_login.htm?lang=en_US&appName=ae_pc_protection&fromSite=main&returnURL=https%3A%2F%2Fwww.aliexpress.com%2F',
};

router.post('/', authenticate, async (req, res) => {
  const provider = String(req.body?.provider || 'aliexpress').toLowerCase();
  const loginUrl = PROVIDER_LOGIN_URLS[provider];
  if (!loginUrl) {
    return res.status(400).json({ success: false, error: 'unsupported_provider' });
  }

  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'auth_required' });
  }

  const session = await ManualAuthService.startSession(userId, provider, loginUrl);

  return res.json({
    success: true,
    provider,
    token: session.token,
    loginUrl: session.loginUrl,
    expiresAt: session.expiresAt,
  });
});

router.get('/:token', async (req, res) => {
  const token = String(req.params.token);
  const session = await ManualAuthService.getSessionByToken(token);
  if (!session) {
    return res.status(404).json({ success: false, error: 'session_not_found' });
  }

  // ✅ CORREGIDO: Leer loginUrl desde metadata si existe, sino usar URL por defecto
  let loginUrl = PROVIDER_LOGIN_URLS[session.provider] || '';
  try {
    const sessionAny = session as any;
    if (sessionAny.metadata) {
      const metadata = typeof sessionAny.metadata === 'string' 
        ? JSON.parse(sessionAny.metadata) 
        : sessionAny.metadata;
      if (metadata?.loginUrl) {
        loginUrl = metadata.loginUrl; // Usar la URL específica guardada (página con CAPTCHA)
      }
    }
  } catch (error) {
    // Si hay error parseando metadata, usar URL por defecto
  }

  return res.json({
    success: true,
    provider: session.provider,
    status: session.status,
    loginUrl, // URL específica de la página con CAPTCHA
    expiresAt: session.expiresAt,
    completedAt: session.completedAt,
  });
});

router.post('/:token/complete', async (req, res) => {
  const token = String(req.params.token);
  const schema = z.object({
    provider: z.string().default('aliexpress'),
    cookies: z.union([
      z.string().transform((value, ctx) => {
        try {
          const parsed = JSON.parse(value);
          return parsed;
        } catch (error) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cookies JSON string' });
          return z.NEVER;
        }
      }),
      z.array(z.any()),
    ]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'invalid_payload', details: parsed.error.flatten() });
  }

  const session = await ManualAuthService.getSessionByToken(token);
  if (!session) {
    return res.status(404).json({ success: false, error: 'session_not_found' });
  }
  if (session.status === 'completed') {
    return res.status(409).json({ success: false, error: 'session_completed' });
  }
  if (session.status === 'expired') {
    return res.status(410).json({ success: false, error: 'session_expired' });
  }

  const cookies = Array.isArray(parsed.data.cookies) ? parsed.data.cookies : [];
  if (cookies.length === 0) {
    return res.status(400).json({ success: false, error: 'cookies_required' });
  }

  const provider = (parsed.data.provider || session.provider || 'aliexpress').toLowerCase();
  if (provider !== 'aliexpress') {
    return res.status(400).json({ success: false, error: 'unsupported_provider' });
  }

  const existingCreds = await CredentialsManager.getCredentials(session.userId, 'aliexpress', 'production');
  if (!existingCreds || !(existingCreds as any).email || !(existingCreds as any).password) {
    return res.status(400).json({ success: false, error: 'missing_credentials', message: 'Debes configurar email y password en Other Credentials antes de guardar cookies.' });
  }

  const mergedCreds = {
    ...(existingCreds as any),
    cookies,
  };

  await CredentialsManager.saveCredentials(session.userId, 'aliexpress', mergedCreds, 'production');
  await ManualAuthService.completeSession(token, cookies);

  return res.json({ success: true });
});

router.post('/save-cookies', authenticate, async (req, res) => {
  const schema = z.object({
    cookies: z.union([
      z.string().transform((value, ctx) => {
        try {
          const parsed = JSON.parse(value);
          return parsed;
        } catch (error) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Formato de cookies inválido' });
          return z.NEVER;
        }
      }),
      z.array(z.any()),
    ]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'invalid_payload', details: parsed.error.flatten() });
  }

  const cookies = Array.isArray(parsed.data.cookies) ? parsed.data.cookies : [];
  if (cookies.length === 0) {
    return res.status(400).json({ success: false, error: 'cookies_required', message: 'Debes pegar las cookies en formato JSON.' });
  }

  const userId = req.user!.userId;
  const existingCreds = await CredentialsManager.getCredentials(userId, 'aliexpress', 'production');
  if (!existingCreds || !(existingCreds as any).email || !(existingCreds as any).password) {
    return res.status(400).json({ success: false, error: 'missing_credentials', message: 'Configura email y password en la tarjeta de AliExpress antes de guardar cookies.' });
  }

  const mergedCreds = {
    ...(existingCreds as any),
    cookies,
  };

  await CredentialsManager.saveCredentials(userId, 'aliexpress', mergedCreds, 'production');
  await marketplaceAuthStatusService.markHealthy(userId, 'aliexpress', 'Cookies guardadas manualmente');

  return res.json({ success: true });
});

export default router;

