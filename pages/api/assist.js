// pages/api/assist.js  — DIAG version that supports GET (for sanity) and POST (for chat)
export default async function handler(req, res) {
  // Helpful GET so the browser doesn't show 405 and confuse us
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('onePOS Assist API is alive. Use POST with JSON: {"question":"..."}');
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      return res.status(500).send('Missing GROQ_API_KEY in Vercel env vars.');
    }

    const { question = 'Ping?', brand = 'onePOS' } = req.body || {};
    const system = `You are a concise ${brand} POS support assistant. Reply in numbered steps.`;

    const payload = {
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: question }
      ]
    };

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).send(`Upstream error from Groq: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || 'No answer';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(answer);
  } catch (e) {
    console.error('assist error:', e);
    return res.status(500).send(`Server error: ${e?.message || e}`);
  }
}
