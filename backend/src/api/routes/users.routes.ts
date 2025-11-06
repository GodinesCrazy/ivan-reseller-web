import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { userService } from '../../services/user.service';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createUserSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'USER']).optional(),
  commissionRate: z.number().optional(),
  fixedMonthlyCost: z.number().optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  commissionRate: z.number().optional(),
  fixedMonthlyCost: z.number().optional(),
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
  } catch (error) {
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
    
    // Only admins can change roles
    if (data.role && !isAdmin) {
      delete data.role;
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

export default router;
