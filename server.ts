import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import axios from 'axios';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = 3000;

app.set('trust proxy', 1); // Required for secure cookies behind a proxy
app.use(express.json());

// Normalize APP_URL
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REGION = process.env.ZOHO_REGION || 'com';

const googleOAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${APP_URL}/auth/google/callback`
);

// --- Google Auth Routes ---
app.get('/api/auth/google/url', (req, res) => {
  const url = googleOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
    prompt: 'consent',
  });
  res.json({ url });
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await googleOAuth2Client.getToken(code as string);
    (req.session as any).googleTokens = tokens;
    
    // Explicitly save session before sending response
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session save failed');
      }
      
      res.send(`
        <html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
            <div style="background: white; padding: 2rem; rounded: 1rem; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center;">
              <h1 style="color: #16a34a; margin-bottom: 1rem;">Success!</h1>
              <p style="color: #475569; margin-bottom: 2rem;">Google Authentication successful. This window should close automatically.</p>
              <button id="closeBtn" style="background: #2563eb; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: bold; cursor: pointer;">Close Window</button>
            </div>
            <script>
              const type = 'GOOGLE_AUTH_SUCCESS';
              
              // 1. Storage Event (Most reliable for cross-window)
              localStorage.setItem('oauth_event', JSON.stringify({ type, payload: ${JSON.stringify(tokens)}, timestamp: Date.now() }));
              
              // 2. BroadcastChannel
              try {
                const channel = new BroadcastChannel('oauth_channel');
                channel.postMessage({ type, payload: ${JSON.stringify(tokens)} });
              } catch (e) {}
              
              // 3. postMessage to Opener
              if (window.opener) {
                window.opener.postMessage({ type, payload: ${JSON.stringify(tokens)} }, '*');
              }

              const closeWindow = () => {
                window.close();
                // Fallback if window.close() is blocked
                setTimeout(() => {
                  if (!window.closed) {
                    document.getElementById('closeBtn').style.display = 'block';
                  }
                }, 500);
              };

              document.getElementById('closeBtn').onclick = () => window.close();
              
              // Auto-close
              setTimeout(closeWindow, 500);
            </script>
          </body>
        </html>
      `);
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// --- Zoho Auth Routes ---
app.get('/api/auth/zoho/url', (req, res) => {
  const params = new URLSearchParams({
    client_id: ZOHO_CLIENT_ID!,
    redirect_uri: `${APP_URL}/auth/zoho/callback`,
    response_type: 'code',
    access_type: 'offline',
    scope: 'ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.ALL',
    prompt: 'consent',
  });
  const url = `https://accounts.zoho.${ZOHO_REGION}/oauth/v2/auth?${params}`;
  res.json({ url });
});

