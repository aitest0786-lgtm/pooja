const axios = require('axios');
const cheerio = require('cheerio');

async function testElements() {
  const url = 'https://vegamovie.ss/54258-tamons-b-side-2026-season-1-hindi-english-japanese-audio-web-dl-720p-1080p-ep-02-added.html';
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    console.log("Dumping all elements inside .entry-content in order:");
    $('.entry-content').children().each((i, el) => {
      const tag = $(el).prop('tagName');
      const text = $(el).text().trim();
      const hasClass = $(el).attr('class') || '';
      if (text) {
        console.log(`${i}: [${tag}] (Class: ${hasClass}): "${text.substring(0, 150).replace(/\n/g, ' ')}"`);
      }
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testElements();
