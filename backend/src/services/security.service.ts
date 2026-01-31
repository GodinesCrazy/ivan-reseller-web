import { trace } from '../utils/boot-trace';
trace('loading security.service');

import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

interface APICredential {
  id: string;
  marketplace: 'ebay' | 'amazon' | 'mercadolibre' | 'alibaba' | 'aliexpress';
  environment: 'sandbox' | 'production';
  credentials: {
    appId?: string;
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    devId?: string;
    certId?: string;
    token?: string;
    apiKey?: string;
    secretKey?: string;
  };
  isActive: boolean;
  createdAt: Date;
  lastUsed?: Date;
  expiresAt?: Date;
  rateLimits?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  usage?: {
    requestsToday: number;
    requestsThisHour: number;
    requestsThisMinute: number;
    lastReset: Date;
  };
}

interface SecurityConfig {
  encryption: {
    algorithm: string;
    keyLength: number;
    ivLength: number;
  };
  storage: {
    credentialsPath: string;
    backupPath: string;
    encryptionKeyPath: string;
  };
  rateLimiting: {
    enableTracking: boolean;
    alertThreshold: number; // % del límite
  };
  audit: {
    logAccess: boolean;
    logPath: string;
  };
}

interface AccessLog {
  timestamp: Date;
  credentialId: string;
  marketplace: string;
  action: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  error?: string;
}

export class SecureCredentialManager {
  private config: SecurityConfig;
  private credentials: Map<string, APICredential> = new Map();
  private encryptionKey: Buffer;
  private accessLogs: AccessLog[] = [];
  private auditTrail: Array<{
    timestamp: string;
    userId: string;
    marketplace: string;
    action: string;
    success: boolean;
    details?: string;
    ip?: string;
  }> = [];

  constructor() {
    this.initializeConfig();
    this.initializeEncryption();
    this.loadCredentials();
    
    // ✅ TEST FIX: No start tracking in test environment
    const usageTrackingEnabled = (process.env.USAGE_TRACKING_ENABLED ?? 'true') === 'true';
    if (usageTrackingEnabled) {
      this.startUsageTracking();
    }
  }

  /**
   * Inicializar configuración de seguridad
   */
  private initializeConfig(): void {
    this.config = {
      encryption: {
        algorithm: 'aes-256-cbc',
        keyLength: 32,
        ivLength: 16
      },
      storage: {
        credentialsPath: path.join(process.cwd(), 'secure', 'credentials.enc'),
        backupPath: path.join(process.cwd(), 'secure', 'backup'),
        encryptionKeyPath: path.join(process.cwd(), 'secure', '.key')
      },
      rateLimiting: {
        enableTracking: true,
        alertThreshold: 80 // Alertar al 80% del límite
      },
      audit: {
        logAccess: true,
        logPath: path.join(process.cwd(), 'logs', 'security.log')
      }
    };

    // Crear directorios necesarios
    this.ensureDirectories();
  }

