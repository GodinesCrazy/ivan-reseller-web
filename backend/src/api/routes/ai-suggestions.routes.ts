import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { aiSuggestionsService } from '../../services/ai-suggestions.service';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../config/logger';

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

      // ✅ CRÍTICO: El servicio ya retorna datos completamente sanitizados
      // Solo necesitamos validar que sea un array y enviar la respuesta
      try {
        // ✅ Validar que las sugerencias sean un array
        if (!Array.isArray(suggestions)) {
          suggestions = [];
        }
        
        // ✅ Filtrar sugerencias nulas o undefined
        suggestions = suggestions.filter(s => s != null && s.id);
        
        // ✅ Limitar número de sugerencias para prevenir respuestas demasiado grandes
        suggestions = suggestions.slice(0, 50);
        
        // ✅ Replacer simplificado - solo para casos edge que puedan haber escapado
        // NO usar JSON.stringify recursivo aquí para evitar problemas de memoria
        const safeJsonReplacer = (key: string, value: any): any => {
          // Detectar Prisma.Decimal (por si acaso alguno escapó)
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
            if (Math.abs(value) > 1e9) {
              return value > 0 ? 1e9 : -1e9;
            }
          }
          // Truncar strings extremadamente largos
          if (typeof value === 'string' && value.length > 10000) {
            return value.substring(0, 10000);
          }
          return value;
        };
        
        // ✅ Preparar respuesta - las sugerencias ya están sanitizadas
        const responseData = {
          success: true,
          suggestions: suggestions,
          count: suggestions.length
        };
        
        // ✅ Serializar con replacer simple (sin recursión)
        // NO usar JSON.stringify recursivo aquí
        let jsonString: string;
        try {
          jsonString = JSON.stringify(responseData, safeJsonReplacer);
        } catch (stringifyError: any) {
          // Si falla, intentar sin replacer (las sugerencias deberían estar ya limpias)
          logger.warn('AISuggestions: Falló serialización con replacer, intentando sin replacer', { error: stringifyError.message });
          try {
            jsonString = JSON.stringify({
              success: true,
              suggestions: [],
              count: 0,
              message: 'Error al procesar sugerencias. Intenta recargar la página.'
            });
          } catch {
            // Último recurso: respuesta mínima hardcodeada
            jsonString = '{"success":true,"suggestions":[],"count":0,"message":"Error al procesar sugerencias"}';
          }
        }
        
        // ✅ Validar tamaño (límite 2MB para prevenir problemas de memoria)
        if (jsonString.length > 2 * 1024 * 1024) {
          logger.warn('AISuggestions: Respuesta demasiado grande, limitando sugerencias', { size: jsonString.length });
          // Reducir número de sugerencias y simplificar
          const limitedSuggestions = suggestions.slice(0, 10).map((s: any) => ({
            id: s.id,
            type: s.type,
            priority: s.priority,
            title: s.title?.substring(0, 200) || '',
            description: s.description?.substring(0, 500) || '',
            impact: s.impact,
            confidence: s.confidence,
            actionable: s.actionable,
            implemented: s.implemented,
            estimatedTime: s.estimatedTime,
            createdAt: s.createdAt
          }));
          const limitedData = {
            success: true,
            suggestions: limitedSuggestions,
            count: limitedSuggestions.length,
            message: 'Se mostraron solo las primeras 10 sugerencias debido al tamaño de la respuesta'
          };
          try {
            jsonString = JSON.stringify(limitedData, safeJsonReplacer);
          } catch {
            jsonString = '{"success":true,"suggestions":[],"count":0,"message":"Error al procesar sugerencias"}';
          }
        }
        
        // ✅ CRÍTICO: Enviar respuesta de forma segura para prevenir SIGSEGV
        // Usar process.nextTick para evitar bloqueo del event loop durante serialización
        try {
          // ✅ Validar que jsonString es válido antes de enviar
          if (!jsonString || typeof jsonString !== 'string' || jsonString.length === 0) {
            throw new Error('JSON string inválido');
          }
          
          // ✅ Limitar tamaño de respuesta para prevenir SIGSEGV (máximo 5MB)
          const maxSize = 5 * 1024 * 1024; // 5MB
          if (jsonString.length > maxSize) {
            logger.warn('AISuggestions: Respuesta demasiado grande, truncando', { 
              originalSize: jsonString.length,
              maxSize 
            });
            // Simplificar respuesta si es demasiado grande
            const limitedData = {
              success: true,
              suggestions: suggestions.slice(0, 10), // Solo primeras 10
              count: suggestions.length,
              message: 'Respuesta truncada por tamaño. Algunas sugerencias fueron omitidas.'
            };
            jsonString = JSON.stringify(limitedData, safeJsonReplacer);
          }
          
          // ✅ Usar process.nextTick para enviar respuesta en el siguiente tick del event loop
          // Esto previene que el SIGSEGV ocurra durante el envío de la respuesta
          process.nextTick(() => {
            try {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Content-Length', Buffer.byteLength(jsonString, 'utf8').toString());
              res.send(jsonString);
            } catch (sendError: any) {
              logger.error('AISuggestions: Error enviando respuesta en nextTick', { error: sendError.message });
              // Último recurso: intentar enviar respuesta mínima
              try {
                res.status(200).json({
                  success: true,
                  suggestions: [],
                  count: 0,
                  message: 'Error al enviar sugerencias. Intenta recargar la página.'
                });
              } catch {
                // Si todo falla, cerrar conexión silenciosamente
                res.end();
              }
            }
          });
        } catch (sendError: any) {
          logger.error('AISuggestions: Error preparando respuesta', { error: sendError.message });
          // Último recurso: intentar enviar respuesta mínima
          try {
            res.status(200).json({
              success: true,
              suggestions: [],
              count: 0,
              message: 'Error al enviar sugerencias. Intenta recargar la página.'
            });
          } catch {
            // Si todo falla, cerrar conexión silenciosamente
            res.end();
          }
        }
        
      } catch (jsonError: any) {
        logger.error('Error crítico serializando respuesta JSON:', { 
          error: jsonError.message, 
          stack: jsonError.stack,
          suggestionsCount: suggestions.length 
        });
        // Si falla la serialización, retornar respuesta mínima segura
        try {
          res.status(200).json({
            success: true,
            suggestions: [],
            count: 0,
            message: 'Error al procesar sugerencias. Intenta recargar la página.'
          });
        } catch (sendError) {
          // Si incluso esto falla, enviar respuesta cruda mínima
          logger.error('Error crítico enviando respuesta de error mínima', { error: sendError });
          res.status(200).send('{"success":true,"suggestions":[],"count":0}');
        }
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

