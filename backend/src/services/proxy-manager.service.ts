import axios, { AxiosProxyConfig } from 'axios';
import { logger } from '../config/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Proxy types
 */
export enum ProxyType {
  RESIDENTIAL = 'residential',
  DATACENTER = 'datacenter',
  MOBILE = 'mobile',
  ROTATING = 'rotating',
}

/**
 * Proxy status
 */
export enum ProxyStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
  SLOW = 'slow',
  FAILED = 'failed',
  TESTING = 'testing',
}

/**
 * Proxy information
 */
export interface ProxyInfo {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks4' | 'socks5';
  type: ProxyType;
  status: ProxyStatus;
  successCount: number;
  failureCount: number;
  lastUsed?: Date;
  responseTime: number;
  country?: string;
  city?: string;
  isp?: string;
  createdAt: Date;
}

/**
 * Proxy pool configuration
 */
export interface ProxyPoolConfig {
  maxProxies: number;
  minSuccessRate: number;
  maxResponseTime: number;
  rotationInterval: number; // seconds
  healthCheckInterval: number; // seconds
  testUrls: string[];
  maxFailures: number;
  blockDuration: number; // seconds
}

/**
 * Proxy test result
 */
export interface ProxyTestResult {
  success: boolean;
  responseTime: number;
  error?: string;
  ip?: string;
  location?: string;
}

/**
 * Proxy statistics
 */
export interface ProxyStats {
  totalProxies: number;
  activeProxies: number;
  blockedProxies: number;
  slowProxies: number;
  typeDistribution: Record<ProxyType, number>;
  topProxies: Array<{
    host: string;
    port: number;
    successRate: number;
    responseTime: number;
  }>;
  healthCheckRunning: boolean;
  lastHealthCheck?: Date;
}

/**
 * Advanced Proxy Manager
 * 
 * Sistema inteligente de gestión de proxies con las siguientes características:
 * - Rotación automática de proxies
 * - Health checks periódicos
 * - Detección y bloqueo temporal de proxies fallidos
 * - Balanceo de carga inteligente
 * - Métricas de rendimiento
 * - Selección automática del mejor proxy
 */
export class AdvancedProxyManager {
  private proxies: Map<string, ProxyInfo> = new Map();
  private currentIndex = 0;
  private blockedProxies: Set<string> = new Set();
  private healthCheckRunning = false;
  private lastHealthCheck?: Date;
  private rotationTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private statsFile: string;

  private config: ProxyPoolConfig = {
    maxProxies: 50,
    minSuccessRate: 0.7,
    maxResponseTime: 10000, // 10 seconds
    rotationInterval: 300, // 5 minutes
    healthCheckInterval: 600, // 10 minutes
    testUrls: [
      'http://httpbin.org/ip',
      'https://api.ipify.org?format=json',
      'http://ip-api.com/json',
    ],
    maxFailures: 5,
    blockDuration: 1800, // 30 minutes
  };

  constructor(config?: Partial<ProxyPoolConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.statsFile = path.join(__dirname, '../../data/proxy-stats.json');
    this.loadProxiesFromConfig();
    this.loadStats();
    this.startAutomatedTasks();

    logger.info('Advanced Proxy Manager initialized');
  }

  /**
   * Load proxies from environment or configuration
   */
  private loadProxiesFromConfig(): void {
    try {
      const proxyListEnv = process.env.PROXY_LIST;

      if (proxyListEnv) {
        const proxyList = JSON.parse(proxyListEnv);

        if (Array.isArray(proxyList)) {
          for (const proxyData of proxyList) {
            this.addProxyFromObject(proxyData);
          }
        }
      }

      // Also load from ScraperAPI if key is available
      if (process.env.SCRAPERAPI_KEY) {
        this.addProxyFromObject({
          host: 'proxy-server.scraperapi.com',
          port: 8001,
          username: 'scraperapi',
          password: process.env.SCRAPERAPI_KEY,
          type: ProxyType.ROTATING,
        });
      }

      logger.info(`Loaded ${this.proxies.size} proxies from configuration`);
    } catch (error) {
      logger.error('Error loading proxies from configuration:', error);
    }
  }

