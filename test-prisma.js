const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  try {
    const cityName = 'NAPLES';
    const devName = 'PELICAN BAY';
    const where = { StandardStatus: 'Active', City: { equals: cityName }, OR: [ { Development: { equals: devName } }, { Community: { equals: devName } } ] };
    const total = await prisma.property.count({ where });
    console.log('Total:', total);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
