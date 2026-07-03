const axios = require('axios');
const cheerio = require('cheerio');

async function testSeries() {
  try {
    const res = await axios.get('https://vegamovie.ss/animation/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    let targetUrl = '';
    const titles = [];
    $('article, .post-item, .blog-post, .post').each((i, el) => {
      const titleEl = $(el).find('h2 a, h3 a, a').first();
      const href = titleEl.attr('href');
      const title = titleEl.text().trim() || $(el).find('img').attr('alt') || '';
      if (href && title) {
        titles.push({ title, href });
      }
    });
    console.log("Found titles count:", titles.length);
    console.log("Titles list:");
    titles.forEach(t => console.log(`- ${t.title}`));

    for (const t of titles) {
      const titleLower = t.title.toLowerCase();
      if (titleLower.includes('season') || titleLower.includes('series') || titleLower.includes('ep') || titleLower.includes('complete')) {
        targetUrl = t.href;
        console.log(`\nFound series target: ${t.title} -> ${t.href}`);
        break;
      }
    }

    if (targetUrl) {
      const detailId = Buffer.from(targetUrl).toString('base64');
      console.log(`Querying details API for series: ${targetUrl} (Id: ${detailId})`);
      const detailsRes = await axios.get(`http://localhost:3000/api/movie-details?id=${detailId}`);
      console.log("Status:", detailsRes.status);
      console.log("Title:", detailsRes.data.title);
      console.log(`Downloads count: ${detailsRes.data.downloads.length}`);
      console.log("Download items:");
      detailsRes.data.downloads.forEach((d, idx) => {
        console.log(`${idx + 1}: ${d.title} -> isEpisode: ${d.isEpisode}`);
      });
    } else {
      console.log("No series release found on first page of animation category.");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testSeries();
