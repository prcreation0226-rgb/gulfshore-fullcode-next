import { syncTodaysActiveProperties } from "./src/jobs/syncProperties";

async function main() {
	const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
	console.log(`Starting manual sync since ${defaultStartDate}...`);
	await syncTodaysActiveProperties({ count: 0, date: defaultStartDate });
	console.log("Manual sync completed!");
}

main().catch(console.error);
