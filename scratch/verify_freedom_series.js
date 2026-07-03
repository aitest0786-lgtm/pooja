const axios = require('axios');

async function verifyFreedom() {
  console.log("Searching for 'Freedom at Midnight' web series...");
  try {
    const listRes = await axios.get('http://localhost:3000/api/movies?s=Freedom%20at%20Midnight');
    const movies = listRes.data.movies;
    const series = movies.find(m => m.title.includes('Freedom at Midnight'));
    
    if (series) {
      console.log(`Found series: "${series.title}"`);
      
      console.log("Fetching details...");
      const detailRes = await axios.get(`http://localhost:3000/api/movie-details?id=${series.detailId}`);
      
      const episodes = detailRes.data.downloads.filter(d => d.isEpisode);
      console.log(`Total episodes found: ${episodes.length}`);
      
      if (episodes.length > 0) {
        console.log("Sample Episode:", episodes[0]);
        
        console.log(`\nResolving stream for: "${episodes[0].title}"...`);
        const epId = episodes[0].url.split('?id=')[1];
        const streamRes = await axios.get(`http://localhost:3000/api/episode-stream?id=${epId}`);
        console.log("Direct Stream URL Resolved:", streamRes.data);
      } else {
        console.log("No episodes with isEpisode true found. All downloads:", detailRes.data.downloads);
      }
    } else {
      console.log("Freedom at Midnight not found in search results.");
    }
  } catch (err) {
    console.error("Failed:", err.message);
    if (err.response) {
      console.error("Response:", err.response.data);
    }
  }
}

verifyFreedom();
