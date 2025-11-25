import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { z } from 'zod';
import logger from '../config/logger';
import { authService } from './auth.service';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

export interface CreateAccessRequestDto {
  username: string;
  email: string;
  fullName?: string;
  company?: string;
  reason?: string;
}

export interface UpdateAccessRequestDto {
  status: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  notes?: string;
}

export class AccessRequestService {
  /**
   * ✅ P0.5: Crear solicitud de acceso
   */
  async createAccessRequest(data: CreateAccessRequestDto): Promise<{ id: number; email: string; status: string }> {
    // Validar que el email no esté ya registrado
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new AppError('An account with this email already exists', 400);
    }

    // Validar que no haya una solicitud pendiente con este email
    const existingRequest = await prisma.accessRequest.findUnique({
      where: { email: data.email }
    });

    if (existingRequest && existingRequest.status === 'PENDING') {
      throw new AppError('An access request with this email is already pending', 400);
    }

    // Validar username único
    const existingUsername = await prisma.user.findUnique({
      where: { username: data.username }
    });

    if (existingUsername) {
      throw new AppError('This username is already taken', 400);
    }

    // Crear solicitud
    const request = await prisma.accessRequest.create({
      data: {
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        company: data.company,
        reason: data.reason,
        status: 'PENDING'
      }
    });

    logger.info('[ACCESS-REQUEST] New access request created', {
      id: request.id,
      email: data.email,
      username: data.username
    });

    return {
      id: request.id,
      email: request.email,
      status: request.status
    };
  }

  /**
   * ✅ P0.5: Obtener todas las solicitudes (admin)
   */
  async getAccessRequests(status?: string): Promise<any[]> {
    const where: any = {};
    
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      where.status = status;
    }

    const requests = await prisma.accessRequest.findMany({
      where,
      include: {
        reviewer: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return requests;
  }

  /**
   * ✅ P0.5: Aprobar solicitud de acceso (admin)
   */
  async approveAccessRequest(requestId: number, adminId: number, password: string, notes?: string): Promise<{ success: boolean; userId?: number }> {
    const request = await prisma.accessRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      throw new AppError('Access request not found', 404);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(`Access request is already ${request.status}`, 400);
    }

    // Verificar que el email y username aún no estén en uso
    const existingUser = await prisma.user.findUnique({
      where: { email: request.email }
    });

    if (existingUser) {
      throw new AppError('An account with this email already exists', 400);
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username: request.username }
    });

    if (existingUsername) {
      throw new AppError('This username is already taken', 400);
    }

    // Aprobar solicitud y crear usuario
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar solicitud
      const updatedRequest = await tx.accessRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          notes
        }
      });

      // Crear usuario con password proporcionado por admin
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      const newUser = await tx.user.create({
        data: {
          username: request.username,
          email: request.email,
          password: hashedPassword,
          fullName: request.fullName,
          role: 'USER',
          createdBy: adminId,
          isActive: true
        }
      });

      // TODO: Enviar email con credenciales temporales
      logger.info('[ACCESS-REQUEST] User created from approved request', {
        requestId,
        userId: newUser.id,
        email: request.email,
        adminId
      });

      // ✅ CORRECCIÓN: tempPassword está definido en el scope del try
      const result = {
        request: updatedRequest,
        user: newUser,
        tempPassword // En producción, esto debe enviarse por email
      };
      
      return result;
    });

    return {
      success: true,
      userId: result.user.id
    };
  }

  /**
   * ✅ P0.5: Rechazar solicitud de acceso (admin)
   */
  async rejectAccessRequest(requestId: number, adminId: number, rejectionReason?: string, notes?: string): Promise<{ success: boolean }> {
    const request = await prisma.accessRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      throw new AppError('Access request not found', 404);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(`Access request is already ${request.status}`, 400);
    }

    await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason,
        notes
      }
    });

    logger.info('[ACCESS-REQUEST] Access request rejected', {
      requestId,
      email: request.email,
      adminId,
      rejectionReason
    });

    return { success: true };
  }

  /**
   * ✅ P0.5: Verificar estado de solicitud por email
   */
  async getRequestStatusByEmail(email: string): Promise<{ status: string; reviewedAt?: Date } | null> {
    const request = await prisma.accessRequest.findUnique({
      where: { email },
      select: {
        status: true,
        reviewedAt: true
      }
    });

    if (!request) {
      return null;
    }

    return {
      status: request.status,
      reviewedAt: request.reviewedAt || undefined
    };
  }
}

export const accessRequestService = new AccessRequestService();

