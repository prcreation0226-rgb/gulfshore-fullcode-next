const axios = require("axios");

async function generateExample() {
	try {
		// 1. Get the community ID
		console.log("Fetching community data...");
		const res = await axios.get("http://127.0.0.1:3000/api/community/Vanderbilt Lakes");
		
		if (!res.data || !res.data.data) {
			console.log("Could not find Vanderbilt Lakes");
			return;
		}

		const communityId = res.data.data.id;
		console.log(`Found Vanderbilt Lakes with ID: ${communityId}`);

		// 2. Call the AI generator API
		console.log("Calling AI Generator (this may take a few seconds)...");
		const aiRes = await axios.post("http://127.0.0.1:3000/api/admin/generate-community-ai", {
			communityId: communityId,
			isGolfCommunity: false
		});

		console.log("Success!");
		console.log("Generated Description:");
		console.log(aiRes.data.community.description.substring(0, 500) + "...");
	} catch (error) {
		console.error("Error:", error.response ? error.response.data : error.message);
	}
}

generateExample();
