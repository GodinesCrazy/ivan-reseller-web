/**
 * Safe async route wrapper - logs unhandled errors with route, stack, and service name.
 * Use to wrap async route handlers so uncaught rejections are logged before passing to error handler.
 */
import { Request, Response, NextFunction } from 'express';

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

export function wrapAsync(
  fn: AsyncRouteHandler,
  options?: { route?: string; serviceName?: string }
): (req: Request, res: Response, next: NextFunction) => void {
  const route = options?.route ?? 'unknown';
  const serviceName = options?.serviceName ?? 'unknown';

  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      console.error('[ROUTE_ERROR] Unhandled async error', {
        route,
        serviceName,
        path: req.path,
        method: req.method,
        correlationId: (req as any).correlationId,
        message: err?.message ?? String(err),
        stack: err?.stack ?? 'No stack trace',
      });
      next(err);
    });
  };
}
