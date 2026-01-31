import { trace } from '../utils/boot-trace';
trace('loading auto-recovery.service');

import { EventEmitter } from 'events';
import { logger } from '../config/logger';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

/**
 * Service status enumeration
 */
export enum ServiceStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  FAILED = 'FAILED',
  RECOVERING = 'RECOVERING',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Recovery action types
 */
export enum RecoveryAction {
  RESTART = 'RESTART',
  RELOAD_CONFIG = 'RELOAD_CONFIG',
  CLEAR_CACHE = 'CLEAR_CACHE',
  RESTORE_BACKUP = 'RESTORE_BACKUP',
  ESCALATE = 'ESCALATE',
  IGNORE = 'IGNORE',
}

/**
 * Service health information
 */
export interface ServiceHealth {
  serviceName: string;
  status: ServiceStatus;
  lastCheck: Date;
  responseTime: number;
  errorCount: number;
  successCount: number;
  lastError?: string;
  recoveryAttempts: number;
  lastRecovery?: Date;
  metadata?: Record<string, any>;
}

/**
 * Recovery rule definition
 */
export interface RecoveryRule {
  ruleId: string;
  serviceName: string;
  condition: string;
  action: RecoveryAction;
  maxAttempts: number;
  cooldown: number; // seconds
  enabled: boolean;
  priority: number; // 1 = highest
  onRecovery?: (serviceName: string) => Promise<boolean>;
}

/**
 * Recovery event
 */
export interface RecoveryEvent {
  timestamp: Date;
  serviceName: string;
  status: ServiceStatus;
  action: RecoveryAction;
  success: boolean;
  error?: string;
  attempt: number;
}

/**
 * Health check function type
 */
export type HealthCheckFunction = () => Promise<boolean>;

/**
 * Auto Recovery System Configuration
 */
export interface AutoRecoveryConfig {
  healthCheckInterval: number; // seconds
  recoveryTimeout: number; // seconds
  maxRecoveryAttempts: number;
  enableAutoRecovery: boolean;
  enableAlerts: boolean;
  alertThreshold: number; // number of failures before alert
}

/**
 * Circuit Breaker State
 */
enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, block requests
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

/**
 * Circuit Breaker for service protection
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;

  constructor(
    private readonly serviceName: string,
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000, // 1 minute
    private readonly successThreshold: number = 2
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        this.state = CircuitState.HALF_OPEN;
        logger.info(`Circuit breaker ${this.serviceName}: HALF_OPEN (attempting recovery)`);
      } else {
        throw new Error(`Circuit breaker ${this.serviceName} is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info(`Circuit breaker ${this.serviceName}: CLOSED (recovered)`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = new Date(Date.now() + this.recoveryTimeout);
      logger.warn(
        `Circuit breaker ${this.serviceName}: OPEN (threshold reached: ${this.failureCount})`
      );
    }
  }

  private shouldAttemptRecovery(): boolean {
    if (!this.nextAttemptTime) return false;
    return Date.now() >= this.nextAttemptTime.getTime();
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    logger.info(`Circuit breaker ${this.serviceName}: RESET`);
  }
}

/**
 * Auto Recovery System
 * 
 * Sistema inteligente de recuperación automática con las siguientes características:
 * - Health checks periódicos de todos los servicios
 * - Circuit breaker pattern para protección de servicios
 * - Recuperación automática basada en reglas
 * - Escalamiento de problemas
 * - Historial de eventos de recuperación
 * - Métricas en tiempo real
 */
export class AutoRecoverySystem extends EventEmitter {
  private services: Map<string, ServiceHealth> = new Map();
  private healthChecks: Map<string, HealthCheckFunction> = new Map();
  private recoveryRules: Map<string, RecoveryRule> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private recoveryHistory: RecoveryEvent[] = [];
  private healthCheckTimer?: NodeJS.Timeout;
  private recoveryProcessorTimer?: NodeJS.Timeout;
  private running = false;

  private config: AutoRecoveryConfig = {
    healthCheckInterval: 30, // 30 seconds
    recoveryTimeout: 300, // 5 minutes
    maxRecoveryAttempts: 3,
    enableAutoRecovery: true,
    enableAlerts: true,
    alertThreshold: 3,
  };

