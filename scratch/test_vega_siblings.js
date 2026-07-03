const axios = require('axios');
const cheerio = require('cheerio');

async function testSiblings() {
  const url = 'https://vegamovie.ss/54585-lord-of-the-mysteries-specials-2026-season-1-chinese-audio-web-dl-720p-1080p-ep-01-added.html';
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    console.log("Dumping all a tags in entry-content:");
    $('.entry-content a').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      
      // Let's look up to 3 ancestors of this <a> tag
      let parentText = '';
      let parent = $(el).parent();
      let ancestors = [];
      while (parent.length > 0 && ancestors.length < 3) {
        ancestors.push(`${parent.prop('tagName')} (${parent.attr('class') || ''}): "${parent.text().trim().substring(0, 100).replace(/\n/g, ' ')}"`);
        parent = parent.parent();
      }
      
      console.log(`\nLink ${i + 1}: "${text}" -> ${href}`);
      console.log("Ancestors:", ancestors);
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testSiblings();
