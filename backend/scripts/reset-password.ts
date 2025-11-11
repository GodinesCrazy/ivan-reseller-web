import '../src/config/env';
import bcrypt from 'bcrypt';
import { prisma } from '../src/config/database';

const SALT_ROUNDS = 10;

function parseArgs(): { username: string; password: string } {
  const args = process.argv.slice(2);
  const usernameArg = args.find(arg => arg.startsWith('--username='));
  const passwordArg = args.find(arg => arg.startsWith('--password='));

  if (!usernameArg || !passwordArg) {
    console.error('Uso: npx tsx scripts/reset-password.ts --username=USER --password="NuevaClave"');
    process.exit(1);
  }

  const username = usernameArg.split('=')[1];
  const password = passwordArg.split('=')[1];

  if (!username || !password) {
    console.error('Debes especificar username y password.');
    process.exit(1);
  }

  return { username, password };
}

async function main() {
  const { username, password } = parseArgs();

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`❌ Usuario "${username}" no encontrado`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      updatedAt: new Date(),
    },
  });

  console.log(`✅ Contraseña actualizada para ${username}`);
}

main()
  .catch(error => {
    console.error('❌ Error reseteando contraseña:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

