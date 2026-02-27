import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
import { CredentialsManager, clearCredentialsCache } from '../src/services/credentials-manager.service';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main(): Promise<void> {
  const userId = Number(process.env.EBAY_LOCATION_USER_ID || 1);
  const locationKey = (process.env.EBAY_LOCATION_KEY || 'default_location').trim();

  const entry = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'production');
  const creds: Record<string, any> = (entry?.credentials as any) || {};
  const appId = String(creds.appId || process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || '').trim();
  const certId = String(creds.certId || process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET || '').trim();
  const refreshToken = String(creds.refreshToken || process.env.EBAY_REFRESH_TOKEN || '').trim();
  let accessToken = String(creds.token || process.env.EBAY_OAUTH_TOKEN || process.env.EBAY_TOKEN || '').trim();

  if (!appId || !certId) {
    throw new Error('Missing EBAY_APP_ID/EBAY_CERT_ID');
  }

  if (!accessToken && refreshToken) {
    const basic = Buffer.from(`${appId}:${certId}`).toString('base64');
    const tokenResp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
    const tokenData: any = await tokenResp.json().catch(() => ({}));
    console.log('refresh_status', tokenResp.status);
    console.log('refresh_error', tokenData?.error || null);
    console.log('refresh_error_description', tokenData?.error_description || null);
    if (!tokenResp.ok || !tokenData?.access_token) {
      throw new Error('Failed to refresh eBay token');
    }

    accessToken = String(tokenData.access_token).trim();
    await CredentialsManager.saveCredentials(
      userId,
      'ebay',
      {
        ...creds,
        appId,
        certId,
        refreshToken: refreshToken || creds.refreshToken,
        token: accessToken,
        sandbox: false,
        expiresAt: tokenData?.expires_in
          ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
          : undefined,
      },
      'production',
      { scope: 'user' }
    );
    clearCredentialsCache(userId, 'ebay', 'production');
  }

  if (!accessToken) {
    throw new Error('No eBay access token available');
  }

  const payload = {
    name: 'Ivan Default Warehouse',
    merchantLocationStatus: 'ENABLED',
    locationTypes: ['WAREHOUSE'],
    location: {
      address: {
        addressLine1: '2 Norte 468',
        city: 'Concepcion',
        stateOrProvince: 'BIO BIO',
        postalCode: '400084',
        country: 'CL',
      },
    },
  };

  const putResp = await fetch(`https://api.ebay.com/sell/inventory/v1/location/${encodeURIComponent(locationKey)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
    },
    body: JSON.stringify(payload),
  });
  const putBody = await putResp.text();
  console.log('put_status', putResp.status);
  console.log('put_body', putBody);

  const getResp = await fetch(`https://api.ebay.com/sell/inventory/v1/location/${encodeURIComponent(locationKey)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Language': 'en-US',
    },
  });
  const getBody = await getResp.text();
  console.log('get_status', getResp.status);
  console.log('get_body', getBody);
}

main().catch((err: any) => {
  console.error(err?.message || err);
  process.exit(1);
});

