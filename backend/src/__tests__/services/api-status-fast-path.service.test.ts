const findManyMock = jest.fn();
const getAllAPIStatusMock = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    aPIStatusSnapshot: {
      findMany: (...args: any[]) => findManyMock(...args),
    },
  },
}));

jest.mock('../../services/api-availability.service', () => ({
  APIAvailabilityService: jest.fn().mockImplementation(() => ({
    getAllAPIStatus: (...args: any[]) => getAllAPIStatusMock(...args),
  })),
}));

import { getFastApiStatusesForUser } from '../../services/api-status-fast-path.service';

describe('api-status-fast-path.service', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    getAllAPIStatusMock.mockReset();
  });

  it('returns fresh snapshots without waiting for live checks', async () => {
    findManyMock.mockResolvedValue([
      {
        apiName: 'ebay',
        isConfigured: true,
        isAvailable: true,
        status: 'healthy',
        lastChecked: new Date(),
        error: null,
        message: 'ok',
        environment: 'production',
        latency: 120,
        trustScore: 99,
      },
    ]);

    const result = await getFastApiStatusesForUser(1);

    expect(result.source).toBe('snapshot');
    expect(result.staleSnapshot).toBe(false);
    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0].apiName).toBe('ebay');
    expect(getAllAPIStatusMock).not.toHaveBeenCalled();
  });

  it('falls back to live when no fresh snapshot exists', async () => {
    findManyMock.mockResolvedValue([]);
    getAllAPIStatusMock.mockResolvedValue([
      {
        apiName: 'ebay',
        isConfigured: true,
        isAvailable: false,
        status: 'degraded',
        lastChecked: new Date(),
        environment: 'production',
      },
    ]);

    const result = await getFastApiStatusesForUser(1);

    expect(result.source).toBe('live');
    expect(result.statuses).toHaveLength(1);
    expect(getAllAPIStatusMock).toHaveBeenCalledWith(1);
  });
});
