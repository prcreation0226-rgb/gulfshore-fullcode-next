import { syncTodaysActiveProperties } from './src/jobs/syncProperties';

async function run() {
    console.log("Starting manual sync...");
    try {
        await syncTodaysActiveProperties({ count: 1 });
        console.log("Sync finished successfully.");
    } catch (e) {
        console.error("Sync failed", e);
    }
    process.exit(0);
}

run();
