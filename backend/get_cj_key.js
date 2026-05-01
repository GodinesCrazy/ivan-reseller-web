const { PrismaClient } = require('@prisma/client');
const { decrypt } = require('./src/utils/encryption');

const prisma = new PrismaClient();

async function main() {
  const creds = await prisma.apiCredential.findFirst({
    where: { apiName: 'cj-dropshipping', environment: 'production' }
  });

  if (creds && creds.credentials) {
    const decrypted = decrypt(creds.credentials);
    console.log(decrypted);
  } else {
    console.log('No credentials found');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
