```javascript
// File: api/assist.js
// Purpose: onePOS AI Troubleshooter backend — Groq (free tier) + Zoho KB RAG
// Deploy: Place this file in your project at api/assist.js and deploy to Vercel/Next.js
// Env Vars: GROQ_API_KEY=<your Groq key>

const KB_ROOT = 'https://onepos.zohodesk.com/portal/en/kb/onepos/end-user';
const ALLOWLIST = ['onepos.zohodesk.com'];
const MAX_PAGES = 25;
const MAX_SNIPPETS = 6;
const MODEL = 'llama-3.1-8b-instant';
let KB_INDEX = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { question, context = {}, brand = 'onePOS' } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).send('Missing question');
    }

    if (!KB_INDEX || Date.now() - (KB_INDEX.ts || 0) > 12 * 60 * 60 * 1000) {
      KB_INDEX = await buildKbIndex();
    }

    const kbSnippets = scoreAndSelectSnippets(question, KB_INDEX.docs, MAX_SNIPPETS);
    const systemPrompt = buildSystemPrompt(brand);
    const ragBlock = renderRagBlock(context, kbSnippets);

    const key = process.env.GROQ_API_KEY;
    if (!key) {
      const local = [
        `Local fallback (no external model).`,
        `Question: ${question}`,
        ragBlock,
        `\nNext steps:`,
        ...kbSnippets.flatMap((s, i) => [`${i + 1}. ${s.excerpt.trim()}`, `   ↳ ${s.url}`])
      ].join('\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(local);
    }

    const payload = {
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Question: ${question}\n\n${ragBlock}` }
      ]
    };

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).send(`Upstream error: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || 'No answer';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(answer);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

function buildSystemPrompt(brand) {
  return `You are an on-call ${brand} POS support assistant.\nBe concise, decisive, and safe. Use numbered steps.\nPrefer exact, verified settings from the KB.\nIf matching a known flow, cite it in **bold**.\nAsk for missing info only if it blocks next action.\nIf hardware might be faulty, suggest swapping with a known-good device and collecting serial/firmware.\nIf escalation is required, list screenshots/logs and include the support URL.`;
}

function renderRagBlock(context, snippets) {
  const { nodeId, path = [], steps = [], crumbs = [] } = context || {};
  const lines = [];
  if (crumbs.length) lines.push(`Breadcrumbs: ${crumbs.join(' > ')}`);
  if (path.length) lines.push(`Flow Path: ${path.join(' > ')}`);
  if (steps.length) lines.push(`Current Steps:\n- ${steps.join('\n- ')}`);
  if (snippets.length) {
    lines.push(`KB Snippets:`);
    for (const s of snippets) {
      lines.push(`• [${s.title}] ${s.excerpt}\n  URL: ${s.url}`);
    }
  }
  lines.push(`Support URL: https://onepos.zohodesk.com/portal/en/newticket?departmentId=601183000000006907&layoutId=601183000015067001`);
  return lines.join('\n\n');
}

async function buildKbIndex() {
  const docs = [];
  try {
    const seen = new Set();
    const queue = [KB_ROOT];

    while (queue.length && docs.length < MAX_PAGES) {
      const url = queue.shift();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      if (!isAllowed(url)) continue;

      const html = await fetchText(url);
      if (!html) continue;

      const { title, text, links } = extract(html, url);
      if (text.trim().length > 200) docs.push({ url, title, text });

      for (const href of links) {
        if (isAllowed(href) && !seen.has(href) && href.startsWith(KB_ROOT)) {
          queue.push(href);
        }
      }
    }
  } catch (e) {
    console.error('KB index error:', e);
  }
  return { docs, ts: Date.now() };
}

function isAllowed(url) {
  try { const u = new URL(url); return ALLOWLIST.includes(u.hostname); } catch { return false; }
}

async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'onePOS-AI/1.0' } });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

function extract(html, url) {
  const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || '').trim();
  const text = stripHtml(html).replace(/\s+/g, ' ').slice(0, 20000);
  const links = Array.from(html.matchAll(/href=\"([^\"]+)\"/gi))
    .map(m => m[1])
    .map(h => toAbs(url, h))
    .filter(Boolean);
  return { title, text, links };
}

function stripHtml(s) { return s.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' '); }
function toAbs(base, href) { try { return new URL(href, base).toString(); } catch { return null; } }

function scoreDoc(q, doc) {
  const t = doc.text.toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of terms) {
    const matches = t.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'));
    if (matches) s += Math.sqrt(matches.length + 0.5);
  }
  if (terms.length > 1 && t.includes(terms.join(' '))) s += 1.2;
  return s;
}

function scoreAndSelectSnippets(q, docs, k) {
  const ranked = (docs || []).map(d => ({ d, s: scoreDoc(q, d) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k);
  return ranked.map(({ d }) => ({
    url: d.url,
    title: d.title || 'KB Article',
    excerpt: d.text.slice(0, 500) + (d.text.length > 500 ? '…' : '')
  }));
}
```
