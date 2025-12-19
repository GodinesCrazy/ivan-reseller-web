/**
 * Version Header Middleware
 * 
 * Adds X-App-Commit header to all responses for deployment verification
 */

import { Request, Response, NextFunction } from 'express';

// Build-time info (set at server startup)
let buildInfo: {
  gitSha: string;
  buildTime: string;
  nodeVersion: string;
} | null = null;

/**
 * Initialize build info (call once at server startup)
 */
export function initBuildInfo(): void {
  // Try to get git SHA from environment (Railway sets RAILWAY_GIT_COMMIT_SHA)
  const gitSha = 
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    'unknown';

  const buildTime = 
    process.env.BUILD_TIME ||
    process.env.RAILWAY_BUILD_TIME ||
    new Date().toISOString();

  buildInfo = {
    gitSha: gitSha.substring(0, 7), // Short SHA (7 chars)
    buildTime,
    nodeVersion: process.version,
  };

  console.log(`BOOT gitSha=${buildInfo.gitSha} buildTime=${buildInfo.buildTime} node=${buildInfo.nodeVersion}`);
}

/**
 * Middleware to add version headers to all responses
 */
export const versionHeaderMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (buildInfo) {
    res.setHeader('X-App-Commit', buildInfo.gitSha);
    res.setHeader('X-App-Build-Time', buildInfo.buildTime);
    res.setHeader('X-App-Node', buildInfo.nodeVersion);
  }
  next();
};

/**
 * Get current build info (for /version endpoint)
 */
export function getBuildInfo() {
  return buildInfo || {
    gitSha: 'unknown',
    buildTime: new Date().toISOString(),
    nodeVersion: process.version,
  };
}
