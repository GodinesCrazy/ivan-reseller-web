SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count,
  LEFT(COALESCE(logs, ''), 800) AS logs_preview
FROM "_prisma_migrations"
WHERE migration_name = '20260406100000_phase2a_ml_channel_capability';
