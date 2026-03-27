const findFirstMock = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    apiCredential: {
      findFirst: (...args: any[]) => findFirstMock(...args),
    },
  },
}));

jest.mock('../../utils/encryption', () => ({
  decrypt: jest.fn((value: string) => {
    if (value === 'bad:payload') {
      throw new Error('decrypt_failed');
    }
    if (value === 'aa:payload') {
      return JSON.stringify({
        appId: 'app-id',
        certId: 'cert-id',
        devId: 'dev-id',
        token: 'token-123',
        refreshToken: 'refresh-123',
      });
    }
    return value;
  }),
  encrypt: jest.fn((value: string) => value),
}));

import { CredentialsManager } from '../../services/credentials-manager.service';

describe('CredentialsManager credential integrity', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it('classifies missing credentials', async () => {
    findFirstMock.mockResolvedValue(null);

    const report = await CredentialsManager.getCredentialIntegrityReport(1, 'ebay', 'production');

    expect(report.state).toBe('missing');
    expect(report.reasonCode).toBe('missing');
  });

  it('classifies undecryptable encrypted payloads', async () => {
    findFirstMock.mockResolvedValue({
      id: 10,
      userId: 1,
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      credentials: 'bad:payload',
      isActive: true,
    });

    const report = await CredentialsManager.getCredentialIntegrityReport(1, 'ebay', 'production');

    expect(report.state).toBe('undecryptable');
    expect(report.reasonCode).toBe('undecryptable_current_key');
    expect(report.recordId).toBe(10);
  });

  it('classifies valid encrypted payloads with tokens', async () => {
    findFirstMock.mockResolvedValue({
      id: 11,
      userId: 1,
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      credentials: 'aa:payload',
      isActive: true,
    });

    const report = await CredentialsManager.getCredentialIntegrityReport(1, 'ebay', 'production');

    expect(report.state).toBe('valid');
    expect(report.hasBasicCredentials).toBe(true);
    expect(report.hasAccessToken).toBe(true);
    expect(report.hasRefreshToken).toBe(true);
  });
});
