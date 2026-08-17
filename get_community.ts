const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.community.findFirst({
    where: { name: { contains: "Vanderbilt Lakes" } }
  });
  console.log(c);
}
main();
