/**
 * Phase 7: Global Demand Radar
 * Collects demand signals from external sources (Google Trends, etc.), normalizes trendScore 0–100,
 * stores in demand_signals. Optional trend alerts (notification / auto opportunity).
 */

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { trendsService } from './trends.service';

const DEMAND_RADAR_ALERT_TREND_SCORE = Number(process.env.DEMAND_RADAR_ALERT_TREND_SCORE || '70');
const DEMAND_RADAR_AUTO_OPPORTUNITY = process.env.DEMAND_RADAR_AUTO_OPPORTUNITY === 'true';

export interface DemandRadarRunResult {
  signalsStored: number;
  alertsSent: number;
  errors: string[];
}

function toDecimal(n: number): Decimal {
  return new Decimal(Math.min(100, Math.max(0, n)));
}

function confidenceFromPriority(p: string): number {
  if (p === 'high') return 0.85;
  if (p === 'medium') return 0.6;
  return 0.4;
}

/**
 * Fetch signals from configured sources and store in demand_signals.
 */
export async function runGlobalDemandRadar(): Promise<DemandRadarRunResult> {
  const result: DemandRadarRunResult = { signalsStored: 0, alertsSent: 0, errors: [] };

  try {
    const signalsToStore: Array<{
      source: string;
      externalProductId: string | null;
      keyword: string;
      trendScore: number;
      demandScore: number | null;
      confidence: number;
      metadata: object | null;
    }> = [];

    // Google Trends (via trends.service)
    try {
      const keywords = await trendsService.getTrendingKeywords({
        region: 'US',
        days: 7,
        maxKeywords: 50,
        userId: undefined,
      });
      for (const k of keywords) {
        const trendScore = typeof k.score === 'number' ? Math.min(100, Math.max(0, k.score)) : 50;
        const demandScore = typeof k.searchVolume === 'number' ? Math.min(100, Math.log1p(k.searchVolume) * 8) : null;
        const confidence = confidenceFromPriority(k.priority || 'low');
        signalsToStore.push({
          source: 'google_trends',
          externalProductId: null,
          keyword: k.keyword || '',
          trendScore,
          demandScore,
          confidence,
          metadata: {
            region: k.region,
            trend: k.trend,
            searchVolume: k.searchVolume,
            category: k.category,
          },
        });
      }
    } catch (e: any) {
      result.errors.push(`google_trends: ${e?.message || String(e)}`);
      logger.warn('[DEMAND-RADAR] Google Trends fetch failed', { error: e?.message });
    }

    // Dedupe by (source, keyword) and keep latest trendScore
    const seen = new Map<string, number>();
    const deduped: typeof signalsToStore = [];
    for (const s of signalsToStore) {
      const key = `${s.source}:${s.keyword.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.set(key, deduped.length);
      deduped.push(s);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (const s of deduped) {
      try {
        await prisma.demandSignal.create({
          data: {
            source: s.source,
            externalProductId: s.externalProductId,
            keyword: s.keyword,
            trendScore: toDecimal(s.trendScore),
            demandScore: s.demandScore != null ? toDecimal(s.demandScore) : null,
            confidence: new Decimal(s.confidence),
            metadata: s.metadata as any,
          },
        });
        result.signalsStored++;

        if (s.trendScore >= DEMAND_RADAR_ALERT_TREND_SCORE && s.confidence >= 0.6) {
          try {
            const admins = await prisma.user.findMany({
              where: { role: 'ADMIN', isActive: true },
              select: { id: true },
            });
            const adminIds = admins.map((a) => a.id);
            if (adminIds.length > 0) {
              const { notificationService } = await import('./notification.service');
              notificationService.sendToUser(adminIds, {
                type: 'TREND_ALERT',
                title: 'Alta demanda detectada',
                message: `Keyword "${s.keyword}" (${s.trendScore.toFixed(0)}/100, ${s.source})`,
                priority: 'NORMAL',
                category: 'DEMAND_RADAR',
                data: { keyword: s.keyword, trendScore: s.trendScore, source: s.source, confidence: s.confidence },
              } as any);
              result.alertsSent++;
            }
          } catch {
            // ignore
          }
          if (DEMAND_RADAR_AUTO_OPPORTUNITY) {
            // Optional: create opportunity for first admin user (stub - real creation would need title/cost from research)
            logger.info('[DEMAND-RADAR] Auto opportunity disabled or skipped; enable DEMAND_RADAR_AUTO_OPPORTUNITY and implement create', {
              keyword: s.keyword,
            });
          }
        }
      } catch (e: any) {
        result.errors.push(`store ${s.keyword}: ${e?.message || String(e)}`);
      }
    }

    logger.info('[DEMAND-RADAR] Run complete', result);
    return result;
  } catch (e: any) {
    logger.error('[DEMAND-RADAR] Run failed', { error: e?.message });
    result.errors.push(e?.message || String(e));
    return result;
  }
}