  /**
   * Add proxy from object
   */
  private addProxyFromObject(data: any): void {
    try {
      const key = `${data.host}:${data.port}`;

      if (this.proxies.has(key)) {
        logger.debug(`Proxy ${key} already exists`);
        return;
      }

      const proxy: ProxyInfo = {
        host: data.host,
        port: Number(data.port),
        username: data.username,
        password: data.password,
        protocol: data.protocol || 'http',
        type: data.type ? ProxyType[data.type.toUpperCase() as keyof typeof ProxyType] : ProxyType.DATACENTER,
        status: ProxyStatus.ACTIVE,
        successCount: data.successCount || 0,
        failureCount: data.failureCount || 0,
        responseTime: data.responseTime || 0,
        country: data.country,
        city: data.city,
        isp: data.isp,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      };

      this.proxies.set(key, proxy);
      logger.debug(`Added proxy: ${key}`);
    } catch (error) {
      logger.error('Error adding proxy from object:', error);
    }
  }

  /**
   * Add a new proxy to the pool
   */
  addProxy(
    host: string,
    port: number,
    options?: {
      username?: string;
      password?: string;
      protocol?: 'http' | 'https' | 'socks4' | 'socks5';
      type?: ProxyType;
      country?: string;
    }
  ): boolean {
    const key = `${host}:${port}`;

    if (this.proxies.has(key)) {
      logger.warn(`Proxy ${key} already exists`);
      return false;
    }

    if (this.proxies.size >= this.config.maxProxies) {
      logger.warn(`Proxy pool is full (max: ${this.config.maxProxies})`);
      return false;
    }

    const proxy: ProxyInfo = {
      host,
      port,
      username: options?.username,
      password: options?.password,
      protocol: options?.protocol || 'http',
      type: options?.type || ProxyType.DATACENTER,
      status: ProxyStatus.ACTIVE,
      successCount: 0,
      failureCount: 0,
      responseTime: 0,
      country: options?.country,
      createdAt: new Date(),
    };

    this.proxies.set(key, proxy);
    logger.info(`Added proxy: ${key}`);

    return true;
  }

  /**
   * Remove a proxy from the pool
   */
  removeProxy(host: string, port: number): boolean {
    const key = `${host}:${port}`;
    const removed = this.proxies.delete(key);

    if (removed) {
      this.blockedProxies.delete(key);
      logger.info(`Removed proxy: ${key}`);
    }

    return removed;
  }

  /**
   * Get the best available proxy based on success rate and response time
   */
  getBestProxy(): ProxyInfo | null {
    const healthyProxies = this.getHealthyProxies();

    if (healthyProxies.length === 0) {
      logger.warn('No healthy proxies available');
      return null;
    }

    // Score = successRate * (1 / responseTime)
    // Higher score = better proxy
    const scoredProxies = healthyProxies.map((proxy) => {
      const successRate = this.calculateSuccessRate(proxy);
      const score =
        proxy.responseTime > 0
          ? successRate * (1000 / proxy.responseTime)
          : successRate;

      return { proxy, score };
    });

    scoredProxies.sort((a, b) => b.score - a.score);

    const bestProxy = scoredProxies[0].proxy;
    bestProxy.lastUsed = new Date();

    logger.debug(`Selected best proxy: ${bestProxy.host}:${bestProxy.port} (score: ${scoredProxies[0].score.toFixed(2)})`);

    return bestProxy;
  }

  /**
   * Get next proxy in round-robin rotation
   */
  getNextProxy(): ProxyInfo | null {
    const activeProxies = Array.from(this.proxies.values()).filter(
      (p) => p.status === ProxyStatus.ACTIVE
    );

    if (activeProxies.length === 0) {
      logger.warn('No active proxies available');
      return null;
    }

    const proxy = activeProxies[this.currentIndex % activeProxies.length];
    this.currentIndex++;

    proxy.lastUsed = new Date();

    logger.debug(`Rotated to proxy: ${proxy.host}:${proxy.port}`);

    return proxy;
  }

  /**
   * Get proxy by type
   */
  getProxyByType(type: ProxyType): ProxyInfo | null {
    const typeProxies = Array.from(this.proxies.values()).filter(
      (p) => p.type === type && this.isHealthy(p)
    );

    if (typeProxies.length === 0) {
      return null;
    }

    // Return random proxy of this type
    const randomProxy =
      typeProxies[Math.floor(Math.random() * typeProxies.length)];
    randomProxy.lastUsed = new Date();

    return randomProxy;
  }

