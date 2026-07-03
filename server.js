require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

const httpsAgent = undefined; // Avoid rejectUnauthorized: false to prevent Cloudflare blocks

const app = express();
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Prevent index.html cache so versioned client scripts are loaded fresh
app.get('/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
app.get('/index.html', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// const TARGET_BASE_URL = process.env.TARGET_BASE_URL || 'https://okjatt.bond';
const TARGET_BASE_URL = process.env.TARGET_BASE_URL || 'https://netmirror.global';

// Simple in-memory cache to make page loading super fast and avoid rate limiting
const cache = {
  list: {},
  details: {},
  CACHE_DURATION: 10 * 60 * 1000 // 10 minutes cache
};

// Helper function to perform HTTP GET with automatic retries for transient socket resets (ECONNRESET)
async function axiosGetWithRetry(url, config = {}, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, { ...config, httpsAgent: config.httpsAgent || httpsAgent });
    } catch (error) {
      const isTransient = !error.response || (error.response.status >= 500) || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
      if (isTransient && i < retries - 1) {
        console.warn(`[axiosGetWithRetry] Retrying due to ${error.code || error.message} (Attempt ${i + 1}/${retries}): ${url}`);
        await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}

// Helper function to fetch page content with standard user-agent headers
async function fetchHtml(url) {
  try {
    // Automatically sanitize and encode URL (e.g. spaces to %20) to prevent TLS socket resets
    let safeUrl = url;
    try {
      safeUrl = new URL(url).href;
    } catch (e) {
      safeUrl = url.replace(/ /g, '%20');
    }

    let referer = TARGET_BASE_URL + '/';
    try {
      const urlObj = new URL(safeUrl);
      referer = `${urlObj.protocol}//${urlObj.hostname}/`;
    } catch(e) {}

    const response = await axiosGetWithRetry(safeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': referer
      },
      timeout: 25000
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching URL: ${url}`, error.message);
    throw error;
  }
}

// Helper to resolve working OkJatt domain variations
function resolveOkJattUrl(url) {
  if (!url) return '';
  if (url.includes('okjatt') && !url.includes('okjatt.bond')) {
    return url.replace(/okjatthd\.bond|okjatt\.bond\.com|okjatt\.in|okjatt\.org|okjatt\.com|okjatt\.vip/gi, 'okjatt.bond');
  }
  if (url.includes('netmirror') && !url.includes('netmirror.global')) {
    return url.replace(/netmirror\.site|netmirror\.co|netmirror\.xyz|netmirror\.cc/gi, 'netmirror.global');
  }
  return url;
}

// Helper to sanitize scraped links (forces cdn2.checkyourlinks.shop instead of linktosho.store)
function sanitizeScrapedLink(url) {
  if (!url) return '';
  let cleanUrl = resolveOkJattUrl(url);
  if (cleanUrl.includes('linktosho.store')) {
    cleanUrl = cleanUrl.replace(/cdn\d*\.linktosho\.store/gi, 'cdn2.checkyourlinks.shop');
  }
  return cleanUrl;
}

// Helper to get clean and contextual download titles
function getDownloadTitle($, el) {
  let text = $(el).text().trim().replace(/\s+/g, ' ');
  
  const isGeneric = !text || text.length < 5 || text.toLowerCase().includes('click here') || text.toLowerCase().includes('download') || text.includes('[]');
  
  if (isGeneric) {
    let current = $(el).parent();
    let foundLabel = '';
    
    for (let i = 0; i < 4 && current.length > 0; i++) {
      const curText = current.text().trim().replace(/\s+/g, ' ');
      const match = curText.match(/\b(480p|720p|1080p|2160p|4k|hq|v2|uhd)\b/i);
      if (match) {
        foundLabel = match[0];
        if (curText.length > 3 && curText.length < 60) {
          text = curText;
          break;
        }
      }
      current = current.parent();
    }
    
    if (foundLabel && (!text || text.includes('[]') || text.toLowerCase().includes('click here'))) {
      const cleanText = text.replace(/Click Here To Download|\[\]/gi, '').trim() || 'Download';
      text = `${cleanText} (${foundLabel})`;
    }
  }
  
  text = text.replace(/\s*\[\s*\]/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length < 4) {
    text = $(el).attr('title') || 'Download Link';
  }
  return text;
}

// Helper to clean movie titles before searching IMDb
function cleanMovieTitle(title) {
  if (!title) return '';
  
  let cleaned = title;

  // Replace target site names and known domain/brand suffixes
  cleaned = cleaned.replace(/okjatt\.bond\.com|okjatt\.bond|okjatthd\.bond|okjatt\.in|okjatt\.org|okjatt|vegamovie\.ss|vegamovies|vegamovie|nikkXmovie|netmirror\.global|netmirror|movies4u\.pn|movies4u/gi, ' ');
  
  // Extract year if present, to keep it in the search query for accuracy
  let year = '';
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    year = yearMatch[0];
  }
  
  // Clean season/episode patterns first
  cleaned = cleaned
    .replace(/\b(s\d+\s*e\d+)\b/gi, ' ') // e.g. s01e01, s1e2
    .replace(/\b(s\d+\s*ep\d+)\b/gi, ' ') // e.g. s01ep01, s1ep2
    .replace(/\bs\d+\b/gi, ' ') // e.g. S01, S1, S2
    .replace(/\be\d+\b/gi, ' ') // e.g. E01, E1, E12
    .replace(/\bep\d+\b/gi, ' ') // e.g. ep01, ep1
    .replace(/\b(season\s*\d+|seanon\s*\d+|seasons|season)\b/gi, ' ')
    .replace(/\b(episode\s*\d+|episodes|episode)\b/gi, ' ')
    .replace(/\b(part\s*\d+|pt\s*\d+|volume\s*\d+|vol\s*\d+)\b/gi, ' ');

  // Remove brackets, parentheses and braces contents (often contains metadata like [Hindi-Eng], (2024), etc.)
  cleaned = cleaned
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\{.*?\}/g, ' ');

  // Clean media specifications, qualities, codecs
  cleaned = cleaned
    .replace(/\b(480p|720p|1080p|2160p|4k|hd|web-dl|webrip|hdtc|hdtv|camrip|telesync|tc|ts|rip|bluray|brrip|dvdrip|dvd|hevc|x265|x264|h265|h264|10bit|8bit|hdr|dd5\.1|aac|dts|ac3|atmos)\b/gi, ' ');

  // Clean language identifiers (full and abbreviations)
  cleaned = cleaned
    .replace(/\b(hindi|english|tamil|telugu|malayalam|kannada|punjabi|odia|bangali|gujarati|marathi|korean|chinese|urdu|japanese|multi-audio|dual-audio|multi|dual|audio|dubbed|dub|subbed|sub|subs|esubs|esub|subtitles|subtitle|hin|eng|tam|tel|kan|mal|jap|kor|chi|fre|spa|ger|rus)\b/gi, ' ');

  // Clean common phrases
  cleaned = cleaned
    .replace(/\b(full movie|uncut|extended|directors cut|complete|bootstrap|watch|online|download|free|series|show|web series|webseries|tv show|tvshow|org|original|direct|source|mirror)\b/gi, ' ');

  // Clean punctuation and replace with space
  cleaned = cleaned.replace(/[\-|\||\/|\\|:|\.|\+]/g, ' ');

  // Collapse spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Re-append the year at the end if we extracted one and it was cleaned out
  if (year && !cleaned.includes(year)) {
    cleaned += ' ' + year;
  }
  
  return cleaned.replace(/\s+/g, ' ').trim();
}

// Helper to replace target site brandings with N ❤️ P
function cleanTitleBranding(title) {
  if (!title) return '';
  return title
    .replace(/okjatt\.bond\.com/gi, 'N ❤️ P')
    .replace(/okjatt\.bond/gi, 'N ❤️ P')
    .replace(/okjatthd\.bond/gi, 'N ❤️ P')
    .replace(/okjatt\.in/gi, 'N ❤️ P')
    .replace(/okjatt\.org/gi, 'N ❤️ P')
    .replace(/okjatt/gi, 'N ❤️ P')
    .replace(/vegamovie\.ss/gi, 'N ❤️ P')
    .replace(/vegamovies/gi, 'N ❤️ P')
    .replace(/vegamovie/gi, 'N ❤️ P')
    .replace(/netmirror\.global/gi, 'N ❤️ P')
    .replace(/netmirror/gi, 'N ❤️ P')
    .replace(/\[OkJatt\]/gi, '[N ❤️ P]')
    .replace(/\(OkJatt\)/gi, '(N ❤️ P)')
    .replace(/\[NetMirror\]/gi, '[N ❤️ P]')
    .replace(/\(NetMirror\)/gi, '(N ❤️ P)')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch IMDb ID using official IMDb suggestions API (extremely fast and reliable)
async function getImdbIdByTitle(title) {
  const cleanTitle = cleanMovieTitle(title);
  if (!cleanTitle) return null;
  
  try {
    const firstChar = cleanTitle.charAt(0).toLowerCase();
    // Validate first character is alphanumeric, fallback to 'a'
    const queryChar = /^[a-z0-9]$/.test(firstChar) ? firstChar : 'a';
    
    const searchUrl = `https://sg.media-imdb.com/suggests/${queryChar}/${encodeURIComponent(cleanTitle.toLowerCase())}.json`;
    const response = await axiosGetWithRetry(searchUrl, { timeout: 6000 });
    
    const dataText = response.data;
    const jsonStart = dataText.indexOf('(') + 1;
    const jsonEnd = dataText.lastIndexOf(')');
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      const jsonText = dataText.substring(jsonStart, jsonEnd);
      const json = JSON.parse(jsonText);
      if (json && json.d && json.d.length > 0) {
        // Return first match that has an IMDb ID starting with 'tt'
        const match = json.d.find(item => item.id && item.id.startsWith('tt'));
        if (match) {
          return match.id;
        }
      }
    }
  } catch (error) {
    console.error(`Failed to lookup IMDb ID for title "${cleanTitle}":`, error.message);
  }
  return null;
}

// Helper to scrape specific category listings from Vegamovies with pagination support
async function scrapeVegaCategory(category, page) {
  let url = 'https://vegamovie.ss/';
  if (category === 'anime') {
    url = page > 1 ? `https://vegamovie.ss/category/animation/page/${page}/` : `https://vegamovie.ss/category/animation/`;
  } else if (category === 'bollywood') {
    url = page > 1 ? `https://vegamovie.ss/bollywood-movies/page/${page}/` : `https://vegamovie.ss/bollywood-movies/`;
  } else if (category === 'hollywood') {
    url = page > 1 ? `https://vegamovie.ss/hollywood-movies/page/${page}/` : `https://vegamovie.ss/hollywood-movies/`;
  } else if (category === 'dual-audio') {
    url = page > 1 ? `https://vegamovie.ss/dual-audio-hindi-english-movies/page/${page}/` : `https://vegamovie.ss/dual-audio-hindi-english-movies/`;
  } else if (category === 'web-series' || category === 'tv-show') {
    url = page > 1 ? `https://vegamovie.ss/tv-shows/page/${page}/` : `https://vegamovie.ss/tv-shows/`;
  } else if (category === 'south-indian') {
    url = page > 1 ? `https://vegamovie.ss/category/south-indian-dubbed-movies-download/page/${page}/` : `https://vegamovie.ss/category/south-indian-dubbed-movies-download/`;
  } else {
    url = page > 1 ? `https://vegamovie.ss/page/${page}/` : `https://vegamovie.ss/`;
  }

  const items = [];
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    $('article, .post-item, .blog-post, .post').each((i, el) => {
      const titleEl = $(el).find('h3 a, h2 a').first();
      const href = titleEl.attr('href');
      const title = titleEl.text().trim() || $(el).find('img').attr('alt') || '';
      const imgEl = $(el).find('img').first();
      let poster = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';

      if (href && title) {
        const absoluteDetailUrl = href.startsWith('http') ? href : new URL(href, 'https://vegamovie.ss').href;
        const absolutePoster = poster ? (poster.startsWith('http') ? poster : new URL(poster, 'https://vegamovie.ss').href) : '';
        items.push({
          title: cleanTitleBranding(title),
          detailId: Buffer.from(absoluteDetailUrl).toString('base64'),
          poster: absolutePoster
        });
      }
    });
  } catch (err) {
    console.error(`Failed to scrape Vegamovies category ${category} page ${page}:`, err.message);
  }
  return items;
}

