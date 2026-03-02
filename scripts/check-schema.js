const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.contextProfile.findFirst()
  .then(r => {
    if (r) {
      console.log('voiceName:', r.voiceName, '| language:', r.language);
    } else {
      console.log('No profiles found');
    }
    return p.$disconnect();
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    return p.$disconnect();
  });
