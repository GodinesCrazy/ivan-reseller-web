jest.mock('../../config/database', () => ({
  prisma: {
    apiCredential: {
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../../config/database';
import { checkSetupStatus } from '../../utils/setup-check';

describe('setup-check', () => {
  const mockedCount = prisma.apiCredential.count as jest.Mock;

  beforeEach(() => {
    mockedCount.mockReset();
  });

  it('marks setup complete when marketplace and search credentials exist', async () => {
    mockedCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await expect(checkSetupStatus(1)).resolves.toEqual({
      setupRequired: false,
      hasMarketplace: true,
      hasSearchAPI: true,
      reason: undefined,
    });
    expect(mockedCount).toHaveBeenCalledTimes(2);
  });

  it('requires setup when search credentials are missing', async () => {
    mockedCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(checkSetupStatus(1)).resolves.toEqual({
      setupRequired: true,
      hasMarketplace: true,
      hasSearchAPI: false,
      reason: 'missing_search_api',
    });
  });
});