// Helper to classify search items for categories
function getCategoryOfItem(item) {
  if (item.category === 'anime') {
    return 'anime';
  }
  const titleLower = item.title.toLowerCase();
  
  let decodedUrl = '';
  try {
    decodedUrl = Buffer.from(item.detailId, 'base64').toString('utf8').toLowerCase();
  } catch (e) {}

  const isAnime = titleLower.includes('anime') || 
                  titleLower.includes('animation') ||
                  titleLower.includes('japanese') ||
                  titleLower.includes('japan') ||
                  titleLower.includes('donghua') ||
                  titleLower.includes('subbed') ||
                  item.cn === 'Japan' ||
                  item.cn === 'japan' ||
                  decodedUrl.includes('animation') ||
                  decodedUrl.includes('anime');

  if (isAnime) {
    return 'anime';
  }

  if (titleLower.includes('season') || 
      titleLower.includes('episode') || 
      titleLower.includes('ep-') ||
      /\bep\d+/i.test(titleLower) ||
      /\bs\d+/i.test(titleLower) ||
      titleLower.includes('web series') ||
      titleLower.includes('complete') ||
      item.media_type === 'tv') {
    return 'web-series';
  }
  return 'movies';
}

// 1. API: List movies (Home, Categories, Search)
app.get('/api/movies', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const search = req.query.s || '';
  const category = req.query.category || '';
  const searchCategory = req.query.search_category || 'all';

  // Generate a unique cache key based on query params
  const cacheKey = `list-p${page}-s${search}-c${category}-sc${searchCategory}`;
  const cachedData = cache.list[cacheKey];

  if (cachedData && (Date.now() - cachedData.timestamp < cache.CACHE_DURATION)) {
    return res.json(cachedData.data);
  }

  try {
    let finalMoviesList = [];

    if (search) {
      console.log(`[Multi-Search] Searching for: "${search}" with category filter: "${searchCategory}"`);
      const searchQueries = [];

      // 1. OkJatt Search
      searchQueries.push((async () => {
        try {
          const okjattUrl = `https://okjatt.bond/movies/src_data.php?q=${encodeURIComponent(search)}`;
          const html = await fetchHtml(okjattUrl);
          const $ok = cheerio.load(html);
          const list = [];
          $ok('.sul li a, li a').each((i, el) => {
            const linkEl = $ok(el);
            const href = linkEl.attr('href');
            const title = linkEl.text().trim();
            const imgEl = linkEl.find('img');
            const poster = imgEl.attr('src') || '';
            if (title && href) {
              const absoluteDetailUrl = href.startsWith('http') ? href : new URL(href, 'https://okjatt.bond').href;
              list.push({
                title: cleanTitleBranding(title),
                detailId: Buffer.from(absoluteDetailUrl).toString('base64'),
                poster: poster ? (poster.startsWith('http') ? poster : new URL(poster, 'https://okjatt.bond').href) : ''
              });
            }
          });
          return list;
        } catch (err) {
          console.error("OkJatt search failed:", err.message);
          return [];
        }
      })());

      // 2. NetMirror Search
      searchQueries.push((async () => {
        try {
          const netmirrorUrl = `https://api2.imdb4.shop/api/search2/${encodeURIComponent(search)}?page=0`;
          const response = await axios.get(netmirrorUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000,
            httpsAgent: httpsAgent
          });
          const list = [];
          if (response.data && response.data.results) {
            response.data.results.forEach(item => {
              const type = item.media_type || 'movie';
              const customUrl = `netmirror:${type}:${item.id}`;
              
              let poster = item.backdrop_path || '';
              if (poster) {
                poster = poster.replace('pbcdnw', 'pacdn');
              }
              
              // Detect anime category from API response details
              let itemCategory = '';
              const isAnimeGenre = item.genre_ids && (
                item.genre_ids.includes(10) || item.genre_ids.includes(6) || 
                item.genre_ids.includes('10') || item.genre_ids.includes('6')
              );
              if (item.cn === 'Japan' || item.cn === 'japan' || isAnimeGenre) {
                itemCategory = 'anime';
              }

              list.push({
                title: cleanTitleBranding(item.title),
                detailId: Buffer.from(customUrl).toString('base64'),
                poster: poster,
                media_type: type,
                category: itemCategory
              });
            });
          }
          return list;
        } catch (err) {
          console.error("NetMirror search failed:", err.message);
          return [];
        }
      })());

      // 3. Vegamovies Search
      searchQueries.push((async () => {
        try {
          const vegaHtml = await fetchHtml(`https://vegamovie.ss/?s=${encodeURIComponent(search)}`);
          const $vega = cheerio.load(vegaHtml);
          const list = [];
          $vega('article, .post-item, .blog-post, .post').each((i, el) => {
            const titleEl = $vega(el).find('h3 a, h2 a').first();
            const href = titleEl.attr('href');
            const title = titleEl.text().trim() || $vega(el).find('img').attr('alt') || '';
            const imgEl = $vega(el).find('img').first();
            let poster = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';

            if (href && title) {
              const absoluteDetailUrl = href.startsWith('http') ? href : new URL(href, 'https://vegamovie.ss').href;
              
              // Detect anime category from WordPress post class list
              const classes = $vega(el).attr('class') || '';
              let itemCategory = '';
              if (classes.includes('category-animation') || classes.includes('category-anime')) {
                itemCategory = 'anime';
              }

              list.push({
                title: cleanTitleBranding(title),
                detailId: Buffer.from(absoluteDetailUrl).toString('base64'),
                poster: poster ? (poster.startsWith('http') ? poster : new URL(poster, 'https://vegamovie.ss').href) : '',
                category: itemCategory
              });
            }
          });
          return list;
        } catch (err) {
          console.error("Vegamovies search failed:", err.message);
          return [];
        }
      })());

      const results = await Promise.allSettled(searchQueries);
      const okjattResults = results[0].status === 'fulfilled' ? results[0].value : [];
      const netmirrorResults = results[1].status === 'fulfilled' ? results[1].value : [];
      const vegaResults = results[2].status === 'fulfilled' ? results[2].value : [];

      finalMoviesList = [...okjattResults, ...netmirrorResults, ...vegaResults];

      // Relevance check: ensure only matching items are returned to prevent unrelated suggestions
      const queryWords = search.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      if (queryWords.length > 0) {
        finalMoviesList = finalMoviesList.filter(item => {
          const titleLower = item.title.toLowerCase();
          return queryWords.some(word => titleLower.includes(word));
        });
      }

      // Filter by search category if not 'all'
      if (searchCategory !== 'all') {
        finalMoviesList = finalMoviesList.filter(item => {
          const itemCat = getCategoryOfItem(item);
          if (searchCategory === 'movies') {
            return itemCat === 'movies';
          }
          if (searchCategory === 'anime') {
            const isAnime = itemCat === 'anime';
            if (!isAnime) return false;
            const titleLower = item.title.toLowerCase();
            return titleLower.includes('hindi') || 
                   titleLower.includes('dual') || 
                   titleLower.includes('multi') || 
                   titleLower.includes('dub');
          }
          if (searchCategory === 'web-series' || searchCategory === 'tv-show') {
            return itemCat === 'web-series';
          }
          return true;
        });
      }
    } else {
      // Normal category listing (Home, categories, grids)
      const listQueries = [];

      // 1. OkJatt category list
      listQueries.push((async () => {
        try {
          let okjattUrl = 'https://okjatt.bond';
          if (category) {
            if (category === 'bollywood') {
              okjattUrl = `https://okjatt.bond/movies/Hindi/New-${page - 1}.html`;
            } else if (category === 'hollywood') {
              okjattUrl = `https://okjatt.bond/movies/Hollywood-Dubbed/New-${page - 1}.html`;
            } else if (category === 'dual-audio') {
              okjattUrl = `https://okjatt.bond/movies/Hindi-Movie/New-${page - 1}.html`;
            } else if (category === 'web-series' || category === 'tv-show') {
              okjattUrl = `https://okjatt.bond/tv/Hindi-web-series/list-${page}.html`;
            } else if (category === 'south-indian') {
              okjattUrl = `https://okjatt.bond/movies/south-indian-dubbed/new-${page - 1}.html`;
            } else if (category === '18') {
              okjattUrl = `https://okjatt.bond/movies/B-Grade-Hindi-Movie/New-${page - 1}.html`;
            } else {
              okjattUrl = `https://okjatt.bond/movies/${category}/New-${page - 1}.html`;
            }
          } else {
            okjattUrl = page > 1 ? `https://okjatt.bond/movies/Hindi/New-${page - 1}.html` : 'https://okjatt.bond/';
          }

          const html = await fetchHtml(okjattUrl);
          const $ok = cheerio.load(html);
          const list = [];
          
          $ok('.ml-item').each((i, el) => {
            const item = $ok(el);
            const linkEl = item.find('a.ml-mask');
            const href = linkEl.attr('href');
            const title = linkEl.find('.mli-info h2').text().trim() || linkEl.attr('title') || '';
            const imgEl = linkEl.find('img');
            const poster = imgEl.attr('src') || imgEl.attr('data-original') || imgEl.attr('data-src') || '';
            if (title && href) {
              const absoluteDetailUrl = href.startsWith('http') ? href : new URL(href, 'https://okjatt.bond').href;
              list.push({
                title: cleanTitleBranding(title),
                detailId: Buffer.from(absoluteDetailUrl).toString('base64'),
                poster: poster ? (poster.startsWith('http') ? poster : new URL(poster, 'https://okjatt.bond').href) : ''
              });
            }
          });
          
          if (list.length === 0) {
            $ok('.content-slider a, .item a').each((i, el) => {
              const linkEl = $ok(el);
              const href = linkEl.attr('href');
              if (!href || (!href.includes('/movie/') && !href.includes('/tv/'))) return;
              const liEl = linkEl.find('li');
              if (liEl.length === 0) return;
              const title = liEl.find('.titt').text().trim() || liEl.find('h2').text().replace(/\s+/g, ' ').trim() || '';
              let poster = '';
              const styleAttr = liEl.attr('style') || '';
              const bgMatch = styleAttr.match(/url\((.*?)\)/);
              if (bgMatch) poster = bgMatch[1].replace(/['"]/g, '').trim();
              if (title && href) {
                const absoluteDetailUrl = href.startsWith('http') ? href : new URL(href, 'https://okjatt.bond').href;
                list.push({
                  title: cleanTitleBranding(title),
                  detailId: Buffer.from(absoluteDetailUrl).toString('base64'),
                  poster: poster ? (poster.startsWith('http') ? poster : new URL(poster, 'https://okjatt.bond').href) : ''
                });
              }
            });
          }
          return list;
        } catch (err) {
          console.error("OkJatt category fetch failed:", err.message);
          return [];
        }
      })());

      // 2. NetMirror category list
      listQueries.push((async () => {
        try {
          let netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}`;
          if (category) {
            if (category === 'bollywood') {
              netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}&cn=India`;
            } else if (category === 'hollywood') {
              netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}&type=1&cn=US`;
            } else if (category === 'dual-audio') {
              netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}&cn=India`;
            } else if (category === 'web-series' || category === 'tv-show') {
              netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}&type=2`;
            } else if (category === 'anime') {
              netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}&genre_ids[]=10&genre_ids[]=6`;
            } else if (category === 'south-indian') {
              netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}&cn=India`;
            } else {
              netmirrorUrl = `https://api2.imdb3.shop/api/movies/filter?page=${page - 1}`;
            }
          }
          const response = await axios.get(netmirrorUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000,
            httpsAgent: httpsAgent
          });
          const list = [];
          if (response.data && response.data.results) {
            response.data.results.forEach(item => {
              const type = item.media_type || (netmirrorUrl.includes('type=2') ? 'tv' : 'movie');
              const customUrl = `netmirror:${type}:${item.id}`;
              
              let poster = item.backdrop_path || '';
              if (poster) {
                poster = poster.replace('pbcdnw', 'pacdn');
              }
              list.push({
                title: cleanTitleBranding(item.title),
                detailId: Buffer.from(customUrl).toString('base64'),
                poster: poster
              });
            });
          }
          return list;
        } catch (err) {
          console.error("NetMirror category fetch failed:", err.message);
          return [];
        }
      })());

      // 3. Vegamovies category list
      listQueries.push((async () => {
        try {
          return await scrapeVegaCategory(category, page);
        } catch (err) {
          console.error("Vegamovies category fetch failed:", err.message);
          return [];
        }
      })());

      const results = await Promise.allSettled(listQueries);
      const okjattList = results[0].status === 'fulfilled' ? results[0].value : [];
      const netmirrorList = results[1].status === 'fulfilled' ? results[1].value : [];
      const vegaList = results[2].status === 'fulfilled' ? results[2].value : [];

      finalMoviesList = [...okjattList, ...netmirrorList, ...vegaList];

      // Filter to only include Hindi dubbed anime when category is 'anime'
      if (category === 'anime') {
        finalMoviesList = finalMoviesList.filter(item => {
          const titleLower = item.title.toLowerCase();
          return titleLower.includes('hindi') || 
                 titleLower.includes('dual') || 
                 titleLower.includes('multi') || 
                 titleLower.includes('dub');
        });
      }
    }

    // Check pagination next page state
    const hasNextPage = finalMoviesList.length >= 10;
    const result = { movies: finalMoviesList, page, hasNextPage };

    // Cache the result
    cache.list[cacheKey] = {
      timestamp: Date.now(),
      data: result
    };

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch movies', details: error.message });
  }
});

