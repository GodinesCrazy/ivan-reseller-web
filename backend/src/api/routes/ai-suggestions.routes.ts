import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { aiSuggestionsService } from '../../services/ai-suggestions.service';
import { AppError } from '../../middleware/error.middleware';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

// GET /api/ai-suggestions - Obtener sugerencias del usuario
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const filter = req.query.filter as string | undefined;
    const suggestions = await aiSuggestionsService.getSuggestions(userId, filter);

    res.json({
      success: true,
      suggestions,
      count: suggestions.length
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai-suggestions/generate - Generar nuevas sugerencias IA
router.post('/generate', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const category = req.body.category as string | undefined;

    const suggestions = await aiSuggestionsService.generateSuggestions(userId, category);

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
      message: `Se generaron ${suggestions.length} sugerencias inteligentes`
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai-suggestions/:id/implement - Marcar sugerencia como implementada
router.post('/:id/implement', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const suggestionId = req.params.id;
    await aiSuggestionsService.implementSuggestion(userId, suggestionId);

    res.json({
      success: true,
      message: 'Sugerencia marcada como implementada'
    });
  } catch (error) {
    next(error);
  }
});

export default router;

