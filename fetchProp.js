const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const prop = await prisma.property.findUnique({
    where: { MLSNumber: '226029249' }
  });
  console.log("HOA Fee:", prop.NABOR_HOAFee, prop.NABOR_HOAFeeFrequency);
  console.log("Master HOA Fee:", prop.NABOR_MasterHOAFee, prop.NABOR_MasterHOAFeeFrequency);
  console.log("Association Fee:", prop.AssociationFee, prop.AssociationFeeFrequency);
  console.log("Condo Fee:", prop.CondoFee, prop.CondoFeeFrequency);
}

main().catch(console.error).finally(() => prisma.$disconnect());
