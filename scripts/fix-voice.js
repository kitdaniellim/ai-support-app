const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const r = await p.contextProfile.updateMany({
    data: { voiceName: 'Polly.Ruth-Neural' }
  });
  console.log('Updated', r.count, 'profile(s) to Polly.Ruth-Neural');
  await p.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
