#!/usr/bin/env tsx
/**
 * Generate Payoneer client certificate (Node.js crypto, no OpenSSL).
 * Run: npm run generate:payoneer-cert
 */

import path from 'path';
import { generatePayoneerCertificate } from '../src/utils/generatePayoneerCertificate';

const securityDir = path.resolve(process.cwd(), 'security');
const result = generatePayoneerCertificate(securityDir);

console.log('PAYONEER CERT GENERATED SUCCESSFULLY');
console.log('CERT_PATH:', result.certPath);
console.log('KEY_PATH:', result.keyPath);
console.log('PAYONEER_CERT_READY = TRUE');
