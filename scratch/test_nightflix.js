const axios = require('axios');

async function testNightflix() {
  try {
    console.log("Fetching nightflix.to homepage...");
    const res = await axios.get('https://www.nightflix.to/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    console.log("Status:", res.status);
    console.log("Length of HTML:", res.data.length);
    console.log("HTML Preview:", res.data.substring(0, 1000));
  } catch (err) {
    console.error("Error fetching nightflix.to:", err.message);
    if (err.response) {
      console.log("Error Status:", err.response.status);
      console.log("Error Data Preview:", String(err.response.data).substring(0, 500));
    }
  }
}

testNightflix();
