import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve("c:/gulfshore/.env") });

// Dynamic import to prevent hoisting issues
import("./prisma").then(async ({ default: prisma }) => {
  const property = await prisma.property.findFirst({
    where: {
      MLSNumber: "226025738"
    }
  });

  console.log("PROPERTY DATA:", JSON.stringify(property, null, 2));
  await prisma.$disconnect();
}).catch(console.error);
