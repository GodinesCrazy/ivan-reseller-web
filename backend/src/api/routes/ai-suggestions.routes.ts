import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { aiSuggestionsService } from '../../services/ai-suggestions.service';
import { AppError } from '../../middleware/error.middleware';
import { wrapAsync } from '../../utils/async-route-wrapper';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

// GET /api/ai-suggestions - Obtener sugerencias del usuario
router.get('/', wrapAsync(async (req: Request, res: Response, next) => {
  console.log('[ROUTE_ENTRY] GET /api/ai-suggestions');
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
}, { route: '/api/ai-suggestions', serviceName: 'ai-suggestions' }));

// POST /api/ai-suggestions/generate - Generar nuevas sugerencias IA
router.post('/generate', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const category = req.body.category as string | undefined;

    // ✅ El servicio siempre retorna un array, nunca lanza error
    const suggestions = await aiSuggestionsService.generateSuggestions(userId, category);

    res.json({
      success: true,
      suggestions: suggestions || [],
      count: suggestions?.length || 0,
      message: `Se generaron ${suggestions?.length || 0} sugerencias inteligentes`
    });
  } catch (error: any) {
    // ✅ Si por alguna razón hay un error no capturado, retornar respuesta válida
    console.error('Error in /api/ai-suggestions/generate:', error);
    res.status(200).json({
      success: true,
      suggestions: [],
      count: 0,
      message: 'No se pudieron generar sugerencias en este momento. Intenta más tarde.'
    });
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
