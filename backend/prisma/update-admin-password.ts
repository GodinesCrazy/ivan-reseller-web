import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function updateAdminPassword() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.update({
    where: { username: 'admin' },
    data: { password: adminPassword }
  });
  
  console.log('✅ Password admin actualizado correctamente');
  await prisma.$disconnect();
}

updateAdminPassword();
