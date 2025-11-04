import axios from 'axios';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Captcha type enum
 */
export enum CaptchaType {
  RECAPTCHA_V2 = 'recaptcha_v2',
  RECAPTCHA_V3 = 'recaptcha_v3',
  HCAPTCHA = 'hcaptcha',
  FUNCAPTCHA = 'funcaptcha',
  IMAGE_CAPTCHA = 'image',
}

/**
 * Captcha solve request
 */
export interface CaptchaSolveRequest {
  type: CaptchaType;
  siteUrl: string;
  siteKey?: string;
  imageBase64?: string;
  minScore?: number; // For reCAPTCHA v3
  action?: string; // For reCAPTCHA v3
  proxy?: {
    type: 'http' | 'https' | 'socks4' | 'socks5';
    address: string;
    port: number;
    username?: string;
    password?: string;
  };
}

/**
 * Captcha solve response
 */
export interface CaptchaSolveResponse {
  success: boolean;
  solution: string;
  taskId: string;
  cost?: number;
  solveTime?: number;
}

/**
 * Anti-Captcha Service Provider Interface
 */
interface ICaptchaProvider {
  name: string;
  solveCaptcha(request: CaptchaSolveRequest): Promise<CaptchaSolveResponse>;
  getBalance(): Promise<number>;
}

/**
 * 2Captcha Provider Implementation
 */
class TwoCaptchaProvider implements ICaptchaProvider {
  name = '2Captcha';
  private apiKey: string;
  private apiUrl = 'https://2captcha.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async solveCaptcha(request: CaptchaSolveRequest): Promise<CaptchaSolveResponse> {
    const startTime = Date.now();

