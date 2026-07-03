const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function verifyLiveHtml() {
  const url = 'https://nikkxmovie1-1.onrender.com/';
  console.log(`Checking live HTML: ${url}`);
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
      timeout: 10000,
      httpsAgent: httpsAgent
    });
    const html = res.data;
    
    // Find app.js script tags
    const appJsMatches = html.match(/src=["'].*?app\.js.*?["']/gi);
    console.log("Live app.js script tags:", appJsMatches);
    
    // Find style.css link tags
    const styleCssMatches = html.match(/href=["'].*?style\.css.*?["']/gi);
    console.log("Live style.css link tags:", styleCssMatches);
    
    // Find title tag
    const titleMatch = html.match(/<title>(.*?)<\/title>/gi);
    console.log("Live Title tag:", titleMatch);
  } catch (err) {
    console.error("Verification failed:", err.message);
  }
}

verifyLiveHtml();
