const axios = require('axios');

async function main() {
  const apiKey = process.env.CJ_API_KEY || 'no-key';
  const t0 = Date.now();
  try {
    const authRes = await axios.post('https://developers.cjdropshipping.com/api2.0/v2/authentication/getAccessToken', { apiKey });
    const accessToken = authRes.data.data.accessToken;
    console.log('Auth Latency:', Date.now() - t0, 'ms');
    
    const t1 = Date.now();
    const searchRes = await axios.get('https://developers.cjdropshipping.com/api2.0/v2/product/listV2', {
      params: { keyword: 'pet supplies', pageNum: 1, pageSize: 20 },
      headers: { 'CJ-Access-Token': accessToken }
    });
    console.log('Search Latency:', Date.now() - t1, 'ms');
    console.log('Total Latency:', Date.now() - t0, 'ms');
    console.log('Result count:', searchRes.data.data.list?.length || searchRes.data.data.content?.length);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
