import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { accessRequestService, CreateAccessRequestDto } from '../../services/access-request.service';
import { z } from 'zod';
import logger from '../../config/logger';

const router = Router();

// Validation schemas
const createAccessRequestSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  fullName: z.string().optional(),
  company: z.string().optional(),
  reason: z.string().optional(),
});

const updateAccessRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * ✅ P0.5: POST /api/access-requests - Solicitar acceso (público)
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = createAccessRequestSchema.parse(req.body);
    // ✅ CORRECCIÓN: Asegurar que username esté presente (es requerido en el DTO)
    if (!parsedData.username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }
    const data: CreateAccessRequestDto = {
      username: parsedData.username,
      email: parsedData.email,
      fullName: parsedData.fullName,
      company: parsedData.company,
      reason: parsedData.reason,
    };
    
    const request = await accessRequestService.createAccessRequest(data);
    
    logger.info('[ACCESS-REQUEST] New access request', {
      id: request.id,
      email: request.email
    });
    
    return res.status(201).json({
      success: true,
      message: 'Access request submitted successfully. An administrator will review your request shortly.',
      data: {
        id: request.id,
        email: request.email,
        status: request.status
      }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }
    next(error);
  }
});

/**
 * ✅ P0.5: GET /api/access-requests/status/:email - Verificar estado de solicitud (público)
 */
router.get('/status/:email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = req.params.email;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required'
      });
    }
    
    const status = await accessRequestService.getRequestStatusByEmail(email);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'No access request found with this email'
      });
    }
    
    return res.json({
      success: true,
      data: {
        email,
        status: status.status,
        reviewedAt: status.reviewedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// Rutas protegidas (requieren autenticación)
router.use(authenticate);

/**
 * ✅ P0.5: GET /api/access-requests - Obtener todas las solicitudes (admin)
 */
router.get('/', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    
    const requests = await accessRequestService.getAccessRequests(status);
    
    return res.json({
      success: true,
      data: requests,
      count: requests.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ P0.5: GET /api/access-requests/:id - Obtener solicitud por ID (admin)
 */
router.get('/:id', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    const requests = await accessRequestService.getAccessRequests();
    const request = requests.find(r => r.id === id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Access request not found'
      });
    }
    
    return res.json({
      success: true,
      data: request
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ P0.5: POST /api/access-requests/:id/approve - Aprobar solicitud (admin)
 */
router.post('/:id/approve', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { password, notes } = req.body || {};
    const adminId = req.user!.userId;
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password is required and must be at least 8 characters long'
      });
    }
    
    const result = await accessRequestService.approveAccessRequest(id, adminId, password, notes);
    
    logger.info('[ACCESS-REQUEST] Access request approved', {
      requestId: id,
      adminId,
      userId: result.userId
    });
    
    return res.json({
      success: true,
      message: 'Access request approved and user account created successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ P0.5: POST /api/access-requests/:id/reject - Rechazar solicitud (admin)
 */
router.post('/:id/reject', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const data = z.object({
      rejectionReason: z.string().optional(),
      notes: z.string().optional()
    }).parse(req.body || {});
    
    const adminId = req.user!.userId;
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    const result = await accessRequestService.rejectAccessRequest(
      id, 
      adminId, 
      data.rejectionReason, 
      data.notes
    );
    
    logger.info('[ACCESS-REQUEST] Access request rejected', {
      requestId: id,
      adminId,
      rejectionReason: data.rejectionReason
    });
    
    return res.json({
      success: true,
      message: 'Access request rejected successfully',
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }
    next(error);
  }
});

export default router;

