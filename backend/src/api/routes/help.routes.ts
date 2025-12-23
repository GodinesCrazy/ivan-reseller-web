import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

const router = Router();

/**
 * GET /api/help/investors/:slug
 * Servir documentos de inversionistas (solo admin)
 * Protegido por autenticación y autorización de admin
 */
router.get('/investors/:slug', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    // Validar slug permitido
    const allowedSlugs = ['one-pager', 'investor-brief'];
    if (!allowedSlugs.includes(slug)) {
      throw new AppError('Documento no encontrado', 404);
    }

    // Mapeo de slugs a nombres de archivo
    const fileMap: Record<string, string> = {
      'one-pager': 'ONE_PAGER.md',
      'investor-brief': 'INVESTOR_BRIEF.md',
    };

    const fileName = fileMap[slug];
    const filePath = join(__dirname, '../../../docs/investors', fileName);

    try {
      const content = readFileSync(filePath, 'utf-8');
      res.json({
        success: true,
        slug,
        title: slug === 'one-pager' ? 'Ivan Reseller - One Pager' : 'Ivan Reseller - Investor Brief',
        content,
      });
    } catch (fileError: any) {
      if (fileError.code === 'ENOENT') {
        throw new AppError('Documento no encontrado', 404);
      }
      throw fileError;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/help/investors
 * Listar documentos de inversionistas disponibles (solo admin)
 */
router.get('/investors', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      docs: [
        {
          slug: 'one-pager',
          title: 'Ivan Reseller - One Pager',
          description: 'One pager ejecutivo para inversionistas',
        },
        {
          slug: 'investor-brief',
          title: 'Ivan Reseller - Investor Brief',
          description: 'Brief completo para inversionistas',
        },
      ],
    });
  } catch (error) {
    next(error);
  }
});

export default router;

