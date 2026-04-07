import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const code = '1000.cf2e7efde7942099c1d901529080ddee.2ff1d9a5f37deae9708f79e2ad0a686b';
    const accountsServer = 'https://accounts.zoho.com';
    
    console.log('Exchanging code for token...');
    const tokenRes = await axios.post(`${accountsServer}/oauth/v2/token`, null, {
      params: {
        code,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        redirect_uri: `${process.env.APP_URL}/auth/zoho/callback`,
        grant_type: 'authorization_code',
      },
    });
    
    console.log('Token Response:', tokenRes.data);
    
    if (tokenRes.data.access_token) {
      console.log('Fetching leads...');
      const apiDomain = tokenRes.data.api_domain || 'https://www.zohoapis.com';
      const leadsRes = await axios.get(`${apiDomain}/crm/v3/Leads`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokenRes.data.access_token}`
        }
      });
      console.log('Leads:', leadsRes.data);
    }
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
}

run();
