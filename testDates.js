const { PrismaClient } = require('./src/app/generated/prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: "mysql://root:6O6V43l4Qj7k8H5vB8sX@viaduct.proxy.rlwy.net:49942/railway" } } // fake URL just to see if it instantiates, wait no, let's just use the env variable.
});
