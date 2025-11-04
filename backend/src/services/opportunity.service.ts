import { prisma } from '../config/database';

export class OpportunityPersistenceService {
  async saveOpportunity(userId: number, data: {
    title: string;
    sourceMarketplace: string;
    costUsd: number;
    suggestedPriceUsd: number;
    profitMargin: number;
    roiPercentage: number;
    competitionLevel: string;
    marketDemand: string;
    confidenceScore: number;
    feesConsidered: Record<string, number>;
    targetMarketplaces: string[];
  }, analyses: Record<string, {
    marketplace: string;
    region: string;
    currency: string;
    listingsFound: number;
    averagePrice: number;
    minPrice: number;
    maxPrice: number;
    medianPrice: number;
    competitivePrice: number;
    topListings: any[];
  }>) {
    const opp = await prisma.opportunity.create({
      data: {
        userId,
        sourceMarketplace: data.sourceMarketplace,
        sourceProductId: null,
        title: data.title,
        costUsd: data.costUsd,
        suggestedPriceUsd: data.suggestedPriceUsd,
        profitMargin: data.profitMargin,
        roiPercentage: data.roiPercentage,
        competitionLevel: data.competitionLevel,
        marketDemand: data.marketDemand,
        confidenceScore: data.confidenceScore,
        feesConsidered: JSON.stringify(data.feesConsidered || {}),
        targetMarketplaces: JSON.stringify(data.targetMarketplaces || []),
      },
    });

    for (const key of Object.keys(analyses || {})) {
      const a = analyses[key];
      await prisma.competitionSnapshot.create({
        data: {
          opportunityId: opp.id,
          marketplace: a.marketplace,
          region: a.region,
          currency: a.currency,
          listingsFound: a.listingsFound,
          averagePrice: a.averagePrice,
          minPrice: a.minPrice,
          maxPrice: a.maxPrice,
          medianPrice: a.medianPrice,
          competitivePrice: a.competitivePrice,
          topListings: JSON.stringify(a.topListings || []),
        },
      });
    }

    return opp;
  }

  async listUserOpportunities(userId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, count] = await Promise.all([
      prisma.opportunity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.opportunity.count({ where: { userId } }),
    ]);
    return { items, count, page, limit };
  }

  async getOpportunity(userId: number, id: number) {
    const item = await prisma.opportunity.findFirst({ where: { id, userId } });
    if (!item) return null;
    const snapshots = await prisma.competitionSnapshot.findMany({ where: { opportunityId: id }, orderBy: { createdAt: 'desc' } });
    return { item, snapshots };
  }
}

const opportunityPersistence = new OpportunityPersistenceService();
export default opportunityPersistence;

