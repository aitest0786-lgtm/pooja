const axios = require('axios');

async function testRedirector() {
  const url = 'http://cdn2.checkyourlinks.shop/Punjabi/15451/Welcome-Jija-Ji-2026-Punjabi--hd-[OkJatt].mp4?id=15451&type=Hd&d=okjatthd.bond';
  const referer = 'https://okjatthd.bond/movies/download/punjabi/welcome-jija-ji-2026-punjabi-mp4-hd--15451.html';
  
  console.log(`Requesting ${url} with Referer: ${referer}...`);
  try {
    const res = await axios.head(url, { // use HEAD to check response headers only
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': referer
      },
      timeout: 10000
    });
    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
  } catch (err) {
    console.log("Failed. Status:", err.response ? err.response.status : 'No response');
    console.log("Response Body:", err.response ? err.response.data : err.message);
  }
}

testRedirector();
