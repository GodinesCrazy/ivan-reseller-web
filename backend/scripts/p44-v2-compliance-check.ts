import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import dotenv from 'dotenv';
const backendRoot = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(backendRoot, '.env'))) dotenv.config({ path: path.join(backendRoot, '.env') });

import { evaluatePortadaComplianceV2 } from '../src/services/ml-portada-compliance-v2.service';

async function main() {
  const buf = await fsp.readFile(path.resolve(backendRoot, '../artifacts/ml-image-packs/product-32722/cover_main.jpg'));
  const r = await evaluatePortadaComplianceV2(buf);
  console.log(JSON.stringify(r, null, 2));
}
main().catch(e => { console.error(e.message); process.exit(1); });
