const axios = require('axios');
const cheerio = require('cheerio');

async function testLinks() {
  try {
    const res = await axios.get('https://vegamovie.ss/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const $ = cheerio.load(res.data);
    const links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && (href.includes('vegamovie') || href.startsWith('/'))) {
        links.push({ text, href });
      }
    });
    console.log(`Total links: ${links.length}`);
    console.log("Sample links:");
    console.log(links.slice(0, 40));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testLinks();
