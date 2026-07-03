const axios = require('axios');

async function testOkJatt() {
  const domains = [
    'https://okjatt.net',
    'https://okjatt.bond',
    'https://okjatt.org',
    'https://okjatt.vip',
    'https://okjatt.in',
    'https://okjatt.com'
  ];

  for (const dom of domains) {
    try {
      console.log(`Testing GET ${dom}...`);
      const res = await axios.get(dom + '/movies/src_data.php?q=welcome', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 4000
      });
      console.log(`Success! ${dom} -> Status: ${res.status}`);
      return; // Stop at first working domain
    } catch (err) {
      console.log(`Failed: ${dom} -> ${err.message}`);
      if (err.response) {
        console.log(`  Response Status: ${err.response.status}`);
      }
    }
  }
}

testOkJatt();
