import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(JSON.stringify(users));
  await prisma.$disconnect();
}
main().catch(console.error);
