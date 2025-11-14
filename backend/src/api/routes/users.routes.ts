// @ts-nocheck
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { userService } from '../../services/user.service';
import { registerPasswordSchema } from '../../utils/password-validation';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createUserSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: registerPasswordSchema, // Validación de contraseña fuerte
  fullName: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  commissionRate: z.number().optional(),
  fixedMonthlyCost: z.number().optional(),
  isActive: z.boolean().optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  password: registerPasswordSchema.optional(), // Validación de contraseña fuerte si se proporciona
  role: z.enum(['ADMIN', 'USER']).optional(),
  commissionRate: z.number().min(0).max(1).optional(), // 0.0 a 1.0 (0% a 100%)
  fixedMonthlyCost: z.number().min(0).optional(), // Costo fijo mensual en USD
});

// GET /api/users (Admin only)
router.get('/', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await userService.getAllUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// POST /api/users (Admin only) - Create new user
router.post('/', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await userService.createUser(data);
    res.status(201).json({ 
      success: true, 
      data: user,
      message: 'User created successfully'
    });
  } catch (error: any) {
    // Log error for debugging
    console.error('[Users Route] Error creating user:', error);
    
    // If it's a validation error from Zod
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    // If it's a Prisma error
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }
    
    // If it's a known error with message
    if (error.message) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    // Otherwise, pass to error handler
    next(error);
  }
});

// GET /api/users/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    // Users can only view their own profile, unless they're admin
    if (!isAdmin && req.user?.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own profile'
      });
    }

    const user = await userService.getUserById(userId);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    // Users can only update their own profile, unless they're admin
    if (!isAdmin && req.user?.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own profile'
      });
    }

    const data = updateUserSchema.parse(req.body);
    
    // Only admins can change roles, commissionRate, and fixedMonthlyCost
    if (data.role && !isAdmin) {
      delete data.role;
    }

    if (data.commissionRate !== undefined && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores pueden modificar la comisión de los usuarios'
      });
    }

    if (data.fixedMonthlyCost !== undefined && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Solo los administradores pueden modificar el costo fijo mensual de los usuarios'
      });
    }

    const user = await userService.updateUser(userId, data);
    res.json({ 
      success: true, 
      data: user,
      message: 'User updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id (Admin only)
router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    const result = await userService.deleteUser(userId);
    res.json({ 
      success: true, 
      message: result.message
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id/stats
router.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    // Users can only view their own stats, unless they're admin
    if (!isAdmin && req.user?.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own stats'
      });
    }

    const stats = await userService.getUserStats(userId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id/profile - Get complete user profile (Admin only or own profile)
router.get('/:id/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Normalizar rol a mayúsculas para comparación case-insensitive
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    // Users can only view their own profile, unless they're admin
    if (!isAdmin && req.user?.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own profile'
      });
    }

    const profile = await userService.getUserProfile(userId);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/username/:username - Get user by username (Admin only)
router.get('/username/:username', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const username = req.params.username;
    const profile = await userService.getUserProfileByUsername(username);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

export default router;
