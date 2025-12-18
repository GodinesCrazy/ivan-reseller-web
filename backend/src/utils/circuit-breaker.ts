/**
 * ✅ PRODUCTION READY: Circuit Breaker Pattern
 * 
 * Implementa circuit breaker para prevenir cascading failures
 * cuando servicios externos fallan repetidamente
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Funcionando normalmente
  OPEN = 'OPEN', // Bloqueado, no permite requests
  HALF_OPEN = 'HALF_OPEN', // Probando si el servicio se recuperó
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Número de fallos antes de abrir
  successThreshold: number; // Número de éxitos para cerrar desde half-open
  timeout: number; // Tiempo en ms antes de intentar half-open
  resetTimeout: number; // Tiempo en ms antes de resetear contador de fallos
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastResetTime: number = Date.now();

  constructor(
    private name: string,
    private options: CircuitBreakerOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minuto
      resetTimeout: 300000, // 5 minutos
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Verificar si debemos resetear el contador de fallos
    const now = Date.now();
    if (now - this.lastResetTime > this.options.resetTimeout) {
      this.failureCount = 0;
      this.lastResetTime = now;
    }

    // Circuito abierto - rechazar inmediatamente
    if (this.state === CircuitState.OPEN) {
      const timeSinceFailure = now - this.lastFailureTime;
      if (timeSinceFailure > this.options.timeout) {
        // Intentar half-open
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(
          `Circuit breaker "${this.name}" is OPEN. Service unavailable.`
        );
      }
    }

    try {
      const result = await fn();
      
      // Si estamos en half-open, contar éxitos
      if (this.state === CircuitState.HALF_OPEN) {
        this.successCount++;
        if (this.successCount >= this.options.successThreshold) {
          // Cerrar el circuito - servicio recuperado
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
          this.successCount = 0;
        }
      } else {
        // Circuito cerrado - resetear contador de fallos en éxito
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      // Incrementar contador de fallos
      this.failureCount++;
      this.lastFailureTime = now;

      // Si excede el threshold, abrir el circuito
      // ✅ FIX: Verificar explícitamente los estados válidos para transición
      if (
        this.failureCount >= this.options.failureThreshold &&
        (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN)
      ) {
        this.state = CircuitState.OPEN;
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.lastResetTime = Date.now();
  }
}

// Circuit breakers globales por servicio
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name));
  }
  return circuitBreakers.get(name)!;
}

