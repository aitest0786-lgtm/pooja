const axios = require('axios');
const cheerio = require('cheerio');

async function testVox() {
  const url = 'https://vegamovie.ss/54720-the-legend-of-vox-machina-2026-season-4-hindi-english-audio-web-dl-720p-480p-1080p-ep-01-to-03-added.html';
  try {
    console.log("Fetching Vox Machina page...");
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    console.log("Analyzing page layout paragraphs around links:");
    // Print text of all paragraphs that have classes related to headings, post, entry-content, etc.
    $('.entry-content p, .entry-content h3, .entry-content h2, .entry-content h4').each((i, el) => {
      const text = $(el).text().trim();
      const hasLinks = $(el).find('a').length > 0;
      if (text && (text.includes('Episode') || text.includes('EP-') || text.includes('Download') || hasLinks)) {
        console.log(`\nNode ${i} [${$(el).prop('tagName')}]:`);
        console.log("Text:", text.substring(0, 300));
        if (hasLinks) {
          console.log("Links inside this node:");
          $(el).find('a').each((j, a) => {
            console.log(`  - Text: "${$(a).text().trim()}", Href: ${$(a).attr('href')}`);
          });
        }
      }
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testVox();
