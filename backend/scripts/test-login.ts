import '../src/config/env';
import { authService } from '../src/services/auth.service';

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('Usage: npx tsx scripts/test-login.ts <username> <password>');
    process.exit(1);
  }

  try {
    const result = await authService.login(username, password);
    console.log('Login success:', {
      user: result.user,
      tokenLength: result.token.length,
    });
  } catch (error: any) {
    console.error('Login failed:', error?.message || error);
    console.error(error);
  }
}

main()
  .catch((error) => {
    console.error('Unexpected error:', error);
  });