// 2. API: Movie Details (synopsis, download links, screenshots)
app.get('/api/movie-details', async (req, res) => {
  const detailId = req.query.id;
  if (!detailId) {
    return res.status(400).json({ error: 'Missing movie ID' });
  }

  let detailUrl;
  try {
    detailUrl = Buffer.from(detailId, 'base64').toString('utf8');
    detailUrl = resolveOkJattUrl(detailUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid movie ID format' });
  }

  // Intercept NetMirror custom details query
  const isNetmirror = detailUrl.startsWith('netmirror:');
  if (isNetmirror) {
    try {
      const parts = detailUrl.split(':');
      const mediaType = parts[1]; // movie or tv
      const id = parts[2];
      
      const apiDetailUrl = `https://api2.imdb3.shop/api/${mediaType}/${id}`;
      console.log(`[Scraper] Fetching NetMirror details from API: ${apiDetailUrl}`);
      
      const response = await axiosGetWithRetry(apiDetailUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      });
      
      const item = response.data.results[0];
      if (!item) {
        throw new Error('Details not found in NetMirror response');
      }
      
      const title = item.title.trim();
      const plot = item.dis || 'No synopsis found for this release.';
      
      // Technical specifications
      let infoHtml = `
        <strong>Title:</strong> ${title}<br>
        <strong>Release Date:</strong> ${item.release_date || 'N/A'}<br>
        <strong>Rating:</strong> ${item.vote_average || 'N/A'}/10<br>
        <strong>Country:</strong> ${item.country || 'N/A'}<br>
      `;
      
      // Backdrop path is the poster/screenshot
      const screenshots = [];
      if (item.backdrop_path) {
        const cleanedBackdrop = item.backdrop_path.replace('pbcdnw', 'pacdn');
        screenshots.push(cleanedBackdrop);
      }
      
      // Downloads/Streaming list builder
      const downloads = [];
      const isActualShow = item.season && item.season.length > 0 && !(item.season.length === 1 && item.season[0].se === 0 && item.season[0].ep === 0);
      if (isActualShow) {
        // TV Show/Web Series
        item.season.forEach(s => {
          const seasonNum = s.se;
          const epCount = s.ep;
          const allEpStr = s.allEp;
          
          let episodesList = [];
          if (allEpStr) {
            episodesList = String(allEpStr).split(',').map(Number);
          } else {
            episodesList = Array.from({length: epCount}, (_, i) => i + 1);
          }
          
          episodesList.forEach(epNum => {
            const customStreamUrl = `/api/netmirror-stream?subjectid=${item.subjectid || item.id}&se=${seasonNum}&ep=${epNum}&dp=${encodeURIComponent(item.dp || '')}&title=${encodeURIComponent(title)}`;
            downloads.push({
              title: `Episode ${epNum} [Season ${seasonNum}]`,
              url: customStreamUrl,
              isEpisode: true
            });
          });
        });
      } else {
        // Movie
        const customStreamUrl = `/api/netmirror-stream?subjectid=${item.subjectid || item.id}&se=0&ep=0&dp=${encodeURIComponent(item.dp || '')}&title=${encodeURIComponent(title)}`;
        downloads.push({
          title: `Play Movie (Direct NetMirror Server)`,
          url: customStreamUrl,
          isEpisode: false
        });
      }
      
      // Resolve IMDb ID for NetMirror item
      let imdbId = null;
      try {
        imdbId = await getImdbIdByTitle(title);
      } catch (err) {
        console.error('Error fetching IMDb ID for NetMirror:', err.message);
      }

      const result = {
        title: cleanTitleBranding(title),
        infoHtml: cleanTitleBranding(infoHtml),
        plot: cleanTitleBranding(plot),
        screenshots: screenshots.slice(0, 8),
        downloads: downloads.map(d => ({
          title: cleanTitleBranding(d.title),
          url: d.url,
          isEpisode: d.isEpisode
        })),
        imdbId,
        streamUrl: downloads.length > 0 ? downloads[0].url : null
      };
      
      // Cache details
      cache.details[detailUrl] = {
        timestamp: Date.now(),
        data: result
      };
      
      return res.json(result);
    } catch (err) {
      console.error("NetMirror details query failed:", err.message);
      return res.status(500).json({ error: 'Failed to fetch NetMirror movie details', details: err.message });
    }
  }

  const cachedData = cache.details[detailUrl];
  if (cachedData && (Date.now() - cachedData.timestamp < cache.CACHE_DURATION)) {
    return res.json(cachedData.data);
  }
  try {
    let html = await fetchHtml(detailUrl);
    let $ = cheerio.load(html);

    // Vegamovies details scraper integration
    const isVega = detailUrl.includes('vegamovie.ss');
    if (isVega) {
      try {
        const title = $('h1').text().trim();
        
        // Extract screenshots
        const screenshots = [];
        $('img').each((i, el) => {
          let imgUrl = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
          if (imgUrl && imgUrl.includes('/uploads/') && imgUrl.toLowerCase().includes('screenshot')) {
            if (!imgUrl.startsWith('http')) {
              imgUrl = new URL(imgUrl, detailUrl).href;
            }
            screenshots.push(imgUrl);
          }
        });
        
        // Extract synopsis/plot
        let plot = '';
        $('p').each((i, el) => {
          const txt = $(el).text().trim();
          if (txt && txt.length > 80 && !txt.includes('vegamovie') && !txt.includes('Prefect Spot') && !txt.includes('G-Drive') && !txt.includes('Quality:')) {
            plot = txt;
            return false;
          }
        });
        if (!plot) plot = 'No synopsis found for this release.';
        
        // Extract info html specs
        let infoHtml = '';
        $('p').each((i, el) => {
          const txt = $(el).text().trim();
          if (txt && (txt.includes('Web-Series Name:') || txt.includes('Movie Name:') || txt.includes('Release Year:') || txt.includes('Format:'))) {
            infoHtml += txt.replace(/\n/g, '<br>') + '<br>';
          }
        });

        // Extract downloads
        const downloads = [];
        $('.download-links-div').each((i, div) => {
          $(div).find('a').each((j, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            
            const title = getDownloadTitle($, el);
            const titleLower = title.toLowerCase();
            const isEp = titleLower.includes('episode') || titleLower.includes('ep-') || /\bep\b/i.test(titleLower) || titleLower.includes('ep ') || titleLower.includes('pack') || titleLower.includes('complete') || titleLower.includes('season') || titleLower.includes('s0') || titleLower.includes('s1') || titleLower.includes('s2') || titleLower.includes('s3') || titleLower.includes('s4') || titleLower.includes('s5');
            
            const maskedUrl = `/api/download?id=${Buffer.from(href).toString('base64')}`;
            downloads.push({
              title: title,
              url: maskedUrl,
              isEpisode: isEp
            });
          });
        });
        
        // Fallback parser if downloads is empty
        if (downloads.length === 0) {
          $('.entry-content a, a').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            
            // Skip relative links and internal links
            if (href.startsWith('/') || href.startsWith('#') || href.includes('vegamovie') || href.includes('vegamovies') || href.includes('javascript:')) return;
            
            // Skip common non-download external links
            if (href.includes('telegram') || href.includes('t.me') || href.includes('facebook') || href.includes('twitter') || href.includes('instagram') || href.includes('youtube') || href.includes('google.com/search')) return;
            
            // Skip image files and web page resource assets
            if (/\.(png|jpg|jpeg|gif|css|js|woff|ttf|svg)$/i.test(href)) return;
            
            let text = getDownloadTitle($, el);
            const titleLower = text.toLowerCase();
            const isEp = titleLower.includes('episode') || titleLower.includes('ep-') || /\bep\b/i.test(titleLower) || titleLower.includes('ep ') || titleLower.includes('pack') || titleLower.includes('complete') || titleLower.includes('season') || titleLower.includes('s0') || titleLower.includes('s1') || titleLower.includes('s2') || titleLower.includes('s3') || titleLower.includes('s4') || titleLower.includes('s5');
            const maskedUrl = `/api/download?id=${Buffer.from(href).toString('base64')}`;
            
            // Avoid duplicate links
            if (!downloads.some(d => d.url === maskedUrl)) {
              downloads.push({
                title: text,
                url: maskedUrl,
                isEpisode: isEp
              });
            }
          });
        }

        // Resolve IMDb ID
        let imdbId = null;
        try {
          imdbId = await getImdbIdByTitle(title);
        } catch (err) {
          console.error('Error fetching IMDb ID for VegaMovie:', err.message);
        }

        let streamUrl = null;
        if (downloads && downloads.length > 0) {
          // 1. Try to find a direct .mp4 link
          let validDwd = downloads.find(d => {
            try {
              const base64Id = d.url.split('?id=')[1];
              const rawUrl = Buffer.from(base64Id, 'base64').toString('utf8');
              return rawUrl && rawUrl.includes('.mp4') && !rawUrl.includes('.html');
            } catch(e) { return false; }
          });
          
          // 2. Fallback to any non-html link if no .mp4 link is present
          if (!validDwd) {
            validDwd = downloads.find(d => {
              try {
                const base64Id = d.url.split('?id=')[1];
                const rawUrl = Buffer.from(base64Id, 'base64').toString('utf8');
                return rawUrl && !rawUrl.includes('.html');
              } catch(e) { return false; }
            });
          }
          
          if (validDwd) {
            try {
              const base64Id = validDwd.url.split('?id=')[1];
              const rawUrl = Buffer.from(base64Id, 'base64').toString('utf8');
              streamUrl = `/api/stream-play?id=${Buffer.from(rawUrl).toString('base64')}`;
            } catch(e) {}
          }
        }

        const result = {
          title: cleanTitleBranding(title),
          infoHtml: cleanTitleBranding(infoHtml),
          plot: cleanTitleBranding(plot),
          screenshots: screenshots.slice(0, 8),
          downloads: downloads.map(d => ({
            title: cleanTitleBranding(d.title),
            url: d.url,
            isEpisode: d.isEpisode
          })),
          imdbId,
          streamUrl: streamUrl
        };

        cache.details[detailUrl] = {
          timestamp: Date.now(),
          data: result
        };

        return res.json(result);
      } catch (vegaErr) {
        console.error("Vegamovies details scraper integration failed:", vegaErr.message);
      }
    }

    // If it's a TV series intermediate page, resolve it to the complete page URL
    if (detailUrl.includes('/tv/') && detailUrl.endsWith('-full.html')) {
      let completeUrl = null;
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('-complete.html')) {
          completeUrl = href.startsWith('http') ? href : new URL(href, detailUrl).href;
          return false; // break loop
        }
      });
      if (completeUrl) {
        console.log(`[Scraper] Resolving intermediate series page: ${detailUrl} -> ${completeUrl}`);
        detailUrl = completeUrl;
        html = await fetchHtml(detailUrl);
        $ = cheerio.load(html);
      }
    }

    const title = $('.meta-data-title h1, h1').text().trim();

    // Extract specs info HTML
    const infoParagraphs = [];
    $('.meta-data-side-by-side').each((i, el) => {
      const label = $(el).find('.meta-data-label').text().trim();
      const content = $(el).find('.meta-data-label-content').text().trim();
      if (label && content) {
        infoParagraphs.push(`<strong>${label}:</strong> ${content}`);
      }
    });
    
    let infoHtml = infoParagraphs.join('<br>');
    if (!infoHtml) {
      infoHtml = $('.meta-data-container').html() || '';
    }

    // Extract screenshots
    const screenshots = [];
    $('.scr_shot img, .ssrt img, .ss-box img').each((i, el) => {
      let imgUrl = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
      if (imgUrl && !imgUrl.includes('logo') && !imgUrl.includes('gravatar') && !imgUrl.includes('favicon')) {
        if (!imgUrl.startsWith('http')) {
          imgUrl = new URL(imgUrl, detailUrl).href;
        }
        screenshots.push(imgUrl);
      }
    });

    // Extract synopsis/plot
    let plot = $('.meta-description-text').text().trim();
    if (!plot) {
      plot = $('.description-blog').text().trim();
    }
    if (!plot) {
      plot = $('.entry-content p').text().trim();
    }
    if (!plot) {
      // Find plot in paragraphs that are not part of header/footer
      $('p').each((i, el) => {
        const txt = $(el).text().trim();
        if (txt && txt.length > 50 && !txt.includes('HTML5 video') && !txt.includes('Online play') && !txt.includes('watch on')) {
          plot = txt;
          return false;
        }
      });
    }
    if (!plot) {
      plot = 'No synopsis found for this release.';
    }

    // Extract download links
    const downloads = [];
    
    // Check if this page has multiple TV episode download pages
    const episodeLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const isTvEpisode = (href.includes('/tv/') || href.includes('/series/') || href.includes('/web-series/') || href.includes('/show/')) && 
                            href.endsWith('.html') && 
                            !href.includes('-full.html') && 
                            !href.includes('-complete.html') &&
                            !href.includes('-tv-shows') &&
                            !href.includes('-web-series') &&
                            !href.includes('/category/') &&
                            !href.includes('index.html');
        if (isTvEpisode) {
          const absHref = href.startsWith('http') ? href : new URL(href, detailUrl).href;
          if (!episodeLinks.includes(absHref)) {
            episodeLinks.push(absHref);
          }
        }
      }
    });

    let streamUrl = null;

    if (episodeLinks.length > 0) {
      console.log(`[Scraper] Found ${episodeLinks.length} episodes on OkJatt page.`);
      episodeLinks.forEach((epUrl, idx) => {
        let epTitle = `Episode ${idx + 1}`;
        try {
          const urlObj = new URL(epUrl);
          const pathname = decodeURIComponent(urlObj.pathname);
          const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
          const cleanEpName = filename
            .replace('-download', '')
            .replace('.html', '')
            .replace(/-/g, ' ');
          
          const matchEp = cleanEpName.match(/(?:S\d+Ep\d+|Episode\s*\d+.*)/i);
          if (matchEp) {
            epTitle = matchEp[0].trim();
          } else {
            epTitle = cleanEpName;
          }
        } catch (e) {}

        const maskedUrl = `/api/download?id=${Buffer.from(epUrl).toString('base64')}`;
        downloads.push({
          title: epTitle.charAt(0).toUpperCase() + epTitle.slice(1),
          url: maskedUrl,
          isEpisode: true
        });
      });
      if (downloads.length > 0) {
        streamUrl = downloads[0].url;
      }
    } else {
      // Normal single movie flow
      let downloadPageUrl = null;
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && (href.includes('/movies/download/') || href.includes('/download/'))) {
          downloadPageUrl = new URL(href, detailUrl).href;
          return false;
        }
      });

      if (downloadPageUrl) {
        try {
          const dwdHtml = await fetchHtml(downloadPageUrl);
          const $dwd = cheerio.load(dwdHtml);
          
          $dwd('video source').each((i, el) => {
            const src = $dwd(el).attr('src');
            if (src && src.includes('.mp4')) {
              streamUrl = src;
              return false;
            }
          });
          
          if (!streamUrl) {
            $dwd('video').each((i, el) => {
              const src = $dwd(el).attr('src');
              if (src && src.includes('.mp4')) {
                streamUrl = src;
                return false;
              }
            });
          }
          
          if (!streamUrl) {
            $dwd('a').each((i, el) => {
              const href = $dwd(el).attr('href');
              if (href && href.includes('.mp4')) {
                streamUrl = href;
                return false;
              }
            });
          }

          $dwd('a').each((i, el) => {
            let href = $dwd(el).attr('href');
            if (href && !href.includes('.html') && (href.includes('checkyourlinks') || href.includes('cdn') || href.includes('.mp4') || href.includes('download') || href.includes('lnk-lnk'))) {
              if (!href.startsWith('http')) {
                href = new URL(href, downloadPageUrl).href;
              }
              
              try {
                const urlObj = new URL(href);
                if (urlObj.hostname.includes('checkyourlinks') && (urlObj.pathname === '/' || urlObj.pathname === '' || urlObj.pathname === '/index.php')) {
                  return;
                }
              } catch(e) {}

              let text = getDownloadTitle($dwd, el);
              const cleanHref = sanitizeScrapedLink(href);
              const maskedUrl = `/api/download?id=${Buffer.from(cleanHref).toString('base64')}`;
              downloads.push({
                title: text,
                url: maskedUrl,
                isEpisode: false
              });
            }
          });
        } catch (err) {
          console.error('Failed to fetch intermediate download page:', err.message);
        }
      }

      if (downloads.length === 0) {
        $('a').each((i, el) => {
          let href = $(el).attr('href');
          if (!href) return;
          
          const isDownloadPath = href.includes('/movies/download/') || href.includes('/download/');
          const isTvEpisode = (href.includes('/tv/') || href.includes('/series/') || href.includes('/web-series/') || href.includes('/show/')) && 
                              href.endsWith('.html') && 
                              !href.includes('-full.html') && 
                              !href.includes('-complete.html') &&
                              !href.includes('-tv-shows') &&
                              !href.includes('-web-series') &&
                              !href.includes('/category/') &&
                              !href.includes('index.html');
          const isMatch = isDownloadPath || isTvEpisode || (!href.includes('.html') && (href.includes('checkyourlinks') || href.includes('cdn') || href.includes('.mp4') || href.includes('download') || href.includes('lnk-lnk')));
          
          if (isMatch) {
            if ((href.startsWith('/') || href.startsWith('#') || href.includes('javascript:')) && !isDownloadPath) return;
            if (href.includes('telegram') || href.includes('t.me') || href.includes('facebook') || href.includes('twitter') || href.includes('instagram') || href.includes('youtube')) return;
            if (/\.(png|jpg|jpeg|gif|css|js|woff|ttf|svg)$/i.test(href)) return;
            
            let text = getDownloadTitle($, el);
            if (!text || text.length < 5) {
              text = isTvEpisode ? 'Download Episode' : 'Download Movie';
            }
            if (!href.startsWith('http')) {
              href = new URL(href, detailUrl).href;
            }
            try {
              const urlObj = new URL(href);
              if (urlObj.hostname.includes('checkyourlinks') && (urlObj.pathname === '/' || urlObj.pathname === '' || urlObj.pathname === '/index.php')) {
                return;
              }
            } catch(e) {}
            const cleanHref = sanitizeScrapedLink(href);
            const maskedUrl = `/api/download?id=${Buffer.from(cleanHref).toString('base64')}`;
            
            if (!downloads.some(d => d.url === maskedUrl)) {
              downloads.push({
                title: text,
                url: maskedUrl,
                isEpisode: isTvEpisode
              });
            }
          }
        });
      }

      if (!streamUrl) {
        $('video source').each((i, el) => {
          const src = $(el).attr('src');
          if (src && src.includes('.mp4')) {
            streamUrl = src;
            return false;
          }
        });
        if (!streamUrl) {
          $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('.mp4')) {
              streamUrl = href;
              return false;
            }
          });
        }
      }
    }

    // Fetch IMDb ID for this movie/show
    let imdbId = null;
    try {
      imdbId = await getImdbIdByTitle(title);
    } catch (err) {
      console.error('Error fetching IMDb ID:', err.message);
    }

    // Mask direct streamUrl
    if (streamUrl) {
      streamUrl = sanitizeScrapedLink(streamUrl);
    }
    let maskedStreamUrl = streamUrl ? `/api/stream-play?id=${Buffer.from(streamUrl).toString('base64')}` : null;
    
    // Fallback: if direct streamUrl is not found, extract from first available download link
    if (!maskedStreamUrl && downloads && downloads.length > 0) {
      // 1. Try to find a direct .mp4 link
      let validDwd = downloads.find(d => {
        try {
          const base64Id = d.url.split('?id=')[1];
          const rawUrl = Buffer.from(base64Id, 'base64').toString('utf8');
          return rawUrl && rawUrl.includes('.mp4') && !rawUrl.includes('.html');
        } catch(e) { return false; }
      });
      
      // 2. Fallback to any non-html link if no .mp4 link is present
      if (!validDwd) {
        validDwd = downloads.find(d => {
          try {
            const base64Id = d.url.split('?id=')[1];
            const rawUrl = Buffer.from(base64Id, 'base64').toString('utf8');
            return rawUrl && !rawUrl.includes('.html');
          } catch(e) { return false; }
        });
      }
      
      if (validDwd) {
        try {
          const base64Id = validDwd.url.split('?id=')[1];
          const rawUrl = Buffer.from(base64Id, 'base64').toString('utf8');
          maskedStreamUrl = `/api/stream-play?id=${Buffer.from(rawUrl).toString('base64')}`;
        } catch(e) {}
      }
    }

    const result = {
      title: cleanTitleBranding(title),
      infoHtml: cleanTitleBranding(infoHtml),
      plot: cleanTitleBranding(plot),
      screenshots: screenshots.slice(0, 8), // limit to 8 screenshots
      downloads: downloads.map(d => ({
        title: cleanTitleBranding(d.title),
        url: d.url,
        isEpisode: d.isEpisode
      })),
      imdbId,
      streamUrl: maskedStreamUrl
    };

    cache.details[detailUrl] = {
      timestamp: Date.now(),
      data: result
    };

    res.json(result);
  } catch (error) {
    console.error("Error in /api/movie-details:", error);
    res.status(500).json({ error: 'Failed to parse movie details', details: error.message });
  }
});