  /**
   * Asegurar que existen los directorios necesarios
   */
  private ensureDirectories(): void {
    const dirs = [
      path.dirname(this.config.storage.credentialsPath),
      this.config.storage.backupPath,
      path.dirname(this.config.audit.logPath)
    ];

    dirs.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Inicializar sistema de encriptación
   */
  private initializeEncryption(): void {
    const keyPath = this.config.storage.encryptionKeyPath;
    const envSecret = (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim())
      || (process.env.JWT_SECRET && process.env.JWT_SECRET.trim());

    if (envSecret) {
      this.encryptionKey = this.deriveKeyFromSecret(envSecret);
      return;
    }
    
    if (existsSync(keyPath)) {
      // Cargar clave existente
      this.encryptionKey = readFileSync(keyPath);
    } else {
      // Generar nueva clave de encriptación
      this.encryptionKey = crypto.randomBytes(this.config.encryption.keyLength);
      writeFileSync(keyPath, this.encryptionKey, { mode: 0o600 }); // Solo lectura para owner
      console.log('🔐 Nueva clave de encriptación generada');
    }
  }

  private deriveKeyFromSecret(secret: string): Buffer {
    return crypto.createHash('sha256').update(secret).digest().subarray(0, this.config.encryption.keyLength);
  }

  /**
   * Cargar credenciales desde almacenamiento seguro
   */
  private loadCredentials(): void {
    try {
      if (existsSync(this.config.storage.credentialsPath)) {
        const encryptedData = readFileSync(this.config.storage.credentialsPath);
        const decryptedData = this.decrypt(encryptedData);
        const credentialsData = JSON.parse(decryptedData);
        
        credentialsData.forEach((cred: any) => {
          // Convertir fechas
          cred.createdAt = new Date(cred.createdAt);
          if (cred.lastUsed) cred.lastUsed = new Date(cred.lastUsed);
          if (cred.expiresAt) cred.expiresAt = new Date(cred.expiresAt);
          if (cred.usage?.lastReset) cred.usage.lastReset = new Date(cred.usage.lastReset);
          
          this.credentials.set(cred.id, cred);
        });
        
        console.log(`🔐 ${this.credentials.size} credenciales cargadas de forma segura`);
      }
    } catch (error) {
      console.error('❌ Error cargando credenciales:', error);
    }
  }

  /**
   * Guardar credenciales de forma segura
   */
  private saveCredentials(): void {
    try {
      const credentialsArray = Array.from(this.credentials.values());
      const dataToEncrypt = JSON.stringify(credentialsArray, null, 2);
      const encryptedData = this.encrypt(dataToEncrypt);
      
      // Crear backup antes de guardar
      this.createBackup();
      
      writeFileSync(this.config.storage.credentialsPath, encryptedData, { mode: 0o600 });
      console.log('🔐 Credenciales guardadas de forma segura');
    } catch (error) {
      console.error('❌ Error guardando credenciales:', error);
      throw error;
    }
  }

  /**
   * Encriptar datos usando AES-256-CBC (compatible)
   */
  private encrypt(text: string): Buffer {
    const iv = crypto.randomBytes(this.config.encryption.ivLength);
    const cipher = crypto.createCipheriv(this.config.encryption.algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Combinar IV + datos encriptados
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * Desencriptar datos usando AES-256-CBC
   */
  private decrypt(encryptedBuffer: Buffer): string {
    const iv = encryptedBuffer.subarray(0, 16);
    const encrypted = encryptedBuffer.subarray(16);
    
    const decipher = crypto.createDecipheriv(this.config.encryption.algorithm, this.encryptionKey, iv);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  }

  /**
   * Crear backup de credenciales
   */
  private createBackup(): void {
    try {
      if (existsSync(this.config.storage.credentialsPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.config.storage.backupPath, `credentials-${timestamp}.enc`);
        
        const originalData = readFileSync(this.config.storage.credentialsPath);
        writeFileSync(backupFile, originalData, { mode: 0o600 });
        
        // Mantener solo los últimos 10 backups
        this.cleanupOldBackups();
      }
    } catch (error) {
      console.warn('⚠️ Error creando backup:', error);
    }
  }

  /**
   * Limpiar backups antiguos
   */
  private cleanupOldBackups(): void {
    try {
      const fs = require('fs');
      const backupFiles = fs.readdirSync(this.config.storage.backupPath)
        .filter((file: string) => file.startsWith('credentials-') && file.endsWith('.enc'))
        .map((file: string) => ({
          name: file,
          path: path.join(this.config.storage.backupPath, file),
          stat: fs.statSync(path.join(this.config.storage.backupPath, file))
        }))
        .sort((a: any, b: any) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      // Mantener solo los 10 más recientes
      if (backupFiles.length > 10) {
        backupFiles.slice(10).forEach((file: any) => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      console.warn('⚠️ Error limpiando backups:', error);
    }
  }

  /**
   * Agregar o actualizar credenciales
   */
  async addCredentials(credentialData: {
    marketplace: APICredential['marketplace'];
    environment: APICredential['environment'];
    credentials: APICredential['credentials'];
    rateLimits?: APICredential['rateLimits'];
    expiresAt?: Date;
  }): Promise<string> {
    const credentialId = `${credentialData.marketplace}_${credentialData.environment}_${Date.now()}`;
    
    const credential: APICredential = {
      id: credentialId,
      marketplace: credentialData.marketplace,
      environment: credentialData.environment,
      credentials: credentialData.credentials,
      isActive: true,
      createdAt: new Date(),
      rateLimits: credentialData.rateLimits || this.getDefaultRateLimits(credentialData.marketplace),
      expiresAt: credentialData.expiresAt,
      usage: {
        requestsToday: 0,
        requestsThisHour: 0,
        requestsThisMinute: 0,
        lastReset: new Date()
      }
    };

    this.credentials.set(credentialId, credential);
    this.saveCredentials();
    
    this.logAccess(credentialId, credentialData.marketplace, 'ADD_CREDENTIALS', true);
    
    console.log(`🔐 Credenciales agregadas: ${credentialData.marketplace} (${credentialData.environment})`);
    return credentialId;
  }

  /**
   * Obtener credenciales
   */
  async getCredentials(marketplace: string, environment: 'sandbox' | 'production'): Promise<APICredential | null> {
    // Buscar credenciales activas para el marketplace y environment
    const credential = Array.from(this.credentials.values()).find(cred => 
      cred.marketplace === marketplace && 
      cred.environment === environment && 
      cred.isActive &&
      (!cred.expiresAt || cred.expiresAt > new Date())
    );

    if (credential) {
      // Actualizar último uso
      credential.lastUsed = new Date();
      this.saveCredentials();
      
      this.logAccess(credential.id, marketplace, 'GET_CREDENTIALS', true);
      
      return credential;
    }

    this.logAccess('unknown', marketplace, 'GET_CREDENTIALS', false, 'Credentials not found');
    return null;
  }

  /**
   * Verificar límites de rate limiting
   */
  async checkRateLimit(credentialId: string): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const credential = this.credentials.get(credentialId);
    if (!credential || !credential.rateLimits || !credential.usage) {
      return { allowed: true, remaining: 1000, resetTime: new Date() };
    }

    const now = new Date();
    const usage = credential.usage;
    
    // Reset counters si es necesario
    this.resetUsageCountersIfNeeded(credential, now);

    // Verificar límites
    const limits = credential.rateLimits;
    const exceedsMinute = usage.requestsThisMinute >= limits.requestsPerMinute;
    const exceedsHour = usage.requestsThisHour >= limits.requestsPerHour;
    const exceedsDay = usage.requestsToday >= limits.requestsPerDay;

    const allowed = !exceedsMinute && !exceedsHour && !exceedsDay;
    
    if (allowed) {
      // Incrementar contadores
      usage.requestsThisMinute++;
      usage.requestsThisHour++;
      usage.requestsToday++;
      this.saveCredentials();
    }

    // Calcular remaining y reset time
    const remaining = Math.min(
      limits.requestsPerMinute - usage.requestsThisMinute,
      limits.requestsPerHour - usage.requestsThisHour,
      limits.requestsPerDay - usage.requestsToday
    );

    const nextMinute = new Date(now);
    nextMinute.setSeconds(0, 0);
    nextMinute.setMinutes(nextMinute.getMinutes() + 1);

    this.logAccess(credentialId, credential.marketplace, 'RATE_LIMIT_CHECK', allowed);

    // Alertar si se está cerca del límite
    if (this.config.rateLimiting.enableTracking) {
      this.checkRateLimitAlerts(credential);
    }

    return { allowed, remaining, resetTime: nextMinute };
  }

  /**
   * Reset usage counters when needed
   */
  private resetUsageCountersIfNeeded(credential: APICredential, now: Date): void {
    const usage = credential.usage!;
    const lastReset = usage.lastReset;
    
    // Reset por minuto
    if (now.getMinutes() !== lastReset.getMinutes()) {
      usage.requestsThisMinute = 0;
    }
    
    // Reset por hora
    if (now.getHours() !== lastReset.getHours()) {
      usage.requestsThisHour = 0;
    }
    
    // Reset por día
    if (now.getDate() !== lastReset.getDate()) {
      usage.requestsToday = 0;
    }
    
    usage.lastReset = now;
  }

  /**
   * Verificar alertas de rate limiting
   */
  private checkRateLimitAlerts(credential: APICredential): void {
    if (!credential.rateLimits || !credential.usage) return;

    const limits = credential.rateLimits;
    const usage = credential.usage;
    const threshold = this.config.rateLimiting.alertThreshold / 100;

    const dayUsagePercent = usage.requestsToday / limits.requestsPerDay;
    const hourUsagePercent = usage.requestsThisHour / limits.requestsPerHour;

    if (dayUsagePercent >= threshold || hourUsagePercent >= threshold) {
      console.warn(`⚠️ Rate limit alert: ${credential.marketplace} at ${Math.round(Math.max(dayUsagePercent, hourUsagePercent) * 100)}% capacity`);
    }
  }

  /**
   * Obtener límites por defecto según marketplace
   */
  private getDefaultRateLimits(marketplace: string): APICredential['rateLimits'] {
    const defaults = {
      ebay: { requestsPerMinute: 100, requestsPerHour: 5000, requestsPerDay: 100000 },
      amazon: { requestsPerMinute: 50, requestsPerHour: 3600, requestsPerDay: 86400 },
      mercadolibre: { requestsPerMinute: 60, requestsPerHour: 3600, requestsPerDay: 50000 },
      alibaba: { requestsPerMinute: 30, requestsPerHour: 1800, requestsPerDay: 20000 },
      aliexpress: { requestsPerMinute: 40, requestsPerHour: 2400, requestsPerDay: 30000 }
    };

    return defaults[marketplace as keyof typeof defaults] || defaults.ebay;
  }

  /**
   * Registrar acceso en log de auditoría
   */
  private logAccess(
    credentialId: string, 
    marketplace: string, 
    action: string, 
    success: boolean,
    error?: string,
    ipAddress?: string,
    userAgent?: string
  ): void {
    if (!this.config.audit.logAccess) return;

    const logEntry: AccessLog = {
      timestamp: new Date(),
      credentialId,
      marketplace,
      action,
      success,
      ipAddress,
      userAgent,
      error
    };

    this.accessLogs.push(logEntry);

    // También agregar al audit trail para auditLog método
    this.auditTrail.push({
      timestamp: logEntry.timestamp.toISOString(),
      userId: credentialId,
      marketplace: marketplace,
      action: action,
      success: success,
      details: error,
      ip: ipAddress
    });

    // Mantener máximo 1000 entradas en audit trail
    if (this.auditTrail.length > 1000) {
      this.auditTrail = this.auditTrail.slice(-1000);
    }

    // Escribir a archivo de log
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      require('fs').appendFileSync(this.config.audit.logPath, logLine);
      
      // Mantener solo los últimos 1000 logs en memoria
      if (this.accessLogs.length > 1000) {
        this.accessLogs = this.accessLogs.slice(-1000);
      }
    } catch (error) {
      console.error('❌ Error escribiendo log de auditoría:', error);
    }
  }

  /**
   * Iniciar tracking de uso
   */
  private startUsageTracking(): void {
    // Limpiar contadores cada minuto
    setInterval(() => {
      const now = new Date();
      for (const credential of this.credentials.values()) {
        if (credential.usage) {
          this.resetUsageCountersIfNeeded(credential, now);
        }
      }
    }, 60 * 1000);

    console.log('📊 Sistema de tracking de uso iniciado');
  }

  /**
   * Desactivar credenciales
   */
  async deactivateCredentials(credentialId: string): Promise<boolean> {
    const credential = this.credentials.get(credentialId);
    if (credential) {
      credential.isActive = false;
      this.saveCredentials();
      this.logAccess(credentialId, credential.marketplace, 'DEACTIVATE_CREDENTIALS', true);
      return true;
    }
    return false;
  }

  /**
   * Listar credenciales (sin datos sensibles)
   */
  listCredentials(): Omit<APICredential, 'credentials'>[] {
    return Array.from(this.credentials.values()).map(cred => ({
      id: cred.id,
      marketplace: cred.marketplace,
      environment: cred.environment,
      isActive: cred.isActive,
      createdAt: cred.createdAt,
      lastUsed: cred.lastUsed,
      expiresAt: cred.expiresAt,
      rateLimits: cred.rateLimits,
      usage: cred.usage
    }));
  }

  /**
   * Obtener estadísticas de uso
   */
  getUsageStats(): any {
    const credentials = Array.from(this.credentials.values());
    const activeCount = credentials.filter(c => c.isActive).length;
    const totalRequests = credentials.reduce((sum, c) => sum + (c.usage?.requestsToday || 0), 0);
    
    return {
      totalCredentials: credentials.length,
      activeCredentials: activeCount,
      totalRequestsToday: totalRequests,
      marketplaces: this.getMarketplaceStats(credentials),
      recentAccess: this.accessLogs.slice(-10)
    };
  }

  /**
   * Estadísticas por marketplace
   */
  private getMarketplaceStats(credentials: APICredential[]): Record<string, any> {
    const stats: Record<string, any> = {};
    
    credentials.forEach(cred => {
      if (!stats[cred.marketplace]) {
        stats[cred.marketplace] = {
          total: 0,
          active: 0,
          sandbox: 0,
          production: 0,
          requestsToday: 0
        };
      }
      
      const marketStats = stats[cred.marketplace];
      marketStats.total++;
      if (cred.isActive) marketStats.active++;
      if (cred.environment === 'sandbox') marketStats.sandbox++;
      if (cred.environment === 'production') marketStats.production++;
      marketStats.requestsToday += cred.usage?.requestsToday || 0;
    });
    
    return stats;
  }

  /**
   * Rotar clave de encriptación (operación sensible)
   */
  async rotateEncryptionKey(): Promise<void> {
    console.log('🔄 Iniciando rotación de clave de encriptación...');
    
    try {
      // Desencriptar datos con clave actual
      const currentData = Array.from(this.credentials.values());
      
      // Generar nueva clave
      const newKey = crypto.randomBytes(this.config.encryption.keyLength);
      
      // Backup de la clave actual
      const backupKeyPath = `${this.config.storage.encryptionKeyPath}.backup.${Date.now()}`;
      writeFileSync(backupKeyPath, this.encryptionKey, { mode: 0o600 });
      
      // Actualizar clave
      this.encryptionKey = newKey;
      writeFileSync(this.config.storage.encryptionKeyPath, newKey, { mode: 0o600 });
      
      // Re-encriptar y guardar datos
      this.saveCredentials();
      
      console.log('✅ Clave de encriptación rotada exitosamente');
      this.logAccess('system', 'system', 'ROTATE_ENCRYPTION_KEY', true);
      
    } catch (error) {
      console.error('❌ Error rotando clave de encriptación:', error);
      this.logAccess('system', 'system', 'ROTATE_ENCRYPTION_KEY', false, error.message);
      throw error;
    }
  }

  /**
   * Obtener logs de auditoría
   */
  auditLog(filters: {
    userId?: string;
    marketplace?: string;
    action?: string;
    success?: boolean;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  } = {}): Array<{
    timestamp: string;
    userId: string;
    marketplace: string;
    action: string;
    success: boolean;
    details?: string;
    ip?: string;
  }> {
    try {
      let filteredLogs = this.auditTrail;

      // Aplicar filtros
      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
      }
      if (filters.marketplace) {
        filteredLogs = filteredLogs.filter(log => log.marketplace === filters.marketplace);
      }
      if (filters.action) {
        filteredLogs = filteredLogs.filter(log => log.action === filters.action);
      }
      if (filters.success !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.success === filters.success);
      }
      if (filters.fromDate) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= filters.fromDate!);
      }
      if (filters.toDate) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= filters.toDate!);
      }

      // Limitar resultados
      const limit = filters.limit || 100;
      return filteredLogs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

    } catch (error) {
      console.error('Error obteniendo audit log:', error);
      return [];
    }
  }
}

export const secureCredentialManager = new SecureCredentialManager();