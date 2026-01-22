/**
 * ? P0: SAFE_BOOT Guard - Hard isolation for production safe mode
 * 
 * When SAFE_BOOT=true, the system must:
 * - Listen immediately
 * - Respond 200 to /health, /ready, /api/debug/ping, /api/debug/build-info
 * - NOT connect DB, Redis, BullMQ, workers, schedulers, autopilot, FXService, monitors, chromium
 * - NO background processes
 * - Container must remain stable (no stop/restart)
 */

import { env } from '../config/env';

/**
 * Check if full system should run (SAFE_BOOT=false)
 * @returns true if full system should initialize, false if SAFE_BOOT mode
 */
export function shouldRunFullSystem(): boolean {
  const safeBoot = env.SAFE_BOOT ?? (process.env.NODE_ENV === 'production');
  return !safeBoot;
}

/**
 * Log that a module is being skipped due to SAFE_BOOT
 */
export function logSafeBootSkip(moduleName: string): void {
  console.log(`???  SAFE_BOOT: skipping ${moduleName}`);
}
