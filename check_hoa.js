const { PrismaClient } = require('./src/app/generated/prisma/client/index.js');
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.property.findFirst({ where: { MLSNumber: '226006948' } });
  if (p && p.raw) {
    const keys = Object.keys(p.raw);
    const hoaKeys = keys.filter(k => /hoa|fee|assoc/i.test(k));
    console.log("HOA Keys:", hoaKeys);
    hoaKeys.forEach(k => console.log(`${k}: ${p.raw[k]}`));
  } else {
    console.log('Not found');
  }
}
main().finally(() => prisma.$disconnect());
