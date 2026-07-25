const token = "cac17d1ac3cbf00980257de8c5902ea7";

async function testToken() {
	const source = "nabor";
	const url = `https://api.bridgedataoutput.com/api/v2/${source}/listings?access_token=${token}&limit=1`;
	console.log(`Testing new token against NABOR listings: ${url}`);
	try {
		const res = await fetch(url);
		if (res.ok) {
			const data = await res.json();
			console.log(`✅ SUCCESS! Found ${data.bundle?.length || 0} listings.`);
			if (data.bundle && data.bundle.length > 0) {
				console.log("Listing details:", JSON.stringify(data.bundle[0], null, 2).substring(0, 500));
			}
		} else {
			const text = await res.text();
			console.log(`❌ Failed with status: ${res.status}. Response: ${text}`);
		}
	} catch (e: any) {
		console.log("Exception:", e.message);
	}
}

testToken();
