const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const blogs = await prisma.blog.findMany({ select: { id: true, fbPostId: true, title: true } });
    console.log('Blogs in DB:', blogs.length);
    console.log(blogs.slice(0, 5));
}
main().catch(console.error).finally(() => prisma.$disconnect());
