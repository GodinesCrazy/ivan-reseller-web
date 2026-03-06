/**
 * Unit tests for balance-verification.service: PayPal balance mapping and unavailable reasons.
 * Mocks PayPalPayoutService so we verify that when PayPal "sends" a balance (Wallet API, Reporting API)
 * or fails (null / exception), we map it correctly to BalanceResult or PayPalUnavailableResult.
 */
import { getPayPalBalance, BalanceResult, PayPalUnavailableResult } from '../../services/balance-verification.service';

const mockFromUserCredentials = jest.fn();
const mockFromEnv = jest.fn();

jest.mock('../../services/paypal-payout.service', () => ({
  PayPalPayoutService: {
    fromUserCredentials: (...args: unknown[]) => mockFromUserCredentials(...args),
    fromEnv: () => mockFromEnv(),
  },
}));

describe('balance-verification.service – PayPal balance', () => {
  const userId = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFromEnv.mockReturnValue(null);
  });

  it('maps Wallet API response to BalanceResult with source paypal', async () => {
    mockFromUserCredentials.mockResolvedValue({
      checkPayPalBalance: () => Promise.resolve({
        available: 150.5,
        currency: 'USD',
        source: 'wallet_api',
      }),
    });

    const result = await getPayPalBalance(userId, 'production');

    expect(mockFromUserCredentials).toHaveBeenCalledWith(userId, 'production');
    expect(result).not.toBeNull();
    expect('unavailableReason' in (result || {})).toBe(false);
    const balance = result as BalanceResult;
    expect(balance.available).toBe(150.5);
    expect(balance.currency).toBe('USD');
    expect(balance.source).toBe('paypal');
  });

  it('maps Reporting API response to BalanceResult with source paypal_estimated', async () => {
    mockFromUserCredentials.mockResolvedValue({
      checkPayPalBalance: () => Promise.resolve({
        available: 75.25,
        currency: 'USD',
        source: 'reporting_api_estimated',
      }),
    });

    const result = await getPayPalBalance(userId, 'sandbox');

    expect(mockFromUserCredentials).toHaveBeenCalledWith(userId, 'sandbox');
    const balance = result as BalanceResult;
    expect(balance.available).toBe(75.25);
    expect(balance.currency).toBe('USD');
    expect(balance.source).toBe('paypal_estimated');
  });

  it('returns unavailableReason api_failed when checkPayPalBalance returns null', async () => {
    mockFromUserCredentials.mockResolvedValue({
      checkPayPalBalance: () => Promise.resolve(null),
    });

    const result = await getPayPalBalance(userId, 'production');

    expect(result).not.toBeNull();
    const unavailable = result as PayPalUnavailableResult;
    expect(unavailable.available).toBe(0);
    expect(unavailable.currency).toBe('USD');
    expect(unavailable.unavailableReason).toBe('api_failed');
  });

  it('returns unavailableReason no_credentials when no service (user and env)', async () => {
    mockFromUserCredentials.mockResolvedValue(null);

    const result = await getPayPalBalance(userId, 'production');

    expect(result).not.toBeNull();
    const unavailable = result as PayPalUnavailableResult;
    expect(unavailable.available).toBe(0);
    expect(unavailable.unavailableReason).toBe('no_credentials');
  });

  it('returns null when checkPayPalBalance throws', async () => {
    mockFromUserCredentials.mockResolvedValue({
      checkPayPalBalance: () => Promise.reject(new Error('Network error')),
    });

    const result = await getPayPalBalance(userId, 'production');

    expect(result).toBeNull();
  });
});
