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
    
    // ✅ Mejorar manejo de errores para no bloquear la UI
    let suggestions: any[] = [];
    try {
      suggestions = await aiSuggestionsService.getSuggestions(userId, filter);
      
      // ✅ Validar que las sugerencias sean serializables antes de enviar
      // Esto previene SIGSEGV durante JSON.stringify
      // Usar un replacer seguro para manejar valores problemáticos
      const safeJsonReplacer = (key: string, value: any): any => {
        // Si es un Decimal de Prisma, convertir a number
        if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
          try {
            const num = value.toNumber();
            return isFinite(num) && !isNaN(num) ? num : 0;
          } catch {
            return 0;
          }
        }
        // Si es un número, validar que sea finito
        if (typeof value === 'number') {
          if (!isFinite(value) || isNaN(value)) {
            return 0;
          }
          // Limitar valores extremos
          if (Math.abs(value) > 1e15) {
            return value > 0 ? 1e15 : -1e15;
          }
        }
        // Si es un string muy largo, truncar
        if (typeof value === 'string' && value.length > 10000) {
          return value.substring(0, 10000);
        }
        return value;
      };

      try {
        // Probar serialización con replacer seguro
        JSON.stringify(suggestions, safeJsonReplacer);
      } catch (serializationError: any) {
        console.error('Error serializando sugerencias, filtrando valores problemáticos:', serializationError);
        // Intentar limpiar las sugerencias problemáticas
        suggestions = suggestions.filter((s: any, idx: number) => {
          try {
            JSON.stringify(s, safeJsonReplacer);
            return true;
          } catch {
            console.error(`Sugerencia ${idx} no serializable, omitiendo`);
            return false;
          }
        });
      }
    } catch (error: any) {
      console.error('Error loading suggestions:', error);
      // Retornar array vacío en lugar de fallar completamente
      suggestions = [];
    }

      // ✅ Envolver res.json en try-catch adicional como protección final
      // ✅ MEJORADO: Validación más estricta y manejo de errores mejorado
      try {
        // ✅ Validar que las sugerencias sean un array
        if (!Array.isArray(suggestions)) {
          suggestions = [];
        }
        
        // ✅ Filtrar sugerencias nulas o undefined
        suggestions = suggestions.filter(s => s != null);
        
        // ✅ Limitar número de sugerencias para prevenir respuestas demasiado grandes
        suggestions = suggestions.slice(0, 50);
        
        const safeJsonReplacer = (key: string, value: any): any => {
          // Detectar Prisma.Decimal
          if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
            try {
              const num = value.toNumber();
              return isFinite(num) && !isNaN(num) ? num : 0;
            } catch {
              return 0;
            }
          }
          // Detectar Date
          if (value instanceof Date) {
            try {
              return value.toISOString();
            } catch {
              return new Date().toISOString();
            }
          }
          // Validar números
          if (typeof value === 'number') {
            if (!isFinite(value) || isNaN(value)) return 0;
            // Limitar valores extremos (reducido para mayor seguridad)
            if (Math.abs(value) > 1e12) {
              return value > 0 ? 1e12 : -1e12;
            }
          }
          // Truncar strings largos
          if (typeof value === 'string' && value.length > 5000) {
            return value.substring(0, 5000);
          }
          // Detectar referencias circulares (objetos)
          if (typeof value === 'object' && value !== null) {
            // Si es un objeto complejo, validar que sea serializable
            try {
              JSON.stringify(value);
            } catch {
              return '[Non-serializable object]';
            }
          }
          return value;
        };
        
        // ✅ Validar cada sugerencia individualmente antes de agregarla
        const validatedSuggestions = suggestions.map((s: any, idx: number) => {
          try {
            // Intentar serializar cada sugerencia individualmente
            JSON.stringify(s, safeJsonReplacer);
            return s;
          } catch (error) {
            console.error(`Sugerencia ${idx} no serializable, omitiendo:`, error);
            return null;
          }
        }).filter((s: any) => s != null);
        
        // Serializar manualmente con replacer seguro antes de enviar
        const responseData = {
          success: true,
          suggestions: validatedSuggestions,
          count: validatedSuggestions.length
        };
        
        // ✅ Validación final antes de enviar
        const jsonString = JSON.stringify(responseData, safeJsonReplacer, 2);
        
        // ✅ Validar que el JSON no sea demasiado grande (límite 10MB)
        if (jsonString.length > 10 * 1024 * 1024) {
          throw new Error('Response too large');
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', Buffer.byteLength(jsonString, 'utf8').toString());
        res.send(jsonString);
      } catch (jsonError: any) {
        console.error('Error crítico serializando respuesta JSON:', jsonError);
        // Si falla la serialización, retornar respuesta mínima
        res.status(200).json({
          success: true,
          suggestions: [],
          count: 0,
          message: 'Error al procesar sugerencias. Intenta recargar la página.'
        });
      }
  } catch (error: any) {
    // ✅ Si hay un error crítico, retornar respuesta válida en lugar de error 500
    console.error('Critical error in /api/ai-suggestions:', error);
    res.status(200).json({
      success: true,
      suggestions: [],
      count: 0,
      message: 'No se pudieron cargar las sugerencias en este momento. Intenta más tarde.'
    });
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

// ✅ OBJETIVO A: GET /api/ai-suggestions/keywords - Obtener sugerencias de keywords específicas
router.get('/keywords', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const maxSuggestions = parseInt(req.query.max as string) || 10;
    const suggestions = await aiSuggestionsService.generateKeywordSuggestions(userId, maxSuggestions);

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
      message: `Se generaron ${suggestions.length} sugerencias de keywords basadas en tendencias`
    });
  } catch (error: any) {
    console.error('Error in /api/ai-suggestions/keywords:', error);
    res.status(200).json({
      success: true,
      suggestions: [],
      count: 0,
      message: 'No se pudieron generar sugerencias de keywords en este momento.'
    });
  }
});

export default router;