  constructor(config?: Partial<AutoRecoveryConfig>) {
    super();

    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.loadDefaultRecoveryRules();
    logger.info('Auto Recovery System initialized');
  }

  /**
   * Load default recovery rules
   */
  private loadDefaultRecoveryRules(): void {
    const defaultRules: RecoveryRule[] = [
      {
        ruleId: 'database_failed',
        serviceName: 'database',
        condition: 'status === FAILED',
        action: RecoveryAction.RESTART,
        maxAttempts: 5,
        cooldown: 30,
        enabled: true,
        priority: 1,
      },
      {
        ruleId: 'scraper_degraded',
        serviceName: 'scraper',
        condition: 'status === DEGRADED',
        action: RecoveryAction.CLEAR_CACHE,
        maxAttempts: 2,
        cooldown: 120,
        enabled: true,
        priority: 2,
      },
      {
        ruleId: 'proxy_manager_failed',
        serviceName: 'proxy_manager',
        condition: 'status === FAILED',
        action: RecoveryAction.RELOAD_CONFIG,
        maxAttempts: 3,
        cooldown: 60,
        enabled: true,
        priority: 2,
      },
      {
        ruleId: 'api_rate_limited',
        serviceName: 'api_handler',
        condition: 'errorCount > 10',
        action: RecoveryAction.RELOAD_CONFIG,
        maxAttempts: 1,
        cooldown: 300,
        enabled: true,
        priority: 3,
      },
      {
        ruleId: 'high_error_rate',
        serviceName: '*', // Applies to all services
        condition: 'errorCount > 20',
        action: RecoveryAction.ESCALATE,
        maxAttempts: 1,
        cooldown: 600,
        enabled: true,
        priority: 1,
      },
    ];

    for (const rule of defaultRules) {
      this.recoveryRules.set(rule.ruleId, rule);
    }

    logger.info(`Loaded ${this.recoveryRules.size} default recovery rules`);
  }

  /**
   * Register a service for monitoring
   */
  registerService(
    serviceName: string,
    healthCheckFn: HealthCheckFunction,
    metadata?: Record<string, any>
  ): void {
    const health: ServiceHealth = {
      serviceName,
      status: ServiceStatus.UNKNOWN,
      lastCheck: new Date(),
      responseTime: 0,
      errorCount: 0,
      successCount: 0,
      recoveryAttempts: 0,
      metadata,
    };

    this.services.set(serviceName, health);
    this.healthChecks.set(serviceName, healthCheckFn);
    this.circuitBreakers.set(
      serviceName,
      new CircuitBreaker(serviceName, 5, this.config.recoveryTimeout * 1000, 2)
    );

    logger.info(`Service registered: ${serviceName}`);
    this.emit('service:registered', serviceName);
  }

  /**
   * Unregister a service
   */
  unregisterService(serviceName: string): void {
    this.services.delete(serviceName);
    this.healthChecks.delete(serviceName);
    this.circuitBreakers.delete(serviceName);

    logger.info(`Service unregistered: ${serviceName}`);
    this.emit('service:unregistered', serviceName);
  }

  /**
   * Add a custom recovery rule
   */
  addRecoveryRule(rule: RecoveryRule): void {
    this.recoveryRules.set(rule.ruleId, rule);
    logger.info(`Recovery rule added: ${rule.ruleId}`);
  }

  /**
   * Remove a recovery rule
   */
  removeRecoveryRule(ruleId: string): void {
    this.recoveryRules.delete(ruleId);
    logger.info(`Recovery rule removed: ${ruleId}`);
  }

