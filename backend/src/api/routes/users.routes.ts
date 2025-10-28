import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/users (Admin only)
router.get('/', authorize('ADMIN'), async (req, res, next) => {
  try {
    res.json({ success: true, data: [], message: 'Users list (TODO)' });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: {}, message: 'User detail (TODO)' });
  } catch (error) {
    next(error);
  }
});

export default router;
