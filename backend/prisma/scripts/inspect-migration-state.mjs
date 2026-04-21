import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
try {
  const rows = await p.$queryRawUnsafe(
    `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count,
            LEFT(COALESCE(logs, ''), 600) AS logs_preview
     FROM "_prisma_migrations"
     WHERE migration_name = '20260406100000_phase2a_ml_channel_capability'`
  );
  console.log('migration row:', JSON.stringify(rows, null, 2));

  const cols = await p.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'user_workflow_configs'
       AND column_name IN (
         'mlChannelMode','mlForeignSellerEnabled','mlInternationalPublishingEnabled',
         'mlReturnAddressConfigured','mlShippingOriginCountry','mlSellerOriginCountry'
       )
     ORDER BY column_name`
  );
  console.log('phase2a columns present:', JSON.stringify(cols, null, 2));
} finally {
  await p.$disconnect();
}
