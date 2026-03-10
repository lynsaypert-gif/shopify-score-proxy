// api/analyse.js  —  Vercel Serverless Function
// Proxies requests to Anthropic API so your key stays secret

export default async function handler(req, res) {
  // Allow requests from your Framer site (replace with your actual domain)
  const allowedOrigins = [
    'https://cuddly-tournaments-786247.framer.app',   // ← replace with your Framer URL
    'https://yourdomain.com',          // ← replace with your custom domain (if any)
    'http://localhost:3000',           // for local testing
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, hostname } = req.body;

  if (!url || !hostname) {
    return res.status(400).json({ error: 'Missing url or hostname' });
  }

  // Basic validation — must look like a real domain
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(hostname)) {
    return res.status(400).json({ error: 'Invalid hostname' });
  }

  // --- Optional: scrape the store homepage for real analysis ---
  // Uncomment this block to fetch actual HTML and pass it to Claude
  //
  // let storeHtml = '';
  // try {
  //   const scrape = await fetch(url, {
  //     headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConversionBot/1.0)' },
  //     signal: AbortSignal.timeout(8000),
  //   });
  //   const raw = await scrape.text();
  //   // Trim to first 12000 chars to stay within token limits
  //   storeHtml = raw.replace(/<script[\s\S]*?<\/script>/gi, '')
  //                  .replace(/<style[\s\S]*?<\/style>/gi, '')
  //                  .replace(/<[^>]+>/g, ' ')
  //                  .replace(/\s+/g, ' ')
  //                  .trim()
  //                  .slice(0, 12000);
  // } catch (e) {
  //   // If scrape fails, fall back to domain-based analysis
  //   storeHtml = '';
  // }
  //
  // Then add to the prompt:
  // const htmlContext = storeHtml
  //   ? `\n\nHere is the scraped text content from the store homepage:\n${storeHtml}`
  //   : '';

  const prompt = `You are a world-class Shopify conversion rate optimisation (CRO) expert. Analyse the Shopify store at: ${url}

Based on the URL, store name/niche (infer from hostname: "${hostname}"), and your deep knowledge of Shopify CRO best practices, provide a detailed conversion audit.

Return ONLY valid JSON with this exact structure (no markdown, no preamble):

{
  "overallScore": <number 1-100>,
  "scores": {
    "homepage": <number 1-25>,
    "productPage": <number 1-25>,
    "cartUX": <number 1-25>,
    "trustSignals": <number 1-25>
  },
  "grade": "<one sentence honest verdict>",
  "issues": [
    {
      "title": "<short issue name>",
      "description": "<specific actionable description, 1-2 sentences>",
      "severity": "high|medium|low",
      "category": "homepage|product|cart|trust",
      "icon": "<relevant emoji>"
    }
  ],
  "wins": ["<thing done well>", "<thing done well>"],
  "topQuickWin": "<single most impactful change they can make today>"
}

Rules:
- overallScore = sum of the 4 category scores
- Generate 6-8 realistic issues based on common Shopify CRO failures for a store of this type
- Include 2-3 genuine wins (things likely done well)
- Be specific and actionable, not generic
- Calibrate scores honestly — most stores score 45-72
- issues array must have exactly 6-8 items
- wins array must have exactly 2-3 items`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,   // set this in Vercel dashboard
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
