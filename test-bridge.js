const url = "https://api.bridgedataoutput.com/api/v2/nabor/listings?access_token=cac17d1ac3cbf00980257de8c5902ea7&limit=10&offset=0&StandardStatus.eq=Closed";

fetch(url, { signal: AbortSignal.timeout(5000) })
    .then(res => res.json())
    .then(data => {
        console.log("Success! Items:", data.bundle?.length);
    })
    .catch(err => console.error("Error:", err.message));
