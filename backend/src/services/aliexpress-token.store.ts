/**
 * AliExpress OAuth token storage: in-memory with optional file fallback.
 */

import fs from 'fs';
import path from 'path';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let memoryStore: TokenData | null = null;

const FILE_PATH = process.env.ALIEXPRESS_TOKEN_FILE
  ? path.resolve(process.env.ALIEXPRESS_TOKEN_FILE)
  : path.join(process.cwd(), '.aliexpress-token.json');

function readFromFile(): TokenData | null {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, 'utf8');
      const data = JSON.parse(raw) as TokenData;
      if (data.accessToken && data.refreshToken && data.expiresAt) {
        return data;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function writeToFile(data: TokenData): void {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 0), 'utf8');
  } catch {
    // ignore
  }
}

/**
 * Get current token (memory first, then file).
 */
export function getToken(): TokenData | null {
  if (memoryStore) return memoryStore;
  memoryStore = readFromFile();
  return memoryStore;
}

/**
 * Set token (memory + optional file).
 */
export function setToken(tokenData: TokenData): void {
  memoryStore = tokenData;
  writeToFile(tokenData);
}
