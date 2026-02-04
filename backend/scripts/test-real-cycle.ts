/**
 * Calls POST /api/internal/test-full-cycle and exits 0 if success=true, 1 if success=false.
 * Requires backend server running and INTERNAL_RUN_SECRET in env.
 * Run: npx tsx scripts/test-real-cycle.ts [keyword]
 */
const BASE = process.env.API_BASE_URL || 'http://localhost:4000';
const SECRET = process.env.INTERNAL_RUN_SECRET;

async function main() {
  const keyword = process.argv[2] || 'phone case';

  if (!SECRET) {
    console.error('INTERNAL_RUN_SECRET required');
    process.exit(1);
  }

  try {
    const res = await fetch(`${BASE}/api/internal/test-full-cycle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': SECRET,
      },
      body: JSON.stringify({ keyword }),
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));

    if (data.success === true) {
      process.exit(0);
    }
    process.exit(1);
  } catch (err: any) {
    console.error('Error:', err?.message || err);
    process.exit(1);
  }
}

main();
