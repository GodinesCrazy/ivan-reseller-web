/**
 * Utility to resolve environment (sandbox/production) with consistent priority
 * 
 * Priority order:
 * 1. Explicitly provided environment parameter
 * 2. Environment from stored credentials
 * 3. User's workflow config environment
 * 4. Default: 'production'
 */

import { workflowConfigService } from '../services/workflow-config.service';

export type ApiEnvironment = 'sandbox' | 'production';

export interface ResolveEnvironmentOptions {
  /**
   * Explicitly provided environment (highest priority)
   */
  explicit?: ApiEnvironment;
  
  /**
   * Environment from stored credentials
   */
  fromCredentials?: ApiEnvironment;
  
  /**
   * User ID to get workflow config (if needed)
   */
  userId?: number;
  
  /**
   * Default environment if none found (default: 'production')
   */
  default?: ApiEnvironment;
}

/**
 * Resolve environment with consistent priority across the application
 */
export async function resolveEnvironment(
  options: ResolveEnvironmentOptions
): Promise<ApiEnvironment> {
  // Priority 1: Explicitly provided
  if (options.explicit && (options.explicit === 'sandbox' || options.explicit === 'production')) {
    return options.explicit;
  }
  
  // Priority 2: From credentials
  if (options.fromCredentials && (options.fromCredentials === 'sandbox' || options.fromCredentials === 'production')) {
    return options.fromCredentials;
  }
  
  // Priority 3: From user's workflow config
  if (options.userId) {
    try {
      const config = await workflowConfigService.getUserConfig(options.userId);
      if (config.environment === 'sandbox' || config.environment === 'production') {
        return config.environment;
      }
    } catch (error) {
      // If workflow config fails, continue to default
    }
  }
  
  // Priority 4: Default
  return options.default || 'production';
}

/**
 * Synchronous version (for cases where we can't await)
 * Uses only explicit and fromCredentials
 */
export function resolveEnvironmentSync(
  options: Omit<ResolveEnvironmentOptions, 'userId'>
): ApiEnvironment {
  // Priority 1: Explicitly provided
  if (options.explicit && (options.explicit === 'sandbox' || options.explicit === 'production')) {
    return options.explicit;
  }
  
  // Priority 2: From credentials
  if (options.fromCredentials && (options.fromCredentials === 'sandbox' || options.fromCredentials === 'production')) {
    return options.fromCredentials;
  }
  
  // Priority 3: Default
  return options.default || 'production';
}

