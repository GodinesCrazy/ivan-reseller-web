import '../src/config/env';
import { prisma } from '../src/config/database';

const CANDIDATES = [
  'aliexpress-affiliate',
  'aliexpress-dropshipping',
  'aliexpress',
  'alibaba',
  'cj',
  'cjdropshipping',
  'zendrop',
  'spocket',
  'dsers',
  '1688',
  'scraperapi',
  'zenrows',
] as const;

async function main() {
  const rows = await prisma.apiCredential.findMany({
    where: {
      apiName: { in: [...CANDIDATES] as any },
      isActive: true,
    },
    select: {
      userId: true,
      apiName: true,
      environment: true,
      updatedAt: true,
      scope: true,
    },
    orderBy: [{ apiName: 'asc' }, { environment: 'asc' }],
  });

  const grouped = CANDIDATES.map((apiName) => ({
    apiName,
    entries: rows.filter((row) => row.apiName === apiName),
  }));

  console.log(JSON.stringify({ grouped }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
