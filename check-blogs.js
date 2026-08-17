const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const blogs = await prisma.blog.findMany({
    select: { title: true, category: true, published: true }
  });
  console.log("Total blogs:", blogs.length);
  console.log(blogs.slice(0, 5));
}
main();
