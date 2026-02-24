/**
 * AliExpress Time Service ? GMT+8 timestamp for Open Platform API.
 * Uses external UTC source (World Time API) so it works on Railway and any server regardless of local clock.
 * @see https://openservice.aliexpress.com/doc/doc.htm#/docId=118729&docId=1385
 */

import axios from 'axios';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Get current time in GMT+8 as yyyy-MM-dd HH:mm:ss (exact format required by AliExpress token API).
 * - Fetches UTC from https://worldtimeapi.org/api/timezone/Etc/UTC
 * - Converts to GMT+8
 * - No timezone suffix, no milliseconds
 * - Fallback: new Date(Date.now() + 8 * 3600000) if API fails
 */
export async function getAliExpressTimestamp(): Promise<string> {
  let baseMs = Date.now();
  try {
    const res = await axios.get<{ unixtime: number; datetime?: string }>(
      'https://worldtimeapi.org/api/timezone/Etc/UTC',
      { timeout: 5000 }
    );
    if (res.data?.unixtime != null) {
      baseMs = res.data.unixtime * 1000;
    }
  } catch {
    // Fallback: use local clock as UTC (Date.now() is UTC ms)
    baseMs = Date.now();
  }
  const gmt8Ms = baseMs + 8 * 3600 * 1000;
  const gmt8 = new Date(gmt8Ms);
  return (
    gmt8.getUTCFullYear() +
    '-' +
    pad(gmt8.getUTCMonth() + 1) +
    '-' +
    pad(gmt8.getUTCDate()) +
    ' ' +
    pad(gmt8.getUTCHours()) +
    ':' +
    pad(gmt8.getUTCMinutes()) +
    ':' +
    pad(gmt8.getUTCSeconds())
  );
}
