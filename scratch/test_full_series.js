const axios = require('axios');

async function testFullSeries() {
  const detailId = Buffer.from('https://okjatt.bond/tv/Hindi-web-series/Freedom-at-Midnight-Series-all-Seasons-Hindi-full.html').toString('base64');
  console.log(`Fetching details for Freedom at Midnight full series, ID: ${detailId}`);
  
  try {
    const res = await axios.get(`http://localhost:3000/api/movie-details?id=${detailId}`);
    console.log("Title:", res.data.title);
    console.log("IMDb ID:", res.data.imdbId);
    console.log("Plot:", res.data.plot);
    
    const episodes = res.data.downloads;
    console.log(`Total episodes found: ${episodes.length}`);
    
    const episodesWithFlag = episodes.filter(e => e.isEpisode);
    console.log(`Episodes with isEpisode = true: ${episodesWithFlag.length}`);
    
    if (episodesWithFlag.length > 0) {
      console.log("Sample episode details:", episodesWithFlag[0]);
      
      console.log("\nResolving direct streaming url of sample episode...");
      const epId = episodesWithFlag[0].url.split('?id=')[1];
      const streamRes = await axios.get(`http://localhost:3000/api/episode-stream?id=${epId}`);
      console.log("Direct stream url parsed successfully:", streamRes.data);
    } else {
      console.log("No episodes with isEpisode true. Downloads list:", episodes);
    }
  } catch (err) {
    console.error("Test failed:", err.message);
  }
}

testFullSeries();
