const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Checking DB...");
    const blogs = await prisma.blog.findMany({ select: { id: true, fbPostId: true, title: true } });
    console.log('Total Blogs in DB:', blogs.length);
    console.log('Sample:', blogs.slice(0, 3));
    
    // check if there are any without fbPostId
    const manualBlogs = blogs.filter(b => !b.fbPostId);
    console.log('Blogs without fbPostId:', manualBlogs.length);
}

main().catch(console.error).finally(async () => {
    await prisma.$disconnect();
});
