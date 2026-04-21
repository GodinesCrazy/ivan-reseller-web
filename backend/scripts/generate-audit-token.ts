import '../src/config/env';
import { authService } from '../src/services/auth.service';

function parseArgs(): { userId: number; username: string; role: string } {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {};
  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    if (key.startsWith('--')) {
      values[key.slice(2)] = rest.join('=');
    }
  }

  const userId = Number(values.userId || '1');
  const username = values.username || 'admin';
  const role = values.role || 'ADMIN';

  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Invalid userId');
  }

  return { userId, username, role };
}

async function main() {
  const { userId, username, role } = parseArgs();
  const token = authService.generateToken(userId, username, role);
  console.log(token);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
