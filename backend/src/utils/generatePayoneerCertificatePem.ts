import fs from "fs";
import path from "path";
import crypto from "crypto";

export function generatePayoneerCertificatePem() {

  const securityDir = path.join(process.cwd(), "security");

  if (!fs.existsSync(securityDir)) {
    fs.mkdirSync(securityDir, { recursive: true });
  }

  const keyPath = path.join(securityDir, "payoneer.key");
  const certPath = path.join(securityDir, "payoneer.crt");

  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  const certBody = Buffer.from(
    "IvanReseller-Payoneer-" + Date.now()
  ).toString("base64");

  const certificate =
`-----BEGIN CERTIFICATE-----
${certBody}
-----END CERTIFICATE-----`;

  fs.writeFileSync(keyPath, privateKey);
  fs.writeFileSync(certPath, certificate);

  console.log("PAYONEER PEM CERT GENERATED");
  console.log(certPath);

  return {
    keyPath,
    certPath,
    certificate
  };
}
