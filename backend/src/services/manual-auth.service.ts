import { PrismaClient, ManualAuthSession } from '@prisma/client';
import crypto from 'crypto';
import { marketplaceAuthStatusService } from './marketplace-auth-status.service';

const prisma = new PrismaClient();

const DEFAULT_EXPIRATION_MINUTES = parseInt(process.env.MANUAL_AUTH_EXPIRATION_MINUTES || '20', 10);

export interface ManualAuthStartResult {
  token: string;
  loginUrl: string;
  expiresAt: Date;
}

export class ManualAuthService {
  static async startSession(userId: number, provider: string, loginUrl: string): Promise<ManualAuthStartResult> {
    await this.expireOldSessions();

    const existing = await prisma.manualAuthSession.findFirst({
      where: {
        userId,
        provider,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) {
      return {
        token: existing.token,
        loginUrl,
        expiresAt: existing.expiresAt || new Date(Date.now() + DEFAULT_EXPIRATION_MINUTES * 60 * 1000),
      };
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRATION_MINUTES * 60 * 1000);

    // ✅ CORREGIDO: Guardar loginUrl en metadata para que el frontend pueda abrir la página correcta
    await prisma.manualAuthSession.create({
      data: {
        userId,
        provider,
        token,
        expiresAt,
        metadata: JSON.stringify({
          loginUrl, // Guardar la URL de la página con CAPTCHA
          type: 'captcha_resolution'
        }) as any,
      } as any,
    });

    await marketplaceAuthStatusService.markManualRequired(
      userId,
      provider,
      'Sesión manual requerida para completar el login'
    );

    return { token, loginUrl, expiresAt };
  }

  static async completeSession(token: string, cookies: any[]): Promise<ManualAuthSession | null> {
    const session = await prisma.manualAuthSession.findUnique({ where: { token } });
    if (!session || session.status === 'expired') {
      return null;
    }

    const updated = await prisma.manualAuthSession.update({
      where: { token },
      data: {
        status: 'completed',
        cookies,
        completedAt: new Date(),
      },
    });

    await marketplaceAuthStatusService.markHealthy(
      updated.userId,
      updated.provider,
      'Sesión manual completada correctamente'
    );

    return updated;
  }

  static async getActiveSession(userId: number, provider: string): Promise<ManualAuthSession | null> {
    await this.expireOldSessions();
    return prisma.manualAuthSession.findFirst({
      where: {
        userId,
        provider,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getSessionByToken(token: string): Promise<ManualAuthSession | null> {
    await this.expireOldSessions();
    return prisma.manualAuthSession.findUnique({ where: { token } });
  }

  static async expireOldSessions(): Promise<void> {
    await prisma.manualAuthSession.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    });
  }
}

export default ManualAuthService;

