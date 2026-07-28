const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProp() {
  const p = await prisma.property.findUnique({
    where: { ListingId: '226026837' },
    select: { id: true, ListingId: true, Slug: true, StandardStatus: true }
  });
  console.log(JSON.stringify(p, null, 2));
  await prisma.$disconnect();
}
checkProp();
