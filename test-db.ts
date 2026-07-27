import prisma from "./src/lib/prisma";

async function main() {
    try {
        const notifications = await prisma.scheduledNotification.findMany();
        console.log("Notifications found:", notifications.length);
        
        const tours = await prisma.scheduleTour.findMany();
        console.log("Tours found:", tours.length);
    } catch (e) {
        console.error("Error querying DB:", e);
    }
}
main().finally(() => prisma.$disconnect());
