const axios = require('axios');
const cheerio = require('cheerio');

async function testAnimation() {
  try {
    const url = 'https://vegamovie.ss/?s=anime';
    console.log(`Fetching ${url}...`);
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const $ = cheerio.load(res.data);
    const items = [];
    $('article, .post-item, .blog-post, .post').each((i, el) => {
      const titleEl = $(el).find('h2 a, h3 a, a').first();
      const href = titleEl.attr('href');
      const title = titleEl.text().trim() || $(el).find('img').attr('alt') || '';
      if (href && title) {
        items.push({ title, href });
      }
    });
    console.log(`Found ${items.length} items on animation category. Titles:`);
    items.forEach((item, idx) => {
      console.log(`${idx + 1}: ${item.title} -> ${item.href}`);
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testAnimation();