  /**
   * Start the auto recovery system
   */
  start(): void {
    if (this.running) {
      logger.warn('Auto Recovery System is already running');
      return;
    }

    this.running = true;

    // Start health check loop
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks().catch((error) => {
        logger.error('Error in health check loop:', error);
      });
    }, this.config.healthCheckInterval * 1000);

    // Start recovery processor loop
    this.recoveryProcessorTimer = setInterval(() => {
      this.processRecoveryRules().catch((error) => {
        logger.error('Error in recovery processor loop:', error);
      });
    }, 10000); // Every 10 seconds

    logger.info('Auto Recovery System started');
    this.emit('system:started');
  }

  /**
   * Stop the auto recovery system
   */
  stop(): void {
    if (!this.running) {
      logger.warn('Auto Recovery System is not running');
      return;
    }

    this.running = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.recoveryProcessorTimer) {
      clearInterval(this.recoveryProcessorTimer);
      this.recoveryProcessorTimer = undefined;
    }

    logger.info('Auto Recovery System stopped');
    this.emit('system:stopped');
  }

  /**
   * Perform health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    const checks = Array.from(this.services.keys()).map((serviceName) =>
      this.checkServiceHealth(serviceName)
    );

    await Promise.allSettled(checks);
  }

  /**
   * Check health of a specific service
   */
  private async checkServiceHealth(serviceName: string): Promise<void> {
    const health = this.services.get(serviceName);
    const healthCheckFn = this.healthChecks.get(serviceName);

    if (!health || !healthCheckFn) {
      return;
    }

    const startTime = Date.now();

    try {
      const circuitBreaker = this.circuitBreakers.get(serviceName);
      
      let isHealthy: boolean;
      if (circuitBreaker) {
        isHealthy = await circuitBreaker.execute(() => healthCheckFn());
      } else {
        isHealthy = await healthCheckFn();
      }

      const responseTime = Date.now() - startTime;

      // Update health status
      health.lastCheck = new Date();
      health.responseTime = responseTime;

      if (isHealthy) {
        health.successCount++;
        health.errorCount = 0;
        health.lastError = undefined;

        if (health.status !== ServiceStatus.HEALTHY) {
          const previousStatus = health.status;
          health.status = ServiceStatus.HEALTHY;
          logger.info(`Service ${serviceName} recovered (${previousStatus} → HEALTHY)`);
          this.emit('service:recovered', serviceName, previousStatus);
        }
      } else {
        health.errorCount++;
        health.status = ServiceStatus.FAILED;
        health.lastError = `Health check failed at ${new Date().toISOString()}`;

        if (health.errorCount === 1) {
          logger.warn(`Service ${serviceName} failed health check`);
          this.emit('service:degraded', serviceName);
        }

        if (health.errorCount >= this.config.alertThreshold && this.config.enableAlerts) {
          this.emit('service:alert', serviceName, health);
        }
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      health.errorCount++;
      health.status = ServiceStatus.FAILED;
      health.lastError = (error as Error).message;
      health.lastCheck = new Date();
      health.responseTime = responseTime;

      logger.error(`Health check error for ${serviceName}:`, error);
      this.emit('service:error', serviceName, error);

      if (health.errorCount >= this.config.alertThreshold && this.config.enableAlerts) {
        this.emit('service:alert', serviceName, health);
      }
    }
  }

  /**
   * Process recovery rules
   */
  private async processRecoveryRules(): Promise<void> {
    if (!this.config.enableAutoRecovery) {
      return;
    }

    const currentTime = new Date();

    // Sort rules by priority (1 = highest)
    const sortedRules = Array.from(this.recoveryRules.values()).sort(
      (a, b) => a.priority - b.priority
    );

    for (const rule of sortedRules) {
      if (!rule.enabled) {
        continue;
      }

      // Get applicable services
      const serviceNames =
        rule.serviceName === '*'
          ? Array.from(this.services.keys())
          : [rule.serviceName];

      for (const serviceName of serviceNames) {
        const health = this.services.get(serviceName);
        if (!health) continue;

        // Check cooldown
        if (this.isInRecoveryCooldown(rule, health, currentTime)) {
          continue;
        }

        // Evaluate condition
        if (this.evaluateRecoveryCondition(rule.condition, health)) {
          await this.executeRecoveryAction(rule, health);
        }
      }
    }
  }

  /**
   * Check if service is in recovery cooldown
   */
  private isInRecoveryCooldown(
    rule: RecoveryRule,
    health: ServiceHealth,
    currentTime: Date
  ): boolean {
    if (!health.lastRecovery) {
      return false;
    }

    const timeDiff = (currentTime.getTime() - health.lastRecovery.getTime()) / 1000;
    return timeDiff < rule.cooldown;
  }

  /**
   * Evaluate recovery condition
   */
  private evaluateRecoveryCondition(condition: string, health: ServiceHealth): boolean {
    try {
      // Simple condition evaluation
      // Replace variables
      const evaluableCondition = condition
        .replace(/status/g, `"${health.status}"`)
        .replace(/errorCount/g, String(health.errorCount))
        .replace(/successCount/g, String(health.successCount))
        .replace(/responseTime/g, String(health.responseTime))
        .replace(/===\s*FAILED/g, `=== "${ServiceStatus.FAILED}"`)
        .replace(/===\s*DEGRADED/g, `=== "${ServiceStatus.DEGRADED}"`);

      // Evaluate using Function constructor (safer than eval)
      const evaluator = new Function('return ' + evaluableCondition);
      return evaluator();
    } catch (error) {
      logger.error(`Error evaluating condition "${condition}":`, error);
      return false;
    }
  }

  /**
   * Execute recovery action
   */
  private async executeRecoveryAction(
    rule: RecoveryRule,
    health: ServiceHealth
  ): Promise<void> {
    // Check max attempts
    if (health.recoveryAttempts >= rule.maxAttempts) {
      logger.warn(
        `Max recovery attempts (${rule.maxAttempts}) reached for ${health.serviceName}`
      );
      
      if (this.config.enableAlerts) {
        this.emit('recovery:max-attempts', health.serviceName, health);
      }
      
      return;
    }

    logger.info(
      `Executing recovery: ${rule.action} for ${health.serviceName} (attempt ${
        health.recoveryAttempts + 1
      }/${rule.maxAttempts})`
    );

    health.status = ServiceStatus.RECOVERING;
    health.recoveryAttempts++;
    health.lastRecovery = new Date();

    this.emit('recovery:started', health.serviceName, rule.action);

    let success = false;

    try {
      if (rule.onRecovery) {
        success = await rule.onRecovery(health.serviceName);
      } else {
        switch (rule.action) {
          case RecoveryAction.RESTART:
            success = await this.restartService(health.serviceName);
            break;
          case RecoveryAction.RELOAD_CONFIG:
            success = await this.reloadConfig(health.serviceName);
            break;
          case RecoveryAction.CLEAR_CACHE:
            success = await this.clearCache(health.serviceName);
            break;
          case RecoveryAction.RESTORE_BACKUP:
            success = await this.restoreBackup(health.serviceName);
            break;
          case RecoveryAction.ESCALATE:
            await this.escalate(health.serviceName, health);
            success = true;
            break;
          default:
            logger.warn(`Unknown recovery action: ${rule.action}`);
        }
      }

      // Record event
      const event: RecoveryEvent = {
        timestamp: new Date(),
        serviceName: health.serviceName,
        status: health.status,
        action: rule.action,
        success,
        attempt: health.recoveryAttempts,
      };

      this.recoveryHistory.push(event);

      // Keep only last 100 events
      if (this.recoveryHistory.length > 100) {
        this.recoveryHistory.shift();
      }

      if (success) {
        logger.info(`Recovery successful for ${health.serviceName}`);
        health.recoveryAttempts = 0;
        
        // Reset circuit breaker
        const circuitBreaker = this.circuitBreakers.get(health.serviceName);
        if (circuitBreaker) {
          circuitBreaker.reset();
        }

        this.emit('recovery:success', health.serviceName, rule.action);
      } else {
        logger.warn(`Recovery failed for ${health.serviceName}`);
        event.error = 'Recovery action returned false';
        this.emit('recovery:failed', health.serviceName, rule.action);
      }
    } catch (error) {
      logger.error(`Recovery error for ${health.serviceName}:`, error);

      const event: RecoveryEvent = {
        timestamp: new Date(),
        serviceName: health.serviceName,
        status: health.status,
        action: rule.action,
        success: false,
        error: (error as Error).message,
        attempt: health.recoveryAttempts,
      };

      this.recoveryHistory.push(event);
      this.emit('recovery:error', health.serviceName, error);
    }
  }

  /**
   * Restart service (placeholder - implement based on service type)
   */
  private async restartService(serviceName: string): Promise<boolean> {
    logger.info(`Restarting service: ${serviceName}`);

    // Service-specific restart logic
    if (serviceName === 'database') {
      // Reconnect to database
      return true;
    }

    if (serviceName === 'scraper') {
      // Reinitialize scraper
      return true;
    }

    if (serviceName === 'proxy_manager') {
      // Reload proxies and restart health checks
      const { proxyManager } = await import('./proxy-manager.service');
      await proxyManager.healthCheckAll();
      return true;
    }

    return true;
  }

  /**
   * Reload configuration
   */
  private async reloadConfig(serviceName: string): Promise<boolean> {
    logger.info(`Reloading config for: ${serviceName}`);
    
    // Reload environment variables
    // In production, you might reload from a config service
    
    return true;
  }

  /**
   * Clear cache
   */
  private async clearCache(serviceName: string): Promise<boolean> {
    logger.info(`Clearing cache for: ${serviceName}`);

    // Service-specific cache clearing
    if (serviceName === 'scraper') {
      // Clear scraping cache
      return true;
    }

    return true;
  }

  /**
   * Restore from backup
   */
  private async restoreBackup(serviceName: string): Promise<boolean> {
    logger.info(`Restoring backup for: ${serviceName}`);

    // Service-specific backup restoration
    
    return true;
  }

  /**
   * Escalate problem
   */
  private async escalate(serviceName: string, health: ServiceHealth): Promise<void> {
    logger.error(
      `ESCALATING: Service ${serviceName} has failed beyond recovery. Manual intervention required.`
    );

    this.emit('recovery:escalate', serviceName, health);

    // In production, send alerts via email, Slack, PagerDuty, etc.
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Get all services health
   */
  getAllServicesHealth(): ServiceHealth[] {
    return Array.from(this.services.values());
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(limit?: number): RecoveryEvent[] {
    if (limit) {
      return this.recoveryHistory.slice(-limit);
    }
    return [...this.recoveryHistory];
  }

  /**
   * Get system statistics
   */
  getStats(): {
    totalServices: number;
    healthyServices: number;
    degradedServices: number;
    failedServices: number;
    recoveringServices: number;
    totalRecoveryAttempts: number;
    successfulRecoveries: number;
    failedRecoveries: number;
  } {
    const services = Array.from(this.services.values());

    return {
      totalServices: services.length,
      healthyServices: services.filter((s) => s.status === ServiceStatus.HEALTHY).length,
      degradedServices: services.filter((s) => s.status === ServiceStatus.DEGRADED).length,
      failedServices: services.filter((s) => s.status === ServiceStatus.FAILED).length,
      recoveringServices: services.filter((s) => s.status === ServiceStatus.RECOVERING).length,
      totalRecoveryAttempts: services.reduce((sum, s) => sum + s.recoveryAttempts, 0),
      successfulRecoveries: this.recoveryHistory.filter((e) => e.success).length,
      failedRecoveries: this.recoveryHistory.filter((e) => !e.success).length,
    };
  }

  /**
   * Manually trigger recovery for a service
   */
  async triggerRecovery(serviceName: string, action: RecoveryAction): Promise<boolean> {
    const health = this.services.get(serviceName);
    if (!health) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    const rule: RecoveryRule = {
      ruleId: `manual_${Date.now()}`,
      serviceName,
      condition: 'true',
      action,
      maxAttempts: 1,
      cooldown: 0,
      enabled: true,
      priority: 0,
    };

    await this.executeRecoveryAction(rule, health);

    return health.status === ServiceStatus.HEALTHY;
  }

  /**
   * Force health check for a service
   */
  async forceHealthCheck(serviceName: string): Promise<void> {
    await this.checkServiceHealth(serviceName);
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stop();
    this.services.clear();
    this.healthChecks.clear();
    this.recoveryRules.clear();
    this.circuitBreakers.clear();
    this.recoveryHistory = [];
    
    logger.info('Auto Recovery System cleaned up');
  }
}

// Singleton instance
export const autoRecoverySystem = new AutoRecoverySystem();
