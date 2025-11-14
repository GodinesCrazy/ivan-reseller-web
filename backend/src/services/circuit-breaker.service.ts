/**
 * Circuit Breaker Service
 * Prevents cascading failures by stopping requests to failing services
 */

import { EventEmitter } from 'events';
import { logger } from '../config/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',      // Normal operation
  OPEN = 'OPEN',          // Failing, reject requests immediately
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before attempting half-open
  resetTimeout: number;          // Time in ms before resetting failure count
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  openedAt?: Date;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private openedAt?: Date;
  private config: CircuitBreakerConfig;

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    super();
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 60000, // 1 minute
      resetTimeout: config.resetTimeout ?? 300000, // 5 minutes
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      const timeSinceOpen = Date.now() - (this.openedAt?.getTime() ?? 0);
      
      // Try to transition to half-open after timeout
      if (timeSinceOpen >= this.config.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        this.emit('half-open', this.name);
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
      } else {
        // Still open, reject immediately
        const remainingTime = Math.ceil((this.config.timeout - timeSinceOpen) / 1000);
        throw new Error(`Circuit breaker ${this.name} is OPEN. Retry in ${remainingTime}s`);
      }
    }

    try {
      // Execute the function
      const result = await fn();
      
      // Success - update state
      this.onSuccess();
      return result;
    } catch (error) {
      // Failure - update state
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccess = new Date();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      // If we have enough successes, close the circuit
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.emit('closed', this.name);
        logger.info(`Circuit breaker ${this.name} CLOSED after recovery`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count after reset timeout
      const timeSinceLastFailure = this.lastFailure 
        ? Date.now() - this.lastFailure.getTime() 
        : Infinity;
      
      if (timeSinceLastFailure >= this.config.resetTimeout) {
        this.failures = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.lastFailure = new Date();
    this.failures++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during half-open, open immediately
      this.state = CircuitState.OPEN;
      this.openedAt = new Date();
      this.successes = 0;
      this.emit('opened', this.name, error);
      logger.warn(`Circuit breaker ${this.name} OPENED during half-open test`);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open
      if (this.failures >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.openedAt = new Date();
        this.emit('opened', this.name, error);
        logger.warn(`Circuit breaker ${this.name} OPENED after ${this.failures} failures`);
      }
    }
  }

  /**
   * Get current stats
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      openedAt: this.openedAt,
    };
  }

  /**
   * Reset circuit breaker manually
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = undefined;
    this.lastSuccess = undefined;
    this.openedAt = undefined;
    this.emit('reset', this.name);
    logger.info(`Circuit breaker ${this.name} manually reset`);
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Check if circuit is closed (healthy)
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }
}

/**
 * Circuit Breaker Manager - Manages multiple circuit breakers
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker for a service
   */
  getBreaker(
    serviceName: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const breaker = new CircuitBreaker(serviceName, config);
      this.breakers.set(serviceName, breaker);
    }
    return this.breakers.get(serviceName)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Reset a specific circuit breaker
   */
  reset(serviceName: string): void {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }
}

export const circuitBreakerManager = new CircuitBreakerManager();

