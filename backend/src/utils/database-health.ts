/**
 * ✅ PRODUCTION READY: Database Health Utilities
 * 
 * Utilidades para monitoreo y health checks de base de datos
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface DatabaseHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  connectionCount?: number;
  activeQueries?: number;
  error?: string;
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(timeoutMs: number = 2000): Promise<DatabaseHealth> {
  const startTime = Date.now();
  
  try {
    // Timeout wrapper
    const queryPromise = prisma.$queryRaw`SELECT 1 as health`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database health check timeout')), timeoutMs)
    );
    
    await Promise.race([queryPromise, timeoutPromise]);
    
    const latency = Date.now() - startTime;
    
    // Obtener estadísticas de conexión si es posible
    let connectionCount: number | undefined;
    let activeQueries: number | undefined;
    
    try {
      // Intentar obtener estadísticas de conexión (PostgreSQL específico)
      const connectionStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count 
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;
      
      if (connectionStats && connectionStats.length > 0) {
        connectionCount = Number(connectionStats[0].count);
      }
      
      const activeQueriesStats = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count 
        FROM pg_stat_activity 
        WHERE datname = current_database() 
        AND state = 'active'
      `;
      
      if (activeQueriesStats && activeQueriesStats.length > 0) {
        activeQueries = Number(activeQueriesStats[0].count);
      }
    } catch (statsError) {
      // No crítico si no podemos obtener estadísticas
      logger.debug('Could not fetch database statistics', { error: statsError });
    }
    
    // Determinar estado basado en latency
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (latency > 1000) {
      status = 'degraded';
    }
    if (latency > 5000) {
      status = 'unhealthy';
    }
    
    return {
      status,
      latency,
      connectionCount,
      activeQueries,
    };
  } catch (error: any) {
    logger.error('Database health check failed', {
      error: error.message,
      latency: Date.now() - startTime,
    });
    
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Get database connection pool stats
 */
export async function getDatabasePoolStats(): Promise<{
  connections?: number;
  idle?: number;
  active?: number;
}> {
  try {
    // Intentar obtener estadísticas del pool de conexiones
    // Esto depende de la implementación del cliente de Prisma
    const stats = await prisma.$queryRaw<Array<{
      total: bigint;
      idle: bigint;
      active: bigint;
    }>>`
      SELECT 
        count(*) as total,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state = 'active') as active
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    
    if (stats && stats.length > 0) {
      return {
        connections: Number(stats[0].total),
        idle: Number(stats[0].idle),
        active: Number(stats[0].active),
      };
    }
  } catch (error) {
    logger.debug('Could not fetch database pool statistics', { error });
  }
  
  return {};
}

