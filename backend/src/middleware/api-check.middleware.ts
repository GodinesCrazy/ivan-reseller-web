/**
 * Middleware to validate API availability before processing requests
 * Ensures that required APIs are configured before allowing operations
 */

import { Request, Response, NextFunction } from 'express';
import { apiAvailability } from '../services/api-availability.service';
import { AppError } from './error.middleware';

export interface APIRequirement {
  api: 'ebay' | 'amazon' | 'mercadolibre' | 'groq' | 'scraperapi' | 'zenrows' | '2captcha' | 'paypal' | 'aliexpress';
  required: boolean;
  fallback?: string;
}

/**
 * Middleware to check if required APIs are available for the authenticated user
 */
export function requireAPIs(...requirements: APIRequirement[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get userId from authenticated user
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }

      const capabilities = await apiAvailability.getCapabilities(userId);
      const allStatuses = await apiAvailability.getAllAPIStatus(userId);

      const missingRequired: string[] = [];
      const availableFallbacks: string[] = [];

      for (const requirement of requirements) {
        const status = allStatuses.find(s => 
          s.name.toLowerCase().includes(requirement.api.toLowerCase())
        );

        if (!status?.isAvailable) {
          if (requirement.required) {
            missingRequired.push(requirement.api);
          } else if (requirement.fallback) {
            // Check if fallback is available
            const fallbackStatus = allStatuses.find(s => 
              s.name.toLowerCase().includes(requirement.fallback.toLowerCase())
            );
            if (fallbackStatus?.isAvailable) {
              availableFallbacks.push(requirement.fallback);
            } else {
              missingRequired.push(`${requirement.api} (no fallback available)`);
            }
          }
        }
      }

      if (missingRequired.length > 0) {
        throw new AppError(
          `Required APIs not configured: ${missingRequired.join(', ')}. Please configure them in /settings/apis`,
          503
        );
      }

      // Attach capabilities to request for use in routes
      req.apiCapabilities = capabilities;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to check specific marketplace availability for the authenticated user
 */
export function requireMarketplace(marketplace: 'ebay' | 'amazon' | 'mercadolibre') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get userId from authenticated user
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }

      const capabilities = await apiAvailability.getCapabilities(userId);

      let canPublish = false;
      let apiName = '';

      switch (marketplace) {
        case 'ebay':
          canPublish = capabilities.canPublishToEbay;
          apiName = 'eBay Trading API';
          break;
        case 'amazon':
          canPublish = capabilities.canPublishToAmazon;
          apiName = 'Amazon SP-API';
          break;
        case 'mercadolibre':
          canPublish = capabilities.canPublishToMercadoLibre;
          apiName = 'MercadoLibre API';
          break;
      }

      if (!canPublish) {
        throw new AppError(
          `${apiName} is not configured. Please configure it in /settings/apis before publishing to ${marketplace}`,
          503
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to check scraping capability
 */
export function requireScrapingCapability() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }

      const capabilities = await apiAvailability.getCapabilities(userId);

      if (!capabilities.canScrapeAliExpress) {
        throw new AppError(
          'No scraping service configured. Please configure ScraperAPI or ZenRows in /settings/apis',
          503
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to check AI capability
 */
export function requireAICapability() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }

      const capabilities = await apiAvailability.getCapabilities(userId);

      if (!capabilities.canUseAI) {
        throw new AppError(
          'GROQ AI API is not configured. Please configure it in /settings/apis',
          503
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to check payment capability
 */
export function requirePaymentCapability() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('User not authenticated', 401);
      }

      const capabilities = await apiAvailability.getCapabilities(userId);

      if (!capabilities.canPayCommissions) {
        throw new AppError(
          'PayPal Payouts API is not configured. Please configure it in /settings/apis',
          503
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to attach API status to response (for frontend to display)
 */
export async function attachAPIStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    
    if (userId) {
      const statuses = await apiAvailability.getAllAPIStatus(userId);
      const capabilities = await apiAvailability.getCapabilities(userId);

      res.locals.apiStatus = statuses;
      res.locals.apiCapabilities = capabilities;
    }

    next();
  } catch (error) {
    // Don't fail the request if status check fails
    next();
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      apiCapabilities?: {
        canPublishToEbay: boolean;
        canPublishToAmazon: boolean;
        canPublishToMercadoLibre: boolean;
        canScrapeAliExpress: boolean;
        canUseAI: boolean;
        canSolveCaptchas: boolean;
        canPayCommissions: boolean;
        canAutoPurchaseAliExpress: boolean;
      };
    }
  }
}

export default {
  requireAPIs,
  requireMarketplace,
  requireScrapingCapability,
  requireAICapability,
  requirePaymentCapability,
  attachAPIStatus
};
