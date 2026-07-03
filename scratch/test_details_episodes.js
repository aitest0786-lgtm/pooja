const axios = require('axios');

async function testDetails() {
  const detailId = Buffer.from('https://vegamovie.ss/54627-boonie-bears-future-reborn-2025-hindi-dual-audio-web-dl-720p-480p-1080p.html').toString('base64');
  console.log(`Querying detailId: ${detailId}`);
  try {
    const res = await axios.get(`http://localhost:3000/api/movie-details?id=${detailId}`);
    console.log("Status:", res.status);
    console.log("Movie Title:", res.data.title);
    console.log("IMDb ID:", res.data.imdbId);
    console.log(`Downloads count: ${res.data.downloads.length}`);
    console.log("First few download links metadata:");
    res.data.downloads.slice(0, 8).forEach((d, idx) => {
      console.log(`${idx + 1}: ${d.title} -> isEpisode: ${d.isEpisode}`);
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testDetails();
