/**
 * Generate Payoneer client certificate using Node.js crypto only (no OpenSSL).
 * Creates RSA 2048 key pair + self-signed X.509 certificate, valid 3650 days.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CERT_DAYS = 3650;

function encodeLength(len: number): Buffer {
  if (len < 128) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeOid(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const first = parts[0] * 40 + parts[1];
  const rest = parts.slice(2);
  const enc: number[] = [first];
  for (const p of rest) {
    if (p >= 128) {
      enc.push(0x80 | (p >> 7));
      enc.push(p & 0x7f);
    } else enc.push(p);
  }
  const body = Buffer.from(enc);
  return Buffer.concat([Buffer.from([0x06]), encodeLength(body.length), body]);
}

function encodePrintableString(s: string): Buffer {
  const body = Buffer.from(s, 'ascii');
  return Buffer.concat([Buffer.from([0x13]), encodeLength(body.length), body]);
}

function encodeUtcTime(d: Date): Buffer {
  const s = d.toISOString().replace(/[-:]/g, '').replace('T', '').slice(0, 12) + 'Z';
  const body = Buffer.from(s, 'ascii');
  return Buffer.concat([Buffer.from([0x17]), encodeLength(body.length), body]);
}

function encodeInt(n: number | Buffer): Buffer {
  const buf = Buffer.isBuffer(n) ? n : (() => {
    if (n === 0) return Buffer.from([0]);
    const bytes: number[] = [];
    let x = n < 0 ? -n : n;
    while (x > 0) {
      bytes.unshift(x & 0xff);
      x >>= 8;
    }
    if (n < 0) bytes[0] |= 0x80;
    return Buffer.from(bytes);
  })();
  return Buffer.concat([Buffer.from([0x02]), encodeLength(buf.length), buf]);
}

function tag(tag: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(body.length), body]);
}

function encodeName(commonName: string, org = 'IvanReseller'): Buffer {
  const cn = tag(0x30,
    Buffer.concat([
      tag(0x06, encodeOid('2.5.4.3')),
      tag(0x13, encodePrintableString(commonName)),
    ])
  );
  const o = tag(0x30,
    Buffer.concat([
      tag(0x06, encodeOid('2.5.4.10')),
      tag(0x13, encodePrintableString(org)),
    ])
  );
  return tag(0x30, Buffer.concat([cn, o]));
}

export interface GenerateResult {
  keyPath: string;
  certPath: string;
  keyPem: string;
  certPem: string;
}

export function generatePayoneerCertificate(securityDir: string): GenerateResult {
  const keyPath = path.join(securityDir, 'payoneer.key');
  const certPath = path.join(securityDir, 'payoneer.crt');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs1', format: 'der' },
  });

  const now = new Date();
  const notAfter = new Date(now.getTime() + CERT_DAYS * 24 * 60 * 60 * 1000);

  const sha256RsaOid = encodeOid('1.2.840.113549.1.1.11');
  const algId = tag(0x30, Buffer.concat([sha256RsaOid, tag(0x05, Buffer.alloc(0))]));

  const name = encodeName('ivanreseller.com');
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;

  const validity = tag(0x30,
    Buffer.concat([
      tag(0x17, encodeUtcTime(now)),
      tag(0x17, encodeUtcTime(notAfter)),
    ])
  );

  const subjectPublicKeyInfo = publicKey as Buffer; // SPKI is already SEQUENCE

  const tbs = Buffer.concat([
    tag(0xa0, encodeInt(0)),
    tag(0x02, serial),
    algId,
    name,
    validity,
    name,
    subjectPublicKeyInfo,
  ]);
  const tbsCert = tag(0x30, tbs);

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(tbsCert);
  const sig = sign.sign({ key: privateKey as Buffer, format: 'der', type: 'pkcs1' });

  const cert = Buffer.concat([
    tbsCert,
    algId,
    tag(0x03, Buffer.concat([Buffer.from([0x00]), sig])),
  ]);
  const certDer = tag(0x30, cert);

  const keyPem = [
    '-----BEGIN RSA PRIVATE KEY-----',
    (privateKey as Buffer).toString('base64').match(/.{1,64}/g)!.join('\n'),
    '-----END RSA PRIVATE KEY-----',
  ].join('\n');

  const certPem = [
    '-----BEGIN CERTIFICATE-----',
    certDer.toString('base64').match(/.{1,64}/g)!.join('\n'),
    '-----END CERTIFICATE-----',
  ].join('\n');

  if (!fs.existsSync(securityDir)) {
    fs.mkdirSync(securityDir, { recursive: true });
  }
  fs.writeFileSync(keyPath, keyPem, { mode: 0o600 });
  fs.writeFileSync(certPath, certPem, { mode: 0o644 });

  return { keyPath, certPath, keyPem, certPem };
}

export function getSecurityDir(): string {
  return path.resolve(process.cwd(), 'security');
}
