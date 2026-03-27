import { prisma } from '../config/database';
import { APIAvailabilityService, type APIStatus } from './api-availability.service';

const apiAvailability = new APIAvailabilityService();
const DEFAULT_FAST_PATH_MAX_AGE_MINUTES = 60;
const DEFAULT_LIVE_TIMEOUT_MS = 3000;

function normalizeSnapshotStatus(snapshot: any): APIStatus {
  return {
    apiName: snapshot.apiName,
    name: snapshot.apiName,
    isConfigured: snapshot.isConfigured,
    isAvailable: snapshot.isAvailable,
    status: snapshot.status,
    lastChecked: snapshot.lastChecked,
    error: snapshot.error || undefined,
    message: snapshot.message || undefined,
    environment: snapshot.environment,
    latency: snapshot.latency || undefined,
    trustScore: snapshot.trustScore,
  } as APIStatus;
}

export async function getFastApiStatusesForUser(userId: number): Promise<{
  statuses: APIStatus[];
  source: 'live' | 'snapshot';
  staleSnapshot: boolean;
}> {
  const freshAfter = new Date(Date.now() - DEFAULT_FAST_PATH_MAX_AGE_MINUTES * 60 * 1000);
  const snapshots = await prisma.aPIStatusSnapshot.findMany({
    where: {
      userId,
      environment: 'production',
    },
    select: {
      apiName: true,
      isConfigured: true,
      isAvailable: true,
      status: true,
      lastChecked: true,
      error: true,
      message: true,
      environment: true,
      latency: true,
      trustScore: true,
    },
    orderBy: { lastChecked: 'desc' },
  });

  const freshSnapshots = snapshots.filter((item) => item.lastChecked >= freshAfter);
  const snapshotStatuses = freshSnapshots.map(normalizeSnapshotStatus);

  if (snapshotStatuses.length > 0) {
    return {
      statuses: snapshotStatuses,
      source: 'snapshot',
      staleSnapshot: false,
    };
  }

  try {
    const statuses = await Promise.race([
      apiAvailability.getAllAPIStatus(userId),
      new Promise<APIStatus[]>((_, reject) =>
        setTimeout(() => reject(new Error('api_status_fast_path_timeout')), DEFAULT_LIVE_TIMEOUT_MS)
      ),
    ]);
    return {
      statuses,
      source: 'live',
      staleSnapshot: false,
    };
  } catch {
    return {
      statuses: snapshotStatuses,
      source: 'snapshot',
      staleSnapshot: snapshotStatuses.length === 0,
    };
  }
}
