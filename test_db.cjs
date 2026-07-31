const { PrismaClient } = require('./src/app/(admin)/admin/generated/prisma');
const prisma = new PrismaClient();

async function check() {
	const msgs = await prisma.aIChatHistory.findMany({
		orderBy: { createdAt: 'desc' },
		take: 20
	});
	console.log(JSON.stringify(msgs, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
