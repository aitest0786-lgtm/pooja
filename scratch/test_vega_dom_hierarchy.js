const axios = require('axios');
const cheerio = require('cheerio');

async function testHierarchy() {
  const url = 'https://vegamovie.ss/54258-tamons-b-side-2026-season-1-hindi-english-japanese-audio-web-dl-720p-1080p-ep-02-added.html';
  try {
    console.log(`Fetching Tamon's B-Side from Vegamovies...`);
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    console.log("Analyzing hierarchy of download-links-div blocks:");
    $('.download-links-div').each((i, div) => {
      console.log(`\nContainer ${i + 1}:`);
      
      // Print text of any preceding heading or parent heading
      let prevElement = $(div).prev();
      let headingText = '';
      while (prevElement.length > 0 && !['H1', 'H2', 'H3', 'H4', 'H5'].includes(prevElement.prop('tagName'))) {
        prevElement = prevElement.prev();
      }
      if (prevElement.length > 0) {
        headingText = prevElement.text().trim();
        console.log(`  Preceding Heading [${prevElement.prop('tagName')}]: "${headingText}"`);
      }
      
      $(div).find('a').each((j, a) => {
        const text = $(a).text().trim();
        const href = $(a).attr('href');
        
        // Find if this link has a parent paragraph/div that has a preceding sibling with Episode info
        let parentNode = $(a).parent();
        let label = '';
        let sibling = parentNode.prev();
        while (sibling.length > 0) {
          const txt = sibling.text().trim();
          if (txt && (txt.includes('480p') || txt.includes('720p') || txt.includes('1080p') || txt.includes('Episode') || txt.includes('EP-') || txt.includes('Ep'))) {
            label = txt;
            break;
          }
          sibling = sibling.prev();
        }
        
        console.log(`  Link ${j + 1}: "${text}" -> ${href}`);
        console.log(`    Detected Label/Context: "${label}"`);
      });
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testHierarchy();
