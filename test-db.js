const { PrismaClient } = require('./src/app/generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.community.findFirst({ where: { name: 'MEDITERRA' } });
  console.log(JSON.stringify(c, null, 2));
}

main().finally(() => prisma.$disconnect());
