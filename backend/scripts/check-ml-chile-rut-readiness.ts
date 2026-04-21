import fs from 'node:fs';
import path from 'node:path';

import { classifyMlChileTaxIdReadiness } from '../src/utils/ml-chile-tax-id-readiness';

const ROOTS = ['src', 'scripts'];
const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);

const CHILE_SPECIFIC_TERMS = [/rut/gi, /tax[_ -]?id/gi, /chile/gi];
const GENERIC_TAX_TERMS = [/tax/gi, /customs/gi, /document/gi, /vat/gi, /invoice/gi];
const CHECKOUT_TERMS = [/address/gi, /shipping/gi, /checkout/gi, /purchase/gi, /fulfillment/gi];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
      continue;
    }

    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  }

  return acc;
}

function countRegexMatches(content: string, expressions: RegExp[]): number {
  return expressions.reduce((sum, expression) => sum + (content.match(expression)?.length ?? 0), 0);
}

function relativeToBackend(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function main(): void {
  const files = ROOTS.flatMap((root) => walk(path.join(process.cwd(), root)));
  const matches: Array<Record<string, unknown>> = [];

  let chileSpecificHitCount = 0;
  let genericTaxOrCustomsHitCount = 0;
  let checkoutFieldHitCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const chileHits = countRegexMatches(content, CHILE_SPECIFIC_TERMS);
    const genericHits = countRegexMatches(content, GENERIC_TAX_TERMS);
    const checkoutHits = countRegexMatches(content, CHECKOUT_TERMS);

    if (chileHits || genericHits || checkoutHits) {
      matches.push({
        file: relativeToBackend(file),
        chileSpecificHits: chileHits,
        genericTaxOrCustomsHits: genericHits,
        checkoutFieldHits: checkoutHits,
      });
    }

    chileSpecificHitCount += chileHits;
    genericTaxOrCustomsHitCount += genericHits;
    checkoutFieldHitCount += checkoutHits;
  }

  const classification = classifyMlChileTaxIdReadiness({
    chileSpecificHitCount,
    genericTaxOrCustomsHitCount,
    checkoutFieldHitCount,
  });

  const result = {
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    chileSpecificHitCount,
    genericTaxOrCustomsHitCount,
    checkoutFieldHitCount,
    classification,
    topMatches: matches
      .sort(
        (a, b) =>
          Number(b.chileSpecificHits) +
          Number(b.genericTaxOrCustomsHits) +
          Number(b.checkoutFieldHits) -
          (Number(a.chileSpecificHits) +
            Number(a.genericTaxOrCustomsHits) +
            Number(a.checkoutFieldHits)),
      )
      .slice(0, 20),
  };

  const outputDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'p19-rut-readiness.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );

  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  const result = {
    script: 'check-ml-chile-rut-readiness',
    error: error instanceof Error ? error.message : String(error),
  };
  const outputDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'p19-rut-readiness.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
