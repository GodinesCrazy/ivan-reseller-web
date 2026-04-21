/**
 * Run one batch of supplier post-sale sync (status + tracking) without starting the API.
 * Uses same logic as BullMQ worker `supplier-postsale-sync`.
 */
import 'dotenv/config';
import { runSupplierPostsaleSyncBatch } from '../src/services/supplier-postsale-sync.service';

async function main(): Promise<void> {
  const r = await runSupplierPostsaleSyncBatch();
  console.log('[supplier-postsale-sync-once]', JSON.stringify(r, null, 2));
}

void main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
