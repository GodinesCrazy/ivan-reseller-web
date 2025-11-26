import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';
import crypto from 'crypto';

/**
 * ✅ Servicio de Sala de Reuniones
 * Gestiona reuniones 1:1 entre usuarios y administradores usando Jitsi Meet
 */
export interface MeetingRoomStatus {
  available: boolean;
  activeMeeting?: {
    roomId: string;
    userId: number;
    adminId: number;
    startedAt: Date;
  };
  message?: string;
}

export interface MeetingRoomInfo {
  roomId: string;
  jitsiUrl: string;
  status: 'WAITING' | 'ACTIVE' | 'ENDED';
  userId: number;
  adminId?: number;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;
}

class MeetingRoomService {
  /**
   * Generar ID único de sala basado en userId
   */
  private generateRoomId(userId: number): string {
    const hash = crypto.createHash('sha256').update(`user-${userId}-meeting-${Date.now()}`).digest('hex');
    return `user-${userId}-${hash.substring(0, 8)}`;
  }

  /**
   * Verificar si el admin está disponible (no tiene reuniones activas)
   */
  async checkAdminAvailability(): Promise<MeetingRoomStatus> {
    try {
      // Buscar reuniones activas con admin
      const activeMeeting = await prisma.meetingRoom.findFirst({
        where: {
          status: 'ACTIVE',
          adminId: { not: null }
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          },
          admin: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        },
        orderBy: {
          startedAt: 'desc'
        }
      });

      if (activeMeeting) {
        return {
          available: false,
          activeMeeting: {
            roomId: activeMeeting.roomId,
            userId: activeMeeting.userId,
            adminId: activeMeeting.adminId!,
            startedAt: activeMeeting.startedAt!
          },
          message: `El administrador está ocupado en una reunión con ${activeMeeting.user.username || activeMeeting.user.email}`
        };
      }

      return {
        available: true
      };
    } catch (error: any) {
      // Detectar si el error es porque la tabla no existe
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('does not exist') || 
          errorMessage.includes('Unknown table') ||
          errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        logger.error('Meeting rooms table does not exist. Migration may be required.', { error });
        throw new AppError('La tabla de reuniones no existe. Por favor, ejecuta la migración de base de datos.', 500);
      }
      logger.error('Error checking admin availability', { error, errorMessage });
      throw new AppError('Error al verificar disponibilidad del administrador', 500);
    }
  }

  /**
   * Crear o unirse a una reunión
   */
  async createOrJoinMeeting(userId: number, isAdmin: boolean = false): Promise<MeetingRoomInfo> {
    try {
      // Si es admin, puede unirse a cualquier reunión en espera
      if (isAdmin) {
        const waitingMeeting = await prisma.meetingRoom.findFirst({
          where: {
            status: 'WAITING',
            adminId: null
          },
          orderBy: {
            createdAt: 'asc' // Primera reunión en espera
          }
        });

        if (waitingMeeting) {
          // Admin se une a la reunión en espera
          const updated = await prisma.meetingRoom.update({
            where: { id: waitingMeeting.id },
            data: {
              adminId: userId,
              status: 'ACTIVE',
              startedAt: new Date()
            }
          });

          return {
            roomId: updated.roomId,
            jitsiUrl: this.buildJitsiUrl(updated.roomId),
            status: 'ACTIVE',
            userId: updated.userId,
            adminId: updated.adminId!,
            startedAt: updated.startedAt!
          };
        }

        // Si no hay reuniones en espera, el admin puede crear una sala para esperar usuarios
        const roomId = this.generateRoomId(userId);
        const newMeeting = await prisma.meetingRoom.create({
          data: {
            roomId,
            userId: userId, // Admin crea la sala
            adminId: userId,
            status: 'WAITING'
          }
        });

        return {
          roomId: newMeeting.roomId,
          jitsiUrl: this.buildJitsiUrl(newMeeting.roomId),
          status: 'WAITING',
          userId: newMeeting.userId,
          adminId: newMeeting.adminId!
        };
      }

      // Si es usuario regular, verificar disponibilidad del admin
      const adminStatus = await this.checkAdminAvailability();
      if (!adminStatus.available) {
        throw new AppError(adminStatus.message || 'El administrador está ocupado', 409);
      }

      // Buscar si el usuario ya tiene una reunión activa o en espera
      const existingMeeting = await prisma.meetingRoom.findFirst({
        where: {
          userId,
          status: { in: ['WAITING', 'ACTIVE'] }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (existingMeeting) {
        // Usuario ya tiene una reunión, retornar info
        return {
          roomId: existingMeeting.roomId,
          jitsiUrl: this.buildJitsiUrl(existingMeeting.roomId),
          status: existingMeeting.status as 'WAITING' | 'ACTIVE',
          userId: existingMeeting.userId,
          adminId: existingMeeting.adminId || undefined,
          startedAt: existingMeeting.startedAt || undefined
        };
      }

      // Crear nueva reunión en espera
      const roomId = this.generateRoomId(userId);
      const newMeeting = await prisma.meetingRoom.create({
        data: {
          roomId,
          userId,
          status: 'WAITING'
        }
      });

      return {
        roomId: newMeeting.roomId,
        jitsiUrl: this.buildJitsiUrl(newMeeting.roomId),
        status: 'WAITING',
        userId: newMeeting.userId
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      // Detectar si el error es porque la tabla no existe
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('does not exist') || 
          errorMessage.includes('Unknown table') ||
          errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        logger.error('Meeting rooms table does not exist. Migration may be required.', { error });
        throw new AppError('La tabla de reuniones no existe. Por favor, ejecuta la migración de base de datos.', 500);
      }
      logger.error('Error creating or joining meeting', { error, errorMessage, userId, isAdmin });
      throw new AppError('Error al crear o unirse a la reunión', 500);
    }
  }

  /**
   * Finalizar una reunión
   */
  async endMeeting(roomId: string, userId: number): Promise<void> {
    try {
      const meeting = await prisma.meetingRoom.findUnique({
        where: { roomId }
      });

      if (!meeting) {
        throw new AppError('Reunión no encontrada', 404);
      }

      // Verificar que el usuario tiene permiso (debe ser el usuario o el admin de la reunión)
      if (meeting.userId !== userId && meeting.adminId !== userId) {
        throw new AppError('No tienes permiso para finalizar esta reunión', 403);
      }

      const now = new Date();
      const duration = meeting.startedAt
        ? Math.floor((now.getTime() - meeting.startedAt.getTime()) / 1000)
        : null;

      await prisma.meetingRoom.update({
        where: { roomId },
        data: {
          status: 'ENDED',
          endedAt: now,
          duration: duration || 0
        }
      });

      logger.info('Meeting ended', { roomId, userId, duration });
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('does not exist') || 
          errorMessage.includes('Unknown table') ||
          errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        logger.error('Meeting rooms table does not exist. Migration may be required.', { error });
        throw new AppError('La tabla de reuniones no existe. Por favor, ejecuta la migración de base de datos.', 500);
      }
      logger.error('Error ending meeting', { error, errorMessage, roomId, userId });
      throw new AppError('Error al finalizar la reunión', 500);
    }
  }

  /**
   * Obtener información de una reunión
   */
  async getMeetingInfo(roomId: string, userId: number): Promise<MeetingRoomInfo | null> {
    try {
      const meeting = await prisma.meetingRoom.findUnique({
        where: { roomId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          },
          admin: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      });

      if (!meeting) {
        return null;
      }

      // Verificar que el usuario tiene acceso (debe ser el usuario o el admin de la reunión)
      if (meeting.userId !== userId && meeting.adminId !== userId) {
        throw new AppError('No tienes permiso para acceder a esta reunión', 403);
      }

      return {
        roomId: meeting.roomId,
        jitsiUrl: this.buildJitsiUrl(meeting.roomId),
        status: meeting.status as 'WAITING' | 'ACTIVE' | 'ENDED',
        userId: meeting.userId,
        adminId: meeting.adminId || undefined,
        startedAt: meeting.startedAt || undefined,
        endedAt: meeting.endedAt || undefined,
        duration: meeting.duration || undefined
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('does not exist') || 
          errorMessage.includes('Unknown table') ||
          errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        logger.error('Meeting rooms table does not exist. Migration may be required.', { error });
        throw new AppError('La tabla de reuniones no existe. Por favor, ejecuta la migración de base de datos.', 500);
      }
      logger.error('Error getting meeting info', { error, errorMessage, roomId, userId });
      throw new AppError('Error al obtener información de la reunión', 500);
    }
  }

  /**
   * Obtener historial de reuniones del usuario
   */
  async getUserMeetingHistory(userId: number, limit: number = 10): Promise<MeetingRoomInfo[]> {
    try {
      const meetings = await prisma.meetingRoom.findMany({
        where: {
          OR: [
            { userId },
            { adminId: userId }
          ],
          status: 'ENDED'
        },
        orderBy: {
          endedAt: 'desc'
        },
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          },
          admin: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      });

      return meetings.map(meeting => ({
        roomId: meeting.roomId,
        jitsiUrl: this.buildJitsiUrl(meeting.roomId),
        status: meeting.status as 'WAITING' | 'ACTIVE' | 'ENDED',
        userId: meeting.userId,
        adminId: meeting.adminId || undefined,
        startedAt: meeting.startedAt || undefined,
        endedAt: meeting.endedAt || undefined,
        duration: meeting.duration || undefined
      }));
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('does not exist') || 
          errorMessage.includes('Unknown table') ||
          errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        logger.error('Meeting rooms table does not exist. Migration may be required.', { error });
        throw new AppError('La tabla de reuniones no existe. Por favor, ejecuta la migración de base de datos.', 500);
      }
      logger.error('Error getting user meeting history', { error, errorMessage, userId });
      throw new AppError('Error al obtener historial de reuniones', 500);
    }
  }

  /**
   * Construir URL de Jitsi Meet
   * Usa Jitsi Meet público o instancia auto-hosteada según configuración
   */
  private buildJitsiUrl(roomId: string): string {
    // Por defecto usar Jitsi Meet público (meet.jit.si)
    // En producción, esto debería apuntar a una instancia auto-hosteada
    const jitsiDomain = process.env.JITSI_DOMAIN || 'meet.jit.si';
    
    // Configuración para habilitar todas las funciones
    const config = {
      startWithAudioMuted: false,
      startWithVideoMuted: false,
      enableWelcomePage: false,
      enableClosePage: false,
      disableInviteFunctions: false,
      enableFileUpload: true,
      enableScreenSharing: true,
      enableChat: true,
      enableTileView: true,
      enableLobby: false, // Deshabilitar lobby para acceso directo
      prejoinPageEnabled: false
    };

    const configString = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return `https://${jitsiDomain}/${roomId}?${configString}`;
  }

  /**
   * Limpiar reuniones antiguas (ENDED hace más de 30 días)
   */
  async cleanupOldMeetings(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await prisma.meetingRoom.deleteMany({
        where: {
          status: 'ENDED',
          endedAt: {
            lt: thirtyDaysAgo
          }
        }
      });

      logger.info('Cleaned up old meetings', { count: result.count });
      return result.count;
    } catch (error) {
      logger.error('Error cleaning up old meetings', { error });
      return 0;
    }
  }
}

export const meetingRoomService = new MeetingRoomService();