// 2b. API: Fetch direct masked stream url for any episode on demand
app.get('/api/episode-stream', async (req, res) => {
  const episodeId = req.query.id;
  if (!episodeId) {
    return res.status(400).json({ error: 'Missing episode ID' });
  }

  try {
    let episodeUrl = Buffer.from(episodeId, 'base64').toString('utf8');
    if (episodeUrl.startsWith('/')) {
      episodeUrl = new URL(episodeUrl, TARGET_BASE_URL).href;
    }

    console.log(`[Scraper] Fetching direct stream URL for episode: ${episodeUrl}`);
    const html = await fetchHtml(episodeUrl);
    const $ = cheerio.load(html);

    const matches = [];
    $('video source').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('.mp4')) {
        matches.push(src.startsWith('http') ? src : new URL(src, episodeUrl).href);
      }
    });
    $('video').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('.mp4')) {
        matches.push(src.startsWith('http') ? src : new URL(src, episodeUrl).href);
      }
    });
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.includes('.html') && (href.includes('checkyourlinks') || href.includes('cdn') || href.includes('netmirror') || href.includes('.mp4') || href.includes('download') || href.includes('lnk-lnk'))) {
        matches.push(href.startsWith('http') ? href : new URL(href, episodeUrl).href);
      }
    });

    const uniqueMatches = [...new Set(matches.map(m => sanitizeScrapedLink(m)))];
    let streamUrl = uniqueMatches.find(m => m.includes('checkyourlinks') && m.includes('.mp4') && !m.includes('?id=')) ||
                    uniqueMatches.find(m => m.includes('checkyourlinks') && !m.includes('?id=')) ||
                    uniqueMatches.find(m => m.includes('.mp4') && !m.includes('?id=')) ||
                    uniqueMatches.find(m => m.includes('checkyourlinks')) ||
                    uniqueMatches[0] || null;

    if (streamUrl) {
      // Auto append index.php to query-only checkyourlinks URL to prevent FastCGI errors
      try {
        const urlObj = new URL(streamUrl);
        if (urlObj.hostname.includes('checkyourlinks') && (urlObj.pathname === '/' || urlObj.pathname === '')) {
          urlObj.pathname = '/index.php';
          streamUrl = urlObj.href;
        }
      } catch(e) {}

      const maskedStreamUrl = `/api/stream-play?id=${Buffer.from(streamUrl).toString('base64')}`;
      return res.json({ streamUrl: maskedStreamUrl });
    }

    res.status(404).json({ error: 'Direct video stream URL could not be resolved from this episode page' });
  } catch (error) {
    console.error("Error in /api/episode-stream:", error.message);
    res.status(500).json({ error: 'Failed to resolve episode stream', details: error.message });
  }
});

