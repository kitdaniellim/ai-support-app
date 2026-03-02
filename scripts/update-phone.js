const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const r = await p.business.updateMany({
    where: { id: 'cmltzf4mu0000i83shqgs7m6e' },
    data: { phoneNumber: '+14158497303' }
  });
  console.log('Updated:', r.count);

  const biz = await p.business.findFirst({ where: { isActive: true } });
  console.log('Business phone now:', biz?.phoneNumber);
  await p.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
