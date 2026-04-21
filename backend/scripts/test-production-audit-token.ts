import '../src/config/env';
import axios from 'axios';
import { authService } from '../src/services/auth.service';

async function main() {
  const url = process.argv[2] || 'https://ivan-reseller-backend-production.up.railway.app/api/setup-status';
  const token = authService.generateToken(1, 'admin', 'ADMIN');

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    validateStatus: () => true,
    timeout: 30000,
  });

  console.log(
    JSON.stringify(
      {
        url,
        status: response.status,
        data: response.data,
      },
      null,
      2
    )
  );
}

main().catch((error: any) => {
  console.error(
    JSON.stringify(
      {
        message: error?.message || String(error),
        responseStatus: error?.response?.status,
        responseData: error?.response?.data,
      },
      null,
      2
    )
  );
  process.exit(1);
});
