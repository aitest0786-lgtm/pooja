const axios = require('axios');
const cheerio = require('cheerio');

async function testVegaCategories() {
  try {
    const res = await axios.get('https://vegamovie.ss/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const $ = cheerio.load(res.data);
    const categories = new Set();
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && (href.includes('/category/') || href.includes('/genre/'))) {
        categories.add(`${text} => ${href}`);
      }
    });
    console.log("Found Categories:");
    console.log(Array.from(categories));
  } catch (err) {
    console.error("Error fetching homepage:", err.message);
  }
}

testVegaCategories();