// 3. API: Masked download redirect
app.get('/api/download', async (req, res) => {
  const maskedId = req.query.id;
  if (!maskedId) {
    return res.status(400).send('Invalid download request');
  }

  try {
    let originalUrl = Buffer.from(maskedId, 'base64').toString('utf8');
    originalUrl = resolveOkJattUrl(originalUrl);
    
    // Resolve relative URLs if any
    if (originalUrl.startsWith('/')) {
      originalUrl = new URL(originalUrl, TARGET_BASE_URL).href;
    }

    // Force HTTPS for netmirror/cdn (but NOT checkyourlinks, which times out on HTTPS port 443)
    if (originalUrl.startsWith('http://') && !originalUrl.includes('checkyourlinks') && (originalUrl.includes('cdn') || originalUrl.includes('netmirror'))) {
      originalUrl = originalUrl.replace('http://', 'https://');
    }

    // Append index.php for checkyourlinks root queries to prevent FastCGI 'No input file specified' error
    try {
      const urlObj = new URL(originalUrl);
      if (urlObj.hostname.includes('checkyourlinks') && (urlObj.pathname === '/' || urlObj.pathname === '')) {
        urlObj.pathname = '/index.php';
        originalUrl = urlObj.href;
      }
    } catch(e) {}

    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      // If it's a web page, instead of redirecting directly (which exposes okjatt), scrape it for direct download link
      if (originalUrl.includes('.html')) {
        try {
          const html = await fetchHtml(originalUrl);
          const $dwd = cheerio.load(html);
          const matches = [];
          $dwd('video source').each((i, el) => {
            const src = $dwd(el).attr('src');
            if (src && src.includes('.mp4')) {
              matches.push(src.startsWith('http') ? src : new URL(src, originalUrl).href);
            }
          });
          $dwd('video').each((i, el) => {
            const src = $dwd(el).attr('src');
            if (src && src.includes('.mp4')) {
              matches.push(src.startsWith('http') ? src : new URL(src, originalUrl).href);
            }
          });
          $dwd('a').each((i, el) => {
            let href = $dwd(el).attr('href');
            if (href && !href.includes('.html') && (href.includes('checkyourlinks') || href.includes('cdn') || href.includes('netmirror') || href.includes('.mp4') || href.includes('download') || href.includes('lnk-lnk'))) {
              matches.push(href.startsWith('http') ? href : new URL(href, originalUrl).href);
            }
          });
          const uniqueMatches = [...new Set(matches.map(m => sanitizeScrapedLink(m)))];
          let directUrl = uniqueMatches.find(m => m.includes('checkyourlinks') && m.includes('.mp4') && !m.includes('?id=')) ||
                          uniqueMatches.find(m => m.includes('checkyourlinks') && !m.includes('?id=')) ||
                          uniqueMatches.find(m => m.includes('.mp4') && !m.includes('?id=')) ||
                          uniqueMatches.find(m => m.includes('checkyourlinks')) ||
                          uniqueMatches[0] || null;
          
          if (directUrl) {
            if (directUrl.startsWith('http://') && !directUrl.includes('checkyourlinks') && (directUrl.includes('cdn') || directUrl.includes('netmirror'))) {
              directUrl = directUrl.replace('http://', 'https://');
            }
            return res.redirect(`/api/download?id=${Buffer.from(directUrl).toString('base64')}`);
          }
        } catch (e) {
          console.error('Failed to resolve nested html download link:', e.message);
        }
        // Fallback: send 404 instead of opening okjatt.com
        return res.status(404).send('Direct download link could not be parsed for this server page.');
      }

      // If it's a direct file, stream it to force download
      let filename = 'movie.mp4';
      try {
        const urlObj = new URL(originalUrl);
        const pathname = urlObj.pathname;
        const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (lastPart && lastPart.includes('.')) {
          filename = decodeURIComponent(lastPart);
        } else {
          const idParam = urlObj.searchParams.get('id') || 'movie';
          filename = `${idParam}.mp4`;
        }
      } catch (e) {}

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      let refererUrl = 'https://netmirror.global/';
      try {
        const urlObj = new URL(originalUrl);
        if (urlObj.hostname.includes('watch22') || urlObj.hostname.includes('hakunaymatata')) {
          refererUrl = 'https://speed.watch22.shop/';
        } else {
          const refererHost = urlObj.searchParams.get('d') || urlObj.hostname;
          refererUrl = `https://${refererHost}/`;
        }
      } catch (e) {}

      const response = await axios({
        method: 'get',
        url: originalUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': refererUrl
        },
        httpsAgent: httpsAgent
      });

      if (response.headers['content-type']) {
        res.setHeader('content-type', response.headers['content-type']);
      }
      if (response.headers['content-length']) {
        res.setHeader('content-length', response.headers['content-length']);
      }

      response.data.pipe(res);
    } else {
      res.status(400).send('Malformed download URL');
    }
  } catch (error) {
    console.error('Download stream error, falling back to redirect:', error);
    try {
      let originalUrl = Buffer.from(maskedId, 'base64').toString('utf8');
      if (originalUrl.startsWith('/')) {
        originalUrl = new URL(originalUrl, TARGET_BASE_URL).href;
      }
      res.redirect(originalUrl);
    } catch (fallbackErr) {
      res.status(500).send('Error decrypting download URL');
    }
  }
});

