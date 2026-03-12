const SHEET_ID = '1MGLw96Vjcjd0I53ZspJKjqBqlhAre1P0LqvAAs5ANQI';
const SHEET_RANGE = 'Sheet1!A:E';

async function getAccessToken() {
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const key = rawKey.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;

  if (!key || !clientEmail) throw new Error('Missing GOOGLE_PRIVATE_KEY or GOOGLE_CLIENT_EMAIL');

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(claim)}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Token error: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, storeUrl, storeName, date } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  try {
    const token = await getAccessToken();

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_RANGE}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [[name, email, storeUrl, storeName, date]]
        })
      }
    );

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('save-lead error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
