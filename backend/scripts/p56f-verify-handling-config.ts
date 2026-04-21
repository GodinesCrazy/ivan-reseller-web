import '../src/config/env';
import { prisma } from '../src/config/database';
import { WorkflowConfigService } from '../src/services/workflow-config.service';
(async () => {
  const cfg = await prisma.userWorkflowConfig.findFirst({ where: { userId: 1 } });
  console.log('DB mlHandlingTimeDays:', cfg?.mlHandlingTimeDays);
  // Set to 30 if null
  if (cfg?.mlHandlingTimeDays == null) {
    await prisma.userWorkflowConfig.update({ where: { userId: 1 }, data: { mlHandlingTimeDays: 30 } });
    console.log('Set to 30');
  }
  const svc = new WorkflowConfigService();
  const days = await svc.getMlHandlingTimeDays(1);
  console.log('getMlHandlingTimeDays(userId=1):', days);
})().catch(e => console.error(e?.message)).finally(() => prisma.$disconnect());
