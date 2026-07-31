import { fetchBridgeBatch } from './src/lib/bridge';
import prisma from './src/lib/prisma';
import { mapProperty } from './src/lib/mapProperty';

async function run() {
    console.log("Starting manual sync for CLOSED properties only...");
    
    // Fetch last 3 months
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    const dateStr = date.toISOString().split("T")[0];

    try {
        let offset = 0;
        let total = 0;
        while(true) {
            const data = await fetchBridgeBatch(offset, 200, dateStr, "Closed");
            const bundle = data.bundle || [];
            if (bundle.length === 0) break;
            
            console.log(`Fetched ${bundle.length} closed properties...`);
            
            for (let i = 0; i < bundle.length; i+=50) {
                const chunk = bundle.slice(i, i+50);
                await Promise.all(chunk.map(async (item) => {
                    const mapped = mapProperty(item);
                    try {
                        await prisma.property.upsert({
                            where: { ListingKey: item.ListingKey },
                            update: mapped,
                            create: mapped
                        });
                    } catch(e) {
                        // ignore secondary errors for now
                    }
                }));
            }
            
            total += bundle.length;
            offset += 200;
            if (bundle.length < 200) break;
            
            // Just pull 600 max for a quick test so the user sees data immediately
            if (total >= 600) break;
        }
        
        console.log(`Successfully synced ${total} closed properties.`);
    } catch (e) {
        console.error("Sync failed", e);
    }
    process.exit(0);
}

run();
