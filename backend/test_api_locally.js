const axios = require('axios');

async function main() {
  const url = 'http://localhost:4000/api/cj-shopify-usa/discover/search';
  const params = { keyword: 'pet supplies', page: 1, pageSize: 20 };
  
  // We need a valid token. Since I am on the server, I'll try to find an active token or bypass auth if possible.
  // Actually, I'll just use the admin user's credentials to login first.
  
  try {
    console.log(`Calling ${url} with params:`, params);
    const loginRes = await axios.post('http://localhost:4000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log('Login successful');
    
    const res = await axios.get(url, {
      params,
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Response Status:', res.status);
    console.log('Response Data:', JSON.stringify(res.data, null, 2).substring(0, 500));
  } catch (err) {
    if (err.response) {
      console.log('Error Status:', err.response.status);
      console.log('Error Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
  }
}

main();
