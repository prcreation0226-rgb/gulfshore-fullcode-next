const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const latestModified = await prisma.property.findMany({
    orderBy: { BridgeModificationTimestamp: 'desc' },
    take: 5,
    select: { ListingId: true, BridgeModificationTimestamp: true, OnMarketDate: true }
  });
  console.log('Latest Modified:', latestModified);

  const latestMarket = await prisma.property.findMany({
    orderBy: { OnMarketDate: 'desc' },
    take: 5,
    select: { ListingId: true, BridgeModificationTimestamp: true, OnMarketDate: true }
  });
  console.log('Latest On Market:', latestMarket);
  await prisma.$disconnect();
}
check();
