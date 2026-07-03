const axios = require('axios');
const cheerio = require('cheerio');

async function testDom() {
  const url = 'https://vegamovie.ss/54585-lord-of-the-mysteries-specials-2026-season-1-chinese-audio-web-dl-720p-1080p-ep-01-added.html';
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    console.log("Analyzing download links wrappers:");
    $('.download-links-div').each((i, div) => {
      console.log(`\n--- WRAPPER ${i + 1} ---`);
      // Print parent h3 or h4 text if exists
      const parentH3 = $(div).find('h3, h4').text().trim();
      console.log("Parent H3/H4 text:", parentH3);
      
      // Let's print the entire outer HTML of first 3 links inside this div
      $(div).find('a').each((j, a) => {
        console.log(`Link ${j + 1}:`);
        console.log("  Href:", $(a).attr('href'));
        console.log("  Text:", $(a).text().trim());
        
        // Find preceding headings or strong tags
        let sibling = $(a).parent();
        console.log("  Parent tag:", sibling.prop('tagName'));
        console.log("  Parent text:", sibling.text().trim().substring(0, 150));
        
        let prev = sibling.prev();
        if (prev.length > 0) {
          console.log("  Preceding sibling tag:", prev.prop('tagName'));
          console.log("  Preceding sibling text:", prev.text().trim().substring(0, 150));
        }
      });
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testDom();
