#!/usr/bin/env tsx
import 'dotenv/config';
import axios from 'axios';

type LoginResponse = {
  token?: string;
  data?: { token?: string };
};

function getRequired(name: string): string {
  const value = (process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function getAuthToken(baseUrl: string): Promise<string> {
  const envToken = (process.env.AUTH_TOKEN || '').trim();
  if (envToken) return envToken;

  const username = getRequired('AUTH_USERNAME');
  const password = getRequired('AUTH_PASSWORD');

  const response = await axios.post<LoginResponse>(`${baseUrl}/api/auth/login`, {
    username,
    password,
  }, {
    timeout: 30000,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    throw new Error(`Login failed with status ${response.status}: ${JSON.stringify(response.data)}`);
  }

  const token = String(response.data?.token || response.data?.data?.token || '').trim();
  if (!token) {
    throw new Error('Login succeeded but token was not returned');
  }
  return token;
}

async function main(): Promise<void> {
  const backendUrl = getRequired('BACKEND_URL').replace(/\/$/, '');
  const token = await getAuthToken(backendUrl);
  const environment = (process.env.OAUTH_ENVIRONMENT || 'production').trim();

  const response = await axios.get(`${backendUrl}/api/debug/dropshipping-oauth-status`, {
    params: { environment },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
    validateStatus: () => true,
  });

  console.log('status:', response.status);
  console.log('body:', JSON.stringify(response.data, null, 2));

  if (response.status >= 400) {
    throw new Error(`OAuth status endpoint failed with status ${response.status}`);
  }

  if (response.data?.hasCredentials !== true) {
    throw new Error('Dropshipping OAuth validation failed: hasCredentials !== true');
  }

  console.log('? Dropshipping OAuth validation passed');
}

main().catch((error: any) => {
  console.error('? validate-dropshipping-oauth failed:', error?.message || error);
  process.exit(1);
});
