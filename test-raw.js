const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  try {
    const prop = await prisma.property.findFirst({
        where: { MLSNumber: '226021652' }
    });
    console.log(JSON.stringify(prop.raw, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
