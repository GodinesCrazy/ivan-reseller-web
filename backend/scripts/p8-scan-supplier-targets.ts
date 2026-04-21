import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const TARGETS = [
  'cj',
  'cjdropshipping',
  'zendrop',
  'spocket',
  'dsers',
  '1688',
  'alibaba',
  'temu',
  'walmart',
  'target',
  'homedepot',
  'home depot',
  'supplier',
  'wholesale',
  'scraperapi',
  'zenrows',
  'aliexpress',
];

const SEARCH_ROOTS = [
  path.join(ROOT, 'backend', 'src'),
  path.join(ROOT, 'backend', 'scripts'),
  path.join(ROOT, 'docs'),
  path.join(ROOT, '.env'),
  path.join(ROOT, 'backend', '.env'),
];

function shouldSkip(filePath: string): boolean {
  return (
    filePath.includes(`${path.sep}node_modules${path.sep}`) ||
    filePath.includes(`${path.sep}dist${path.sep}`) ||
    filePath.includes(`${path.sep}.git${path.sep}`)
  );
}

function walk(entry: string, files: string[]) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(entry)) {
      walk(path.join(entry, child), files);
    }
    return;
  }
  if (shouldSkip(entry)) return;
  files.push(entry);
}

function scanFile(filePath: string) {
  const results: Array<{ target: string; lineNumber: number; line: string }> = [];
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return results;
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    for (const target of TARGETS) {
      if (lower.includes(target)) {
        results.push({
          target,
          lineNumber: index + 1,
          line: line.trim().slice(0, 220),
        });
      }
    }
  });
  return results;
}

async function main() {
  const files: string[] = [];
  for (const root of SEARCH_ROOTS) {
    walk(root, files);
  }

  const matches = files
    .map((filePath) => ({
      filePath: path.relative(ROOT, filePath),
      hits: scanFile(filePath),
    }))
    .filter((item) => item.hits.length > 0);

  const grouped = new Map<string, Array<{ filePath: string; lineNumber: number; line: string }>>();
  for (const match of matches) {
    for (const hit of match.hits) {
      const arr = grouped.get(hit.target) || [];
      arr.push({
        filePath: match.filePath,
        lineNumber: hit.lineNumber,
        line: hit.line,
      });
      grouped.set(hit.target, arr);
    }
  }

  console.log(
    JSON.stringify(
      {
        scannedFiles: files.length,
        targets: Object.fromEntries(
          [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, value]) => [key, value.slice(0, 40)])
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
