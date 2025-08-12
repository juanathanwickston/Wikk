// File: api/assist.js (DIAG MODE — simple test)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      return res.status(500).send('Missing GROQ_API_KEY in Vercel env vars (Settings → Environment Variables).');
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
    console.error('assist DIAG error:', e);
    return res.status(500).send(`Server error: ${e?.message || e}`);
  }
}