  /**
   * Test a specific proxy
   */
  async testProxy(proxy: ProxyInfo): Promise<ProxyTestResult> {
    const startTime = Date.now();

    try {
      const proxyConfig: AxiosProxyConfig = {
        host: proxy.host,
        port: proxy.port,
        protocol: proxy.protocol,
      };

      if (proxy.username && proxy.password) {
        proxyConfig.auth = {
          username: proxy.username,
          password: proxy.password,
        };
      }

      // Try multiple test URLs
      for (const testUrl of this.config.testUrls) {
        try {
          const response = await axios.get(testUrl, {
            proxy: proxyConfig,
            timeout: 10000,
            validateStatus: (status) => status === 200,
          });

          const responseTime = Date.now() - startTime;

          // Update proxy metrics
          proxy.responseTime = responseTime;
          proxy.successCount++;
          proxy.status = ProxyStatus.ACTIVE;

          // Extract IP info if available
          let ip: string | undefined;
          let location: string | undefined;

          if (response.data) {
            if (typeof response.data === 'object') {
              ip = response.data.ip || response.data.origin;
              location = response.data.country || response.data.country_name;
            }
          }

          logger.debug(
            `Proxy test successful: ${proxy.host}:${proxy.port} (${responseTime}ms)`
          );

          return {
            success: true,
            responseTime,
            ip,
            location,
          };
        } catch (error) {
          logger.debug(`Test failed for ${testUrl} with proxy ${proxy.host}:${proxy.port}`);
          continue;
        }
      }

      // All test URLs failed
      proxy.failureCount++;
      this.handleProxyFailure(proxy, 'All test URLs failed');

      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: 'All test URLs failed',
      };
    } catch (error) {
      proxy.failureCount++;
      this.handleProxyFailure(proxy, (error as Error).message);

      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Run health check on all proxies
   */
  async healthCheckAll(): Promise<void> {
    if (this.healthCheckRunning) {
      logger.debug('Health check already running, skipping');
      return;
    }

    this.healthCheckRunning = true;
    logger.info('Starting proxy health check...');

    try {
      const testPromises = Array.from(this.proxies.values())
        .filter((p) => p.status !== ProxyStatus.BLOCKED)
        .map((proxy) => this.testProxy(proxy));

      const results = await Promise.allSettled(testPromises);

      const successful = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success
      ).length;
      const failed = results.length - successful;

      logger.info(
        `Health check completed: ${successful} successful, ${failed} failed out of ${results.length} proxies`
      );

      this.lastHealthCheck = new Date();
      this.saveStats();
    } catch (error) {
      logger.error('Error during health check:', error);
    } finally {
      this.healthCheckRunning = false;
    }
  }

  /**
   * Mark proxy as successful
   */
  markSuccess(proxy: ProxyInfo): void {
    proxy.successCount++;
    proxy.status = ProxyStatus.ACTIVE;

    const key = `${proxy.host}:${proxy.port}`;
    if (this.blockedProxies.has(key)) {
      this.blockedProxies.delete(key);
      logger.info(`Unblocked proxy: ${key}`);
    }
  }

  /**
   * Mark proxy as failed
   */
  markFailure(proxy: ProxyInfo, reason?: string): void {
    proxy.failureCount++;
    this.handleProxyFailure(proxy, reason || 'Request failed');
  }

  /**
   * Handle proxy failure
   */
  private handleProxyFailure(proxy: ProxyInfo, reason: string): void {
    logger.warn(
      `Proxy failure: ${proxy.host}:${proxy.port} - ${reason} (${proxy.failureCount} failures)`
    );

    if (proxy.failureCount >= this.config.maxFailures) {
      proxy.status = ProxyStatus.BLOCKED;
      const key = `${proxy.host}:${proxy.port}`;
      this.blockedProxies.add(key);

      logger.warn(`Blocked proxy: ${key} (too many failures)`);

      // Schedule unblock
      setTimeout(() => {
        if (this.blockedProxies.has(key)) {
          this.blockedProxies.delete(key);
          proxy.status = ProxyStatus.ACTIVE;
          proxy.failureCount = 0;
          logger.info(`Unblocked proxy: ${key} (block duration expired)`);
        }
      }, this.config.blockDuration * 1000);
    }
  }

