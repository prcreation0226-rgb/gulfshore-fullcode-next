import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve("c:/gulfshore/.env") });

const BASE_URL = process.env.BRIDGE_BASE_URL || "https://api.bridgedataoutput.com/api/v2";
const API_KEY = process.env.BRIDGE_API_KEY || "cac17d1ac3cbf00980257de8c5902ea7";
const SOURCE = process.env.BRIDGE_SOURCE || "nabor";

async function main() {
  // Querying listing by MLSNumber/ListingId
  const url = `${BASE_URL}/${SOURCE}/listings?access_token=${API_KEY}&limit=1`;
  console.log("Fetching url:", url);
  
  const res = await fetch(url);
  const data = await res.json();
  
  const listing = data.bundle?.[0] || {};
  console.log("Keys in response:", Object.keys(listing));
  console.log("Media field exists:", !!listing.Media);
  console.log("Media field value:", JSON.stringify(listing.Media, null, 2));
}

main().catch(console.error);
