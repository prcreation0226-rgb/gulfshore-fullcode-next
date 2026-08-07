import { PrismaClient } from './src/app/generated/prisma/client/index.js';
const prisma = new PrismaClient();
async function main() {
    const count = await prisma.property.count();
    console.log('Total properties in DB: ' + count);
}
main().finally(() => prisma.$disconnect());
