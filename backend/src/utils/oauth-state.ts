/**
 * OAuth state for AliExpress Dropshipping: stateless JWT.
 * No memory, Redis, or Map. Verify with same secret used to sign.
 */

import jwt from 'jsonwebtoken';

const PROVIDER = 'aliexpress-dropshipping';
const EXPIRES_IN = '10m';

export interface OAuthStatePayload {
  userId: number;
  provider: string;
  timestamp: number;
}

function getSecret(): string {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret === 'default-key') {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET required for OAuth state');
  }
  return secret;
}

/**
 * Generate state for AliExpress Dropshipping OAuth (stateless JWT).
 */
export function signStateAliExpress(userId: number): string {
  const secret = getSecret();
  return jwt.sign(
    {
      userId,
      provider: PROVIDER,
      timestamp: Date.now(),
    } as OAuthStatePayload,
    secret,
    { expiresIn: EXPIRES_IN }
  );
}

/**
 * Verify state from callback and return payload.
 * Throws if invalid or expired.
 */
export function verifyStateAliExpress(state: string): OAuthStatePayload {
  const secret = getSecret();
  const decoded = jwt.verify(state, secret) as OAuthStatePayload;
  if (decoded.provider !== PROVIDER || typeof decoded.userId !== 'number') {
    throw new Error('Invalid state payload');
  }
  return decoded;
}

/**
 * Safe verify: returns null if invalid/expired instead of throwing.
 */
export function verifyStateAliExpressSafe(state: string): { ok: true; userId: number } | { ok: false; reason: string } {
  try {
    const payload = verifyStateAliExpress(state);
    return { ok: true, userId: payload.userId };
  } catch (e: any) {
    const reason = e?.name === 'TokenExpiredError' ? 'expired' : e?.name === 'JsonWebTokenError' ? 'invalid_signature' : 'parse_error';
    return { ok: false, reason };
  }
}
