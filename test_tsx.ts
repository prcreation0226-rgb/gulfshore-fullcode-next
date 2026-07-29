import prisma from './src/lib/prisma';
async function run() {
	const msgs = await prisma.aIChatHistory.findMany({
		orderBy: { createdAt: 'desc' },
		take: 10
	});
	console.log(JSON.stringify(msgs, null, 2));
}
run().catch(console.error).finally(() => process.exit(0));