// 4. API: Masked native streaming proxy with Range support (bypasses CORS/Referer blocks)
app.get('/api/stream-play', async (req, res) => {
  const maskedId = req.query.id;
  if (!maskedId) {
    return res.status(400).send('Invalid stream request');
  }

  try {
    let originalUrl = Buffer.from(maskedId, 'base64').toString('utf8');
    originalUrl = resolveOkJattUrl(originalUrl);
    
    // Resolve relative URLs if any
    if (originalUrl.startsWith('/')) {
      originalUrl = new URL(originalUrl, TARGET_BASE_URL).href;
    }

    // Force HTTPS for netmirror/cdn (but NOT checkyourlinks, which times out on HTTPS port 443)
    if (originalUrl.startsWith('http://') && !originalUrl.includes('checkyourlinks') && (originalUrl.includes('cdn') || originalUrl.includes('netmirror'))) {
      originalUrl = originalUrl.replace('http://', 'https://');
    }

    // Append index.php for checkyourlinks root queries to prevent FastCGI errors
    try {
      const urlObj = new URL(originalUrl);
      if (urlObj.hostname.includes('checkyourlinks') && (urlObj.pathname === '/' || urlObj.pathname === '')) {
        urlObj.pathname = '/index.php';
        originalUrl = urlObj.href;
      }
    } catch(e) {}

    // If it's a web page, scrape it for the direct stream link
    if (originalUrl.includes('.html')) {
      try {
        console.log(`[Proxy Stream] Resolving nested HTML download page: ${originalUrl}`);
        const html = await fetchHtml(originalUrl);
        const $dwd = cheerio.load(html);
        const matches = [];
        $dwd('video source').each((i, el) => {
          const src = $dwd(el).attr('src');
          if (src && src.includes('.mp4')) {
            matches.push(src.startsWith('http') ? src : new URL(src, originalUrl).href);
          }
        });
        $dwd('video').each((i, el) => {
          const src = $dwd(el).attr('src');
          if (src && src.includes('.mp4')) {
            matches.push(src.startsWith('http') ? src : new URL(src, originalUrl).href);
          }
        });
        $dwd('a').each((i, el) => {
          const href = $dwd(el).attr('href');
          if (href && !href.includes('.html') && (href.includes('checkyourlinks') || href.includes('cdn') || href.includes('netmirror') || href.includes('.mp4') || href.includes('download') || href.includes('lnk-lnk'))) {
            matches.push(href.startsWith('http') ? href : new URL(href, originalUrl).href);
          }
        });
        const uniqueMatches = [...new Set(matches.map(m => sanitizeScrapedLink(m)))];
        let directUrl = uniqueMatches.find(m => m.includes('checkyourlinks') && m.includes('.mp4') && !m.includes('?id=')) ||
                        uniqueMatches.find(m => m.includes('checkyourlinks') && !m.includes('?id=')) ||
                        uniqueMatches.find(m => m.includes('.mp4') && !m.includes('?id=')) ||
                        uniqueMatches.find(m => m.includes('checkyourlinks')) ||
                        uniqueMatches[0] || null;
        
        if (directUrl) {
          if (directUrl.startsWith('http://') && !directUrl.includes('checkyourlinks') && (directUrl.includes('cdn') || directUrl.includes('netmirror'))) {
            directUrl = directUrl.replace('http://', 'https://');
          }
          
          try {
            const urlObj = new URL(directUrl);
            if (urlObj.hostname.includes('checkyourlinks') && (urlObj.pathname === '/' || urlObj.pathname === '')) {
              urlObj.pathname = '/index.php';
              directUrl = urlObj.href;
            }
          } catch(e) {}
          
          console.log(`[Proxy Stream] Resolved direct URL from HTML: ${directUrl}`);
          originalUrl = directUrl;
        } else {
          console.error('[Proxy Stream] No direct stream URL parsed from HTML page.');
        }
      } catch (err) {
        console.error('[Proxy Stream] Failed to resolve nested HTML stream:', err.message);
      }
    }

    console.log(`[Proxy Stream] Streaming from CDN: ${originalUrl}`);

    const range = req.headers.range;
    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };

    // Extract hostname for referrer to prevent hotlinking blocks
    try {
      const urlObj = new URL(originalUrl);
      if (urlObj.hostname.includes('watch22') || urlObj.hostname.includes('hakunaymatata')) {
        requestHeaders['Referer'] = 'https://speed.watch22.shop/';
      } else {
        const refererHost = urlObj.searchParams.get('d') || urlObj.hostname;
        requestHeaders['Referer'] = `https://${refererHost}/`;
      }
    } catch (e) {
      requestHeaders['Referer'] = 'https://speed.watch22.shop/';
    }

    if (range) {
      requestHeaders['Range'] = range;
    }

    let response;
    try {
      response = await axios({
        method: 'get',
        url: originalUrl,
        responseType: 'stream',
        headers: requestHeaders,
        timeout: 30000,
        httpsAgent: httpsAgent
      });
    } catch (err) {
      const refresh = req.query.refresh;
      if (err.response && err.response.status === 403 && refresh) {
        console.log('[Proxy Stream] Signature expired (403). Refreshing NetMirror URL...');
        try {
          const refreshParams = Buffer.from(refresh, 'base64').toString('utf8');
          const refreshUrl = `http://localhost:3000/api/netmirror-stream?${refreshParams}`;
          const refreshRes = await axios.get(refreshUrl, { timeout: 8000 });
          if (refreshRes.data && refreshRes.data.streamUrl) {
            const newMaskedId = new URL(refreshRes.data.streamUrl, 'http://localhost:3000').searchParams.get('id');
            const freshUrl = Buffer.from(newMaskedId, 'base64').toString('utf8');
            console.log(`[Proxy Stream] Successfully refreshed URL: ${freshUrl}`);
            
            const freshUrlObj = new URL(freshUrl);
            const freshSign = freshUrlObj.searchParams.get('sign');
            const freshT = freshUrlObj.searchParams.get('t');
            
            const origUrlObj = new URL(originalUrl);
            origUrlObj.searchParams.set('sign', freshSign);
            origUrlObj.searchParams.set('t', freshT);
            originalUrl = origUrlObj.href;
            
            response = await axios({
              method: 'get',
              url: originalUrl,
              responseType: 'stream',
              headers: requestHeaders,
              timeout: 30000,
              httpsAgent: httpsAgent
            });
          } else {
            throw new Error('Refresh response missing streamUrl');
          }
        } catch (refreshErr) {
          console.error('[Proxy Stream] Failed to refresh stream link:', refreshErr.message);
          throw err;
        }
      } else {
        throw err;
      }
    }

    // Set appropriate status
    res.status(response.status);

    // Copy range and file-related headers from target to client response
    const headersToForward = [
      'content-range',
      'accept-ranges',
      'content-length',
      'content-type',
      'content-disposition',
      'cache-control'
    ];

    headersToForward.forEach(header => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    // Ensure accept-ranges is set
    if (!res.getHeader('accept-ranges')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    // Pipe the response data stream directly to the express response
    response.data.pipe(res);

    // Handle connection close by client (e.g. paused/seeked video)
    req.on('close', () => {
      if (response.data && response.data.destroy) {
        response.data.destroy();
      }
    });
  } catch (error) {
    console.error('Streaming proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).send('Streaming error: ' + error.message);
    }
  }
});

// 5. API: NetMirror signed stream URL generator
app.get('/api/netmirror-stream', async (req, res) => {
  let { subjectid, se, ep, dp, title } = req.query;
  if (!subjectid) {
    return res.status(400).json({ error: 'Missing subjectid' });
  }

  try {
    let resolvedSubjectId = subjectid;
    let resolvedDp = dp || '';
    let resolvedTitle = title || '';
    let mediaType = (se && se !== '0') ? 'tv' : 'movie';

    if (subjectid.startsWith('tt')) {
      console.log(`[Resolver] IMDb ID detected in stream generator: ${subjectid}. Searching NetMirror for: "${title}"...`);
      const cleanTitle = cleanMovieTitle(title);
      try {
        const searchUrl = `https://api2.imdb4.shop/api/search2/${encodeURIComponent(cleanTitle)}?page=0`;
        const searchRes = await axiosGetWithRetry(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
        const results = searchRes.data.results || [];
        
        let matchedItem = null;
        if (results.length > 0) {
          matchedItem = results.find(item => item.media_type === mediaType) || results[0];
        }
        
        if (matchedItem) {
          const detailUrl = `https://api2.imdb3.shop/api/${matchedItem.media_type || mediaType}/${matchedItem.id}`;
          const detailRes = await axiosGetWithRetry(detailUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
          const item = detailRes.data.results ? detailRes.data.results[0] : null;
          if (item) {
            resolvedSubjectId = item.subjectid || item.id;
            resolvedDp = item.dp || '';
            resolvedTitle = item.title || title;
            mediaType = item.media_type || mediaType;
            console.log(`[Resolver] NetMirror ID mapped successfully: ${subjectid} -> ${resolvedSubjectId}`);
          }
        }
      } catch (err) {
        console.error('[Resolver] NetMirror search lookup error:', err.message);
      }
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', 'net###@@sss').update(String(timestamp)).digest('hex');
    
    function z(ge) {
      const enc = new TextEncoder();
      const Ye = enc.encode(ge);
      let binary = '';
      const len = Ye.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(Ye[i]);
      }
      return binary;
    }
    
    const na = encodeURIComponent(Buffer.from(z(resolvedTitle || ''), 'binary').toString('base64'));
    
    let playUrl = `https://speed.watch22.shop/play/watchbox.php?id=${resolvedSubjectId}&se=${se || 0}&ep=${ep || 0}&dp=${encodeURIComponent(resolvedDp)}&na=${na}`;
    playUrl += `&ts=${timestamp}&sig=${signature}&exten=false`;
    
    // Attempt to scrape direct mp4 video stream URLs from the player page
    try {
      // NetMirror API hit is required first to initialize session
      const apiDetailUrl = `https://api2.imdb3.shop/api/${mediaType}/${resolvedSubjectId}`;
      await axiosGetWithRetry(apiDetailUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 4000
      }).catch(() => {});

      const response = await axiosGetWithRetry(playUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://netmirror.global/'
        },
        timeout: 8000
      });
      
      const html = response.data;
      console.log(`[Scraper] Fetched watchbox HTML length: ${html.length}. Content snippet: ${html.substring(0, 100).trim().replace(/\s+/g, ' ')}`);
      
      const mp4Links = [];
      const regex = /myFunction(?:_dl)?\('([^']+)'/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const link = match[1];
        if (link && link.startsWith('http') && !mp4Links.includes(link)) {
          mp4Links.push(link);
        }
      }
      
      console.log(`[Scraper] Parsed direct MP4 links count: ${mp4Links.length}`);
      if (mp4Links.length > 0) {
        // Choose the highest quality stream and ensure it uses the whitelisted bcdn.watch22.shop streaming domain
        const targetMp4 = mp4Links[0].replace('bcdnxw.hakunaymatata.com', 'bcdn.watch22.shop');
        
        // Append refresh metadata parameter to allow auto-resigning when range requests hit 403 (signature expiry)
        const refreshParams = `subjectid=${subjectid}&se=${se || 0}&ep=${ep || 0}&dp=${encodeURIComponent(dp || '')}&title=${encodeURIComponent(title || '')}`;
        const maskedStreamUrl = `/api/stream-play?id=${Buffer.from(targetMp4).toString('base64')}&refresh=${Buffer.from(refreshParams).toString('base64')}`;
        
        return res.json({ streamUrl: maskedStreamUrl });
      }
    } catch (scrapeErr) {
      console.error("Failed to parse direct MP4 links from NetMirror player, falling back to iframe:", scrapeErr.message);
    }
    
    return res.json({ iframeUrl: playUrl });
  } catch (err) {
    console.error("Failed to generate NetMirror stream URL:", err.message);
    res.status(500).json({ error: 'Failed to generate NetMirror stream signature' });
  }
});

// Catch-all route to serve the SPA frontend with caching disabled
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