  /**
   * Get healthy proxies
   */
  private getHealthyProxies(): ProxyInfo[] {
    return Array.from(this.proxies.values()).filter((proxy) =>
      this.isHealthy(proxy)
    );
  }

  /**
   * Check if proxy is healthy
   */
  private isHealthy(proxy: ProxyInfo): boolean {
    const successRate = this.calculateSuccessRate(proxy);

    return (
      proxy.status === ProxyStatus.ACTIVE &&
      successRate >= this.config.minSuccessRate &&
      (proxy.responseTime === 0 ||
        proxy.responseTime <= this.config.maxResponseTime)
    );
  }

  /**
   * Calculate success rate
   */
  private calculateSuccessRate(proxy: ProxyInfo): number {
    const total = proxy.successCount + proxy.failureCount;
    return total > 0 ? proxy.successCount / total : 0;
  }

  /**
   * Get proxy statistics
   */
  getStats(): ProxyStats {
    const proxiesArray = Array.from(this.proxies.values());

    const typeDistribution: Record<ProxyType, number> = {
      [ProxyType.RESIDENTIAL]: 0,
      [ProxyType.DATACENTER]: 0,
      [ProxyType.MOBILE]: 0,
      [ProxyType.ROTATING]: 0,
    };

    for (const proxy of proxiesArray) {
      typeDistribution[proxy.type]++;
    }

    const topProxies = proxiesArray
      .filter((p) => this.isHealthy(p))
      .sort((a, b) => {
        const scoreA = this.calculateSuccessRate(a) * (1000 / (a.responseTime || 1));
        const scoreB = this.calculateSuccessRate(b) * (1000 / (b.responseTime || 1));
        return scoreB - scoreA;
      })
      .slice(0, 5)
      .map((p) => ({
        host: p.host,
        port: p.port,
        successRate: this.calculateSuccessRate(p),
        responseTime: p.responseTime,
      }));

    return {
      totalProxies: this.proxies.size,
      activeProxies: proxiesArray.filter((p) => p.status === ProxyStatus.ACTIVE)
        .length,
      blockedProxies: proxiesArray.filter(
        (p) => p.status === ProxyStatus.BLOCKED
      ).length,
      slowProxies: proxiesArray.filter((p) => p.status === ProxyStatus.SLOW)
        .length,
      typeDistribution,
      topProxies,
      healthCheckRunning: this.healthCheckRunning,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  /**
   * Save stats to file
   */
  private saveStats(): void {
    try {
      const stats = this.getStats();
      const dir = path.dirname(this.statsFile);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        stats,
        proxies: Array.from(this.proxies.values()),
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(this.statsFile, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug('Proxy stats saved successfully');
    } catch (error) {
      logger.error('Error saving proxy stats:', error);
    }
  }

  /**
   * Load stats from file
   */
  private loadStats(): void {
    try {
      if (fs.existsSync(this.statsFile)) {
        const data = JSON.parse(fs.readFileSync(this.statsFile, 'utf-8'));

        if (data.proxies && Array.isArray(data.proxies)) {
          for (const proxyData of data.proxies) {
            this.addProxyFromObject(proxyData);
          }
        }

        logger.info('Loaded proxy stats from file');
      }
    } catch (error) {
      logger.error('Error loading proxy stats:', error);
    }
  }

  /**
   * Start automated tasks (rotation, health checks)
   */
  private startAutomatedTasks(): void {
    // Periodic health checks
    this.healthCheckTimer = setInterval(() => {
      this.healthCheckAll().catch((error) => {
        logger.error('Error in automated health check:', error);
      });
    }, this.config.healthCheckInterval * 1000);

    // Save stats periodically
    setInterval(() => {
      this.saveStats();
    }, 60000); // Every minute

    logger.info('Automated proxy management tasks started');
  }

  /**
   * Stop automated tasks
   */
  stopAutomatedTasks(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    logger.info('Automated proxy management tasks stopped');
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.stopAutomatedTasks();
    this.saveStats();
    logger.info('Advanced Proxy Manager cleaned up');
  }
}

// Singleton instance
export const proxyManager = new AdvancedProxyManager();
