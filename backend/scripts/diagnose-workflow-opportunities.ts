/**
 * Diagnóstico: por qué el workflow tipo search no encuentra oportunidades.
 * Simula el flujo executeSearchWorkflow -> selectOptimalQuery -> findOpportunities.
 *
 * Run: npx tsx scripts/diagnose-workflow-opportunities.ts [userId]
 */
import opportunityFinder from '../src/services/opportunity-finder.service';
import { trendSuggestionsService } from '../src/services/trend-suggestions.service';
import { trendsService } from '../src/services/trends.service';
import { workflowConfigService } from '../src/services/workflow-config.service';

const DEFAULT_SEARCH_QUERIES = [
  'wireless earbuds',
  'phone case',
  'organizador cocina',
  'yoga mat',
];

async function selectOptimalQueryForWorkflow(userId: number): Promise<string> {
  const suggestions = await trendSuggestionsService.generateKeywordSuggestions(userId, 10);
  const highMedium = suggestions
    .filter((s) => s.priority === 'high' || s.priority === 'medium')
    .map((s) => s.keyword);
  const pool1 = [...new Set(highMedium)].slice(0, 5);
  if (pool1.length > 0) {
    return pool1[Math.floor(Math.random() * pool1.length)];
  }
  const trending = await trendsService.getTrendingKeywords({
    userId,
    maxKeywords: 10,
    region: 'US',
  });
  const pool2 = trending.map((t) => t.keyword).slice(0, 5);
  if (pool2.length > 0) {
    return pool2[Math.floor(Math.random() * pool2.length)];
  }
  return DEFAULT_SEARCH_QUERIES[Math.floor(Math.random() * DEFAULT_SEARCH_QUERIES.length)];
}

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10) || 1;
  console.log('\n=== Diagnóstico: workflow sin oportunidades ===\n');
  console.log('UserId:', userId);

  // 1. Credenciales
  const hasEnvKey = !!(
    (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim()
  );
  const hasEnvSecret = !!(
    (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim()
  );
  console.log('\n1. Credenciales AliExpress Affiliate (env):');
  console.log('   ALIEXPRESS_*_APP_KEY:', hasEnvKey ? 'OK' : 'MISSING');
  console.log('   ALIEXPRESS_*_APP_SECRET:', hasEnvSecret ? 'OK' : 'MISSING');

  // 2. Query (simula selectOptimalQueryForWorkflow)
  let query: string;
  try {
    query = await selectOptimalQueryForWorkflow(userId);
    console.log('\n2. Query seleccionado (selectOptimalQueryForWorkflow):', query);
  } catch (err: any) {
    query = 'phone case';
    console.log('\n2. Query (fallback por error):', query, '-', err?.message);
  }

  // 3. Environment
  let environment: 'sandbox' | 'production' = 'production';
  try {
    environment = await workflowConfigService.getUserEnvironment(userId);
    console.log('\n3. Environment del usuario:', environment);
  } catch (err: any) {
    console.log('\n3. Environment (fallback production):', environment, '-', err?.message);
  }

  const filters = {
    query,
    maxItems: 10,
    marketplaces: ['ebay'] as const,
    environment,
  };

  // 4. Con skipTrendsValidation: true (evita descarte por trends)
  let resultWithSkip: { opportunities: any[]; diagnostics?: any } = { opportunities: [] };
  console.log('\n4. findOpportunitiesWithDiagnostics (skipTrendsValidation: true)');
  try {
    resultWithSkip = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
      ...filters,
      skipTrendsValidation: true,
    });
    console.log('   discovered:', resultWithSkip.diagnostics?.discovered ?? 'N/A');
    console.log('   sourcesTried:', resultWithSkip.diagnostics?.sourcesTried?.join(', ') ?? 'N/A');
    console.log('   reason:', resultWithSkip.diagnostics?.reason ?? 'N/A');
    console.log('   opportunities.length:', resultWithSkip.opportunities.length);
    if (resultWithSkip.opportunities.length > 0) {
      const s = resultWithSkip.opportunities[0];
      console.log('   sample:', {
        title: s.title?.substring(0, 50),
        costUsd: s.costUsd,
        roi: s.roiPercentage,
      });
    }
  } catch (err: any) {
    console.log('   ERROR:', err?.message);
  }

  // 5. Sin skipTrendsValidation (como el workflow real)
  console.log('\n5. findOpportunitiesWithDiagnostics (skipTrendsValidation: false, como workflow)');
  try {
    const resultNoSkip = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
      ...filters,
      skipTrendsValidation: false,
    });
    console.log('   discovered:', resultNoSkip.diagnostics?.discovered ?? 'N/A');
    console.log('   sourcesTried:', resultNoSkip.diagnostics?.sourcesTried?.join(', ') ?? 'N/A');
    console.log('   reason:', resultNoSkip.diagnostics?.reason ?? 'N/A');
    console.log('   opportunities.length:', resultNoSkip.opportunities.length);
    if (resultNoSkip.opportunities.length > 0) {
      const s = resultNoSkip.opportunities[0];
      console.log('   sample:', {
        title: s.title?.substring(0, 50),
        costUsd: s.costUsd,
        roi: s.roiPercentage,
      });
    }
    const diff =
      (resultWithSkip.opportunities.length || 0) - (resultNoSkip.opportunities.length || 0);
    if (diff > 0) {
      console.log('   >>> Trends validation descartó', diff, 'productos. Considera skipTrendsValidation: true en workflow.');
    }
  } catch (err: any) {
    console.log('   ERROR:', err?.message);
  }

  console.log('\n=== Fin diagnóstico ===\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