app.get('/auth/zoho/callback', async (req, res) => {
  const { code, 'accounts-server': accountsServer } = req.query;
  try {
    const tokenUrl = accountsServer 
      ? `${accountsServer}/oauth/v2/token` 
      : `https://accounts.zoho.${ZOHO_REGION}/oauth/v2/token`;

    const response = await axios.post(tokenUrl, null, {
      params: {
        code,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        redirect_uri: `${APP_URL}/auth/zoho/callback`,
        grant_type: 'authorization_code',
      },
    });
    
    if (response.data.error) {
      console.error('Zoho Token Error:', response.data);
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
            <h1 style="color: #ef4444;">Authentication Failed</h1>
            <p>Zoho returned an error: <strong>${response.data.error}</strong></p>
            <p>Please check your Client ID and Client Secret in the app settings.</p>
          </body>
        </html>
      `);
    }

    (req.session as any).zohoTokens = response.data;
    res.send(`
      <html>
        <head><title>Authentication Successful</title></head>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
          <div style="background: white; padding: 2rem; rounded: 1rem; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center;">
            <h1 style="color: #16a34a; margin-bottom: 1rem;">Success!</h1>
            <p style="color: #475569; margin-bottom: 2rem;">Zoho Authentication successful. This window should close automatically.</p>
            <button id="closeBtn" style="background: #2563eb; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: bold; cursor: pointer;">Close Window</button>
          </div>
          <script>
            const type = 'ZOHO_AUTH_SUCCESS';
            const payload = ${JSON.stringify(response.data)};
            
            // 1. Storage Event
            localStorage.setItem('oauth_event', JSON.stringify({ type, payload, timestamp: Date.now() }));
            
            // 2. BroadcastChannel
            try {
              const channel = new BroadcastChannel('oauth_channel');
              channel.postMessage({ type, payload });
            } catch (e) {}
            
            // 3. postMessage to Opener
            if (window.opener) {
              window.opener.postMessage({ type, payload }, '*');
            }

            const closeWindow = () => {
              window.close();
              setTimeout(() => {
                if (!window.closed) {
                  document.getElementById('closeBtn').style.display = 'block';
                }
              }, 500);
            };

            document.getElementById('closeBtn').onclick = () => window.close();
            
            setTimeout(closeWindow, 500);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Zoho Auth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// --- API Routes ---
app.get('/api/status', (req, res) => {
  res.json({
    config: {
      google: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      zoho: !!process.env.ZOHO_CLIENT_ID && !!process.env.ZOHO_CLIENT_SECRET,
      appUrl: !!process.env.APP_URL,
    }
  });
});

app.get('/api/sheets', async (req, res) => {
  console.log('GET /api/sheets headers:', req.headers);
  let googleTokensStr = req.headers['x-google-tokens'] as string;
  
  if (!googleTokensStr && req.headers.authorization?.startsWith('Bearer ')) {
    try {
      googleTokensStr = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf-8');
    } catch (e) {
      console.error('Failed to parse Authorization header', e);
    }
  }

  if (!googleTokensStr) {
    return res.status(401).json({ 
      error: 'Not connected to Google', 
      receivedHeaders: req.headers 
    });
  }
  
  const googleTokens = JSON.parse(googleTokensStr);
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${APP_URL}/auth/google/callback`);
  client.setCredentials(googleTokens);
  
  const drive = google.drive({ version: 'v3', auth: client });
  
  try {
    console.log('Fetching sheets from Google Drive...');
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id, name)',
      pageSize: 50,
    });
    console.log(`Found ${response.data.files?.length || 0} sheets`);
    res.json(response.data.files || []);
  } catch (error: any) {
    console.error('Failed to fetch sheets:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch sheets', details: error.message });
  }
});

app.get('/api/sheets/:spreadsheetId/data', async (req, res) => {
  let googleTokensStr = req.headers['x-google-tokens'] as string;
  if (!googleTokensStr && req.headers.authorization?.startsWith('Bearer ')) {
    try {
      googleTokensStr = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf-8');
    } catch (e) {}
  }

  if (!googleTokensStr) return res.status(401).json({ error: 'Not connected to Google' });
  
  const { spreadsheetId } = req.params;
  const googleTokens = JSON.parse(googleTokensStr);
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${APP_URL}/auth/google/callback`);
  client.setCredentials(googleTokens);
  const sheets = google.sheets({ version: 'v4', auth: client });
  
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = meta.data.sheets?.[0]?.properties?.title;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Z100`,
    });
    res.json(response.data.values);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sheet data' });
  }
});

async function refreshZohoToken(zohoTokens: any) {
  if (!zohoTokens.refresh_token) return zohoTokens;
  try {
    const tokenUrl = `https://accounts.zoho.${ZOHO_REGION}/oauth/v2/token`;
    const response = await axios.post(tokenUrl, null, {
      params: {
        refresh_token: zohoTokens.refresh_token,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      }
    });
    if (response.data.access_token) {
      return { ...zohoTokens, access_token: response.data.access_token };
    }
  } catch (e: any) {
    console.error('Failed to refresh Zoho token:', e.response?.data || e.message);
  }
  return zohoTokens;
}

app.post('/api/zoho/metadata', async (req, res) => {
  let { zohoTokens } = req.body;
  if (!zohoTokens) return res.status(401).json({ error: 'Not connected to Zoho' });

  try {
    let apiDomain = zohoTokens.api_domain || `https://www.zohoapis.${ZOHO_REGION}`;
    let tokenRefreshed = false;
    
    // Helper to make request and handle token refresh
    const makeRequest = async (url: string) => {
      try {
        return await axios.get(url, {
          headers: { Authorization: `Zoho-oauthtoken ${zohoTokens.access_token}` }
        });
      } catch (e: any) {
        if (e.response?.status === 401 && !tokenRefreshed) {
          const newTokens = await refreshZohoToken(zohoTokens);
          if (newTokens.access_token !== zohoTokens.access_token) {
            zohoTokens = newTokens;
            tokenRefreshed = true;
            return await axios.get(url, {
              headers: { Authorization: `Zoho-oauthtoken ${zohoTokens.access_token}` }
            });
          }
        }
        throw e;
      }
    };

    let leadStatusField, leadSourceField, users = [];

    // Fetch Fields for Leads
    try {
      let fieldsRes;
      try {
        fieldsRes = await makeRequest(`${apiDomain}/crm/v3/settings/fields?module=Leads`);
      } catch (e: any) {
        console.warn('V3 fields fetch failed, trying V2:', e.response?.data || e.message);
        fieldsRes = await makeRequest(`${apiDomain}/crm/v2/settings/fields?module=Leads`);
      }
      
      if (fieldsRes.data.fields) {
        leadStatusField = fieldsRes.data.fields.find((f: any) => f.api_name === 'Lead_Status');
        leadSourceField = fieldsRes.data.fields.find((f: any) => f.api_name === 'Lead_Source');
      } else {
        console.error('No fields found in response:', fieldsRes.data);
      }
    } catch (e: any) {
      console.error('Failed to fetch fields (V3 & V2):', e.response?.data || e.message);
      if (e.response?.status === 401 || e.response?.data?.code === 'OAUTH_SCOPE_MISMATCH') {
        return res.status(401).json({ error: 'Zoho permissions changed. Please reconnect Zoho CRM.' });
      }
    }
    
    // Fetch Users
    try {
      let usersRes;
      try {
        usersRes = await makeRequest(`${apiDomain}/crm/v3/users?type=ActiveUsers`);
      } catch (e: any) {
        console.warn('V3 users fetch failed, trying V2:', e.response?.data || e.message);
        usersRes = await makeRequest(`${apiDomain}/crm/v2/users?type=ActiveUsers`);
      }
      users = usersRes.data.users || [];
    } catch (e: any) {
      console.error('Failed to fetch users (V3 & V2):', e.response?.data || e.message);
      if (e.response?.status === 401 || e.response?.data?.code === 'OAUTH_SCOPE_MISMATCH') {
        return res.status(401).json({ error: 'Zoho permissions changed. Please reconnect Zoho CRM.' });
      }
    }

    res.json({
      leadStatus: leadStatusField?.pick_list_values || [],
      leadSource: leadSourceField?.pick_list_values || [],
      users: users,
      zohoTokens: tokenRefreshed ? zohoTokens : undefined
    });
  } catch (error: any) {
    console.error('Zoho Metadata Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch Zoho metadata' });
  }
});

app.post('/api/sync', async (req, res) => {
  const { spreadsheetId, mapping, fixedValues, updateExisting, duplicateCheckField, googleTokens: bodyGoogleTokens, zohoTokens: bodyZohoTokens } = req.body;
  const googleTokensStr = (req.headers['x-google-tokens'] as string) || (bodyGoogleTokens ? JSON.stringify(bodyGoogleTokens) : null);
  const zohoTokensStr = (req.headers['x-zoho-tokens'] as string) || (bodyZohoTokens ? JSON.stringify(bodyZohoTokens) : null);

  if (!googleTokensStr || !zohoTokensStr) {
    return res.status(401).json({ error: 'Not connected to both services' });
  }

  try {
    const googleTokens = JSON.parse(googleTokensStr);
    const zohoTokens = JSON.parse(zohoTokensStr);

    // 1. Fetch data from Google Sheets
    const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${APP_URL}/auth/google/callback`);
    client.setCredentials(googleTokens);
    const sheets = google.sheets({ version: 'v4', auth: client });
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = meta.data.sheets?.[0]?.properties?.title;
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Z100`,
    });
    const rows = sheetResponse.data.values;
    if (!rows || rows.length < 2) return res.status(400).json({ error: 'No data found in sheet' });

    const headers = rows[0];
    let dataRows = rows.slice(1);
    
    if (req.body.selectedRows && Array.isArray(req.body.selectedRows)) {
      dataRows = dataRows.filter((_, index) => req.body.selectedRows.includes(index));
    }

    if (dataRows.length === 0) {
      return res.status(400).json({ error: 'No rows selected for sync' });
    }

    // 2. Prepare data for Zoho
    const zohoData = dataRows.map(row => {
      const record: any = {};
      // Map columns
      if (mapping) {
        Object.entries(mapping).forEach(([zohoField, sheetHeader]) => {
          const headerIndex = headers.indexOf(sheetHeader as string);
          if (headerIndex !== -1) {
            let value = row[headerIndex];
            
            // Format phone numbers to keep only the last 10 digits
            if (value && (zohoField === 'Phone' || zohoField === 'Mobile')) {
              const digitsOnly = String(value).replace(/\D/g, '');
              value = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
            }
            
            record[zohoField] = value;
          }
        });
      }
      // Apply fixed values
      if (fixedValues) {
        Object.entries(fixedValues).forEach(([zohoField, value]) => {
          if (value) {
            record[zohoField] = value;
          }
        });
      }
      return record;
    });

    // 3. Send to Zoho CRM (Leads as example)
    const apiDomain = zohoTokens.api_domain || `https://www.zohoapis.${ZOHO_REGION}`;
    let tokenRefreshed = false;
    let currentZohoTokens = zohoTokens;
    let zohoRes;

    const endpoint = updateExisting ? `${apiDomain}/crm/v2/Leads/upsert` : `${apiDomain}/crm/v2/Leads`;
    const payload = updateExisting && duplicateCheckField 
      ? { data: zohoData, duplicate_check_fields: [duplicateCheckField] }
      : { data: zohoData };

    try {
      zohoRes = await axios.post(
        endpoint,
        payload,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${currentZohoTokens.access_token}`,
          },
        }
      );
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.data?.code === 'OAUTH_SCOPE_MISMATCH') {
        const newTokens = await refreshZohoToken(currentZohoTokens);
        if (newTokens.access_token !== currentZohoTokens.access_token) {
          currentZohoTokens = newTokens;
          tokenRefreshed = true;
          zohoRes = await axios.post(
            endpoint,
            payload,
            {
              headers: {
                Authorization: `Zoho-oauthtoken ${currentZohoTokens.access_token}`,
              },
            }
          );
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    res.json({ success: true, zohoResponse: zohoRes.data, zohoTokens: tokenRefreshed ? currentZohoTokens : undefined });
  } catch (error: any) {
    console.error('Sync Error:', error.response?.data || error.message);
    if (error.response?.status === 401 || error.response?.data?.code === 'OAUTH_SCOPE_MISMATCH') {
      return res.status(401).json({ error: 'Zoho permissions changed. Please reconnect Zoho CRM.' });
    }
    res.status(500).json({ error: 'Sync failed', details: error.response?.data });
  }
});

import fs from 'fs';

let lastZohoError: any = null;
let lastZohoTokens: any = null;

app.post('/api/zoho/test', express.json(), async (req, res) => {
  let zohoTokens = req.body.zohoTokens;
  lastZohoTokens = zohoTokens;
  if (!zohoTokens) {
    return res.status(401).json({ error: 'Not connected to Zoho' });
  }

  try {
    const apiDomain = zohoTokens.api_domain || `https://www.zohoapis.${ZOHO_REGION}`;
    let tokenRefreshed = false;
    
    console.log('Testing Zoho Connection with:', {
      apiDomain,
      hasToken: !!zohoTokens.access_token,
      region: ZOHO_REGION
    });

    let zohoRes;
    try {
      try {
        zohoRes = await axios.get(
          `${apiDomain}/crm/v3/Leads`,
          {
            params: {
              fields: 'Last_Name,First_Name,Email,Company,Phone,Lead_Source'
            },
            headers: {
              Authorization: `Zoho-oauthtoken ${zohoTokens.access_token}`,
            }
          }
        );
      } catch (e: any) {
        console.warn('V3 leads fetch failed, trying V2:', e.response?.data || e.message);
        zohoRes = await axios.get(
          `${apiDomain}/crm/v2/Leads`,
          {
            params: {
              fields: 'Last_Name,First_Name,Email,Company,Phone,Lead_Source'
            },
            headers: {
              Authorization: `Zoho-oauthtoken ${zohoTokens.access_token}`,
            }
          }
        );
      }
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.data?.code === 'OAUTH_SCOPE_MISMATCH') {
        const newTokens = await refreshZohoToken(zohoTokens);
        if (newTokens.access_token !== zohoTokens.access_token) {
          zohoTokens = newTokens;
          tokenRefreshed = true;
          try {
            zohoRes = await axios.get(
              `${apiDomain}/crm/v3/Leads`,
              {
                params: {
                  fields: 'Last_Name,First_Name,Email,Company,Phone,Lead_Source'
                },
                headers: {
                  Authorization: `Zoho-oauthtoken ${zohoTokens.access_token}`,
                }
              }
            );
          } catch (retryErr: any) {
            console.warn('V3 retry failed, trying V2:', retryErr.response?.data || retryErr.message);
            zohoRes = await axios.get(
              `${apiDomain}/crm/v2/Leads`,
              {
                params: {
                  fields: 'Last_Name,First_Name,Email,Company,Phone,Lead_Source'
                },
                headers: {
                  Authorization: `Zoho-oauthtoken ${zohoTokens.access_token}`,
                }
              }
            );
          }
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    res.json({ success: true, data: zohoRes.data.data, zohoTokens: tokenRefreshed ? zohoTokens : undefined });
  } catch (error: any) {
    lastZohoError = {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url
    };
    try {
      fs.writeFileSync('/tmp/zoho_error.json', JSON.stringify({ lastZohoError, lastZohoTokens }, null, 2));
    } catch (e) {}
    console.error('Zoho Fetch Error Details:', lastZohoError);
    if (error.response?.status === 401 || error.response?.data?.code === 'OAUTH_SCOPE_MISMATCH') {
      return res.status(401).json({ error: 'Zoho permissions changed. Please reconnect Zoho CRM.' });
    }
    res.status(400).json({ 
      error: 'Failed to fetch leads from Zoho', 
      details: error.response?.data || error.message || 'Unknown error'
    });
  }
});

app.get('/api/debug/logs', (req, res) => {
  res.json({ lastZohoError, lastZohoTokens });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.post('/api/sync-manual', async (req, res) => {
  const { leadData, fixedValues, zohoTokens: bodyZohoTokens } = req.body;
  const zohoTokensStr = (req.headers['x-zoho-tokens'] as string) || (bodyZohoTokens ? JSON.stringify(bodyZohoTokens) : null);

  if (!zohoTokensStr) {
    return res.status(401).json({ error: 'Not connected to Zoho' });
  }

  try {
    const zohoTokens = JSON.parse(zohoTokensStr);

    // Combine leadData and fixedValues
    const record: any = { ...leadData };
    if (fixedValues) {
      Object.entries(fixedValues).forEach(([zohoField, value]) => {
        if (value) {
          record[zohoField] = value;
        }
      });
    }

    // Format phone numbers
    if (record['Phone']) {
      const digitsOnly = String(record['Phone']).replace(/\D/g, '');
      record['Phone'] = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
    }
    if (record['Mobile']) {
      const digitsOnly = String(record['Mobile']).replace(/\D/g, '');
      record['Mobile'] = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
    }

    const apiDomain = zohoTokens.api_domain || `https://www.zohoapis.${ZOHO_REGION}`;
    let tokenRefreshed = false;
    let currentZohoTokens = zohoTokens;
    let zohoRes;

    const endpoint = `${apiDomain}/crm/v2/Leads`;
    const payload = { data: [record] };

    try {
      zohoRes = await axios.post(endpoint, payload, {
        headers: { Authorization: `Zoho-oauthtoken ${currentZohoTokens.access_token}` }
      });
    } catch (err: any) {
      if (err.response?.status === 401) {
        // Token might be expired, try to refresh
        try {
          const refreshRes = await axios.post(`https://accounts.zoho.${ZOHO_REGION}/oauth/v2/token`, null, {
            params: {
              refresh_token: currentZohoTokens.refresh_token,
              client_id: ZOHO_CLIENT_ID,
              client_secret: ZOHO_CLIENT_SECRET,
              grant_type: 'refresh_token'
            }
          });
          currentZohoTokens = { ...currentZohoTokens, ...refreshRes.data };
          tokenRefreshed = true;
          
          // Retry with new token
          zohoRes = await axios.post(endpoint, payload, {
            headers: { Authorization: `Zoho-oauthtoken ${currentZohoTokens.access_token}` }
          });
        } catch (refreshErr) {
          return res.status(401).json({ error: 'Zoho session expired. Please reconnect.' });
        }
      } else {
        throw err;
      }
    }

    const responseData = zohoRes.data;
    const successCount = responseData.data?.filter((d: any) => d.status === 'success').length || 0;
    const errorCount = responseData.data?.filter((d: any) => d.status === 'error').length || 0;

    res.json({ 
      success: true, 
      synced: successCount, 
      errors: errorCount,
      details: responseData.data,
      zohoTokens: tokenRefreshed ? currentZohoTokens : undefined
    });
  } catch (error: any) {
    console.error('Manual sync error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to sync lead to Zoho' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  startServer();
}

export default app;