    try {
      // Step 1: Submit captcha
      const taskId = await this.submitCaptcha(request);
      logger.info(`2Captcha task submitted: ${taskId}`);

      // Step 2: Wait and retrieve solution
      const solution = await this.pollSolution(taskId);
      const solveTime = Date.now() - startTime;

      logger.info(`2Captcha solved in ${solveTime}ms`);

      return {
        success: true,
        solution,
        taskId,
        solveTime,
      };
    } catch (error) {
      logger.error('2Captcha solving failed:', error);
      throw new AppError('Failed to solve captcha with 2Captcha', 500);
    }
  }

  private async submitCaptcha(request: CaptchaSolveRequest): Promise<string> {
    const params: any = {
      key: this.apiKey,
      json: 1,
    };

    switch (request.type) {
      case CaptchaType.RECAPTCHA_V2:
        params.method = 'userrecaptcha';
        params.googlekey = request.siteKey;
        params.pageurl = request.siteUrl;
        break;
      case CaptchaType.RECAPTCHA_V3:
        params.method = 'userrecaptcha';
        params.version = 'v3';
        params.googlekey = request.siteKey;
        params.pageurl = request.siteUrl;
        params.action = request.action || 'verify';
        params.min_score = request.minScore || 0.3;
        break;
      case CaptchaType.HCAPTCHA:
        params.method = 'hcaptcha';
        params.sitekey = request.siteKey;
        params.pageurl = request.siteUrl;
        break;
      case CaptchaType.IMAGE_CAPTCHA:
        params.method = 'base64';
        params.body = request.imageBase64;
        break;
      default:
        throw new AppError(`Unsupported captcha type: ${request.type}`, 400);
    }

    // Add proxy if provided
    if (request.proxy) {
      params.proxy = `${request.proxy.type}://${request.proxy.address}:${request.proxy.port}`;
      if (request.proxy.username && request.proxy.password) {
        params.proxylogin = request.proxy.username;
        params.proxypass = request.proxy.password;
      }
    }

    const response = await axios.get(`${this.apiUrl}/in.php`, { params });

    if (response.data.status !== 1) {
      throw new Error(`2Captcha submission failed: ${response.data.request}`);
    }

    return response.data.request;
  }

  private async pollSolution(taskId: string): Promise<string> {
    const maxAttempts = 120; // 2 minutes max
    const pollInterval = 1000; // 1 second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.delay(pollInterval);

      try {
        const response = await axios.get(`${this.apiUrl}/res.php`, {
          params: {
            key: this.apiKey,
            action: 'get',
            id: taskId,
            json: 1,
          },
        });

        if (response.data.status === 1) {
          return response.data.request;
        }

        if (response.data.request !== 'CAPCHA_NOT_READY') {
          throw new Error(`2Captcha error: ${response.data.request}`);
        }
      } catch (error) {
        logger.warn(`2Captcha poll attempt ${attempt + 1} failed:`, error);
      }
    }

    throw new Error('2Captcha timeout: solution not received');
  }

  async getBalance(): Promise<number> {
    try {
      const response = await axios.get(`${this.apiUrl}/res.php`, {
        params: {
          key: this.apiKey,
          action: 'getbalance',
          json: 1,
        },
      });

      if (response.data.status !== 1) {
        throw new Error(`Failed to get balance: ${response.data.request}`);
      }

      return parseFloat(response.data.request);
    } catch (error) {
      logger.error('Failed to get 2Captcha balance:', error);
      return 0;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Anti-Captcha Provider Implementation
 */
class AntiCaptchaProvider implements ICaptchaProvider {
  name = 'Anti-Captcha';
  private apiKey: string;
  private apiUrl = 'https://api.anti-captcha.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async solveCaptcha(request: CaptchaSolveRequest): Promise<CaptchaSolveResponse> {
    const startTime = Date.now();

    try {
      // Step 1: Create task
      const taskId = await this.createTask(request);
      logger.info(`Anti-Captcha task created: ${taskId}`);

      // Step 2: Wait and retrieve solution
      const solution = await this.getTaskResult(taskId);
      const solveTime = Date.now() - startTime;

      logger.info(`Anti-Captcha solved in ${solveTime}ms`);

      return {
        success: true,
        solution,
        taskId: String(taskId),
        solveTime,
      };
    } catch (error) {
      logger.error('Anti-Captcha solving failed:', error);
      throw new AppError('Failed to solve captcha with Anti-Captcha', 500);
    }
  }

  private async createTask(request: CaptchaSolveRequest): Promise<number> {
    const taskData: any = {
      clientKey: this.apiKey,
      task: {},
    };

    switch (request.type) {
      case CaptchaType.RECAPTCHA_V2:
        taskData.task = {
          type: 'RecaptchaV2TaskProxyless',
          websiteURL: request.siteUrl,
          websiteKey: request.siteKey,
        };
        break;
      case CaptchaType.RECAPTCHA_V3:
        taskData.task = {
          type: 'RecaptchaV3TaskProxyless',
          websiteURL: request.siteUrl,
          websiteKey: request.siteKey,
          minScore: request.minScore || 0.3,
          pageAction: request.action || 'verify',
        };
        break;
      case CaptchaType.HCAPTCHA:
        taskData.task = {
          type: 'HCaptchaTaskProxyless',
          websiteURL: request.siteUrl,
          websiteKey: request.siteKey,
        };
        break;
      case CaptchaType.IMAGE_CAPTCHA:
        taskData.task = {
          type: 'ImageToTextTask',
          body: request.imageBase64,
        };
        break;
      default:
        throw new AppError(`Unsupported captcha type: ${request.type}`, 400);
    }

    // Add proxy if provided
    if (request.proxy) {
      const taskType = taskData.task.type.replace('Proxyless', '');
      taskData.task.type = taskType;
      taskData.task.proxyType = request.proxy.type;
      taskData.task.proxyAddress = request.proxy.address;
      taskData.task.proxyPort = request.proxy.port;
      if (request.proxy.username && request.proxy.password) {
        taskData.task.proxyLogin = request.proxy.username;
        taskData.task.proxyPassword = request.proxy.password;
      }
    }

    const response = await axios.post(`${this.apiUrl}/createTask`, taskData);

    if (response.data.errorId !== 0) {
      throw new Error(`Anti-Captcha task creation failed: ${response.data.errorDescription}`);
    }

    return response.data.taskId;
  }

  private async getTaskResult(taskId: number): Promise<string> {
    const maxAttempts = 120; // 2 minutes max
    const pollInterval = 1000; // 1 second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.delay(pollInterval);

      try {
        const response = await axios.post(`${this.apiUrl}/getTaskResult`, {
          clientKey: this.apiKey,
          taskId,
        });

        if (response.data.errorId !== 0) {
          throw new Error(`Anti-Captcha error: ${response.data.errorDescription}`);
        }

        if (response.data.status === 'ready') {
          return response.data.solution.gRecaptchaResponse || 
                 response.data.solution.text ||
                 response.data.solution.token;
        }

        if (response.data.status !== 'processing') {
          throw new Error(`Unexpected status: ${response.data.status}`);
        }
      } catch (error) {
        logger.warn(`Anti-Captcha poll attempt ${attempt + 1} failed:`, error);
      }
    }

    throw new Error('Anti-Captcha timeout: solution not received');
  }

  async getBalance(): Promise<number> {
    try {
      const response = await axios.post(`${this.apiUrl}/getBalance`, {
        clientKey: this.apiKey,
      });

      if (response.data.errorId !== 0) {
        throw new Error(`Failed to get balance: ${response.data.errorDescription}`);
      }

      return response.data.balance;
    } catch (error) {
      logger.error('Failed to get Anti-Captcha balance:', error);
      return 0;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Anti-Captcha Service
 * 
 * Manages multiple captcha solving providers with automatic fallback
 */
export class AntiCaptchaService {
  private providers: ICaptchaProvider[] = [];
  private currentProviderIndex = 0;

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize captcha solving providers
   */
  private initializeProviders(): void {
    // Initialize 2Captcha if API key is available
    if (process.env.TWO_CAPTCHA_API_KEY) {
      this.providers.push(new TwoCaptchaProvider(process.env.TWO_CAPTCHA_API_KEY));
      logger.info('2Captcha provider initialized');
    }

    // Initialize Anti-Captcha if API key is available
    if (process.env.ANTI_CAPTCHA_API_KEY) {
      this.providers.push(new AntiCaptchaProvider(process.env.ANTI_CAPTCHA_API_KEY));
      logger.info('Anti-Captcha provider initialized');
    }

    if (this.providers.length === 0) {
      logger.warn('No captcha solving providers configured');
    }
  }

  /**
   * Solve captcha with automatic provider fallback
   */
  async solveCaptcha(request: CaptchaSolveRequest): Promise<CaptchaSolveResponse> {
    if (this.providers.length === 0) {
      throw new AppError('No captcha solving providers available', 500);
    }

    let lastError: Error | null = null;

    // Try each provider
    for (let i = 0; i < this.providers.length; i++) {
      const providerIndex = (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[providerIndex];

      try {
        logger.info(`Attempting to solve captcha with ${provider.name}`);
        const result = await provider.solveCaptcha(request);
        
        // Update current provider for next request
        this.currentProviderIndex = providerIndex;
        
        return result;
      } catch (error) {
        lastError = error as Error;
        logger.error(`${provider.name} failed to solve captcha:`, error);
      }
    }

    // All providers failed
    throw new AppError(
      `All captcha providers failed. Last error: ${lastError?.message}`,
      500
    );
  }

  /**
   * Get balance for all providers
   */
  async getBalances(): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};

    for (const provider of this.providers) {
      try {
        balances[provider.name] = await provider.getBalance();
      } catch (error) {
        logger.error(`Failed to get balance for ${provider.name}:`, error);
        balances[provider.name] = 0;
      }
    }

    return balances;
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.providers.length > 0;
  }

  /**
   * Get list of available providers
   */
  getProviders(): string[] {
    return this.providers.map(p => p.name);
  }
}

// Export singleton instance
export const antiCaptchaService = new AntiCaptchaService();
export default antiCaptchaService;
