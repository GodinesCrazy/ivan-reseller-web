import { CredentialsManager } from '../../services/credentials-manager.service';
import type { ApiName } from '../../types/api-credentials.types';

describe('CredentialsManager', () => {
  describe('validateCredentials', () => {
    it('should validate eBay credentials correctly', () => {
      const validCredentials = {
        appId: 'SBX-1234567890',
        devId: 'dev123',
        certId: 'cert123',
        sandbox: true,
      };

      const result = CredentialsManager.validateCredentials('ebay', validCredentials);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid eBay credentials', () => {
      const invalidCredentials = {
        appId: '', // Empty appId
        devId: 'dev123',
        certId: 'cert123',
        sandbox: true,
      };

      const result = CredentialsManager.validateCredentials('ebay', invalidCredentials);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should validate Amazon credentials correctly', () => {
      const validCredentials = {
        sellerId: 'A1234567890',
        clientId: 'client123',
        clientSecret: 'secret123',
        refreshToken: 'refresh123',
        awsAccessKeyId: 'AKIA1234567890',
        awsSecretAccessKey: 'secret123',
        marketplaceId: 'ATVPDKIKX0DER',
        region: 'us-east-1',
        sandbox: false,
      };

      const result = CredentialsManager.validateCredentials('amazon', validCredentials);
      expect(result.valid).toBe(true);
    });

    it('should validate MercadoLibre credentials correctly', () => {
      const validCredentials = {
        clientId: 'client123',
        clientSecret: 'secret123',
        accessToken: 'token123',
        refreshToken: 'refresh123',
        sandbox: false,
      };

      const result = CredentialsManager.validateCredentials('mercadolibre', validCredentials);
      expect(result.valid).toBe(true);
    });
  });
});

