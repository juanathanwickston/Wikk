// pages/api/assist.js — WIKK + onePOS KB (hardened RAG, fixed stripHtml)
const KB_ROOT = 'https://onepos.zohodesk.com/portal/en/kb/onepos/end-user';
const ALLOWLIST = ['onepos.zohodesk.com'];
const MAX_PAGES = 20;        // small for fast cold starts; raise later
const MAX_SNIPPETS = 6;      // how many snippets to feed the model
const MODEL = 'llama-3.1-8b-instant';

let KB_INDEX = null;         // in-memory cache per lambda instance

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('WIKK API (KB-enabled). Use POST {"question": "..."}');
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.status(500).send('Missing GROQ_API_KEY in Vercel env vars.');

    const { question, context = {}, brand = 'onePOS' } = req.body || {};
    if (!question) return res.status(400).send('Missing "question".');

    // Build/refresh KB index every 12h
    if (!KB_INDEX || Date.now() - (KB_INDEX.ts || 0) > 12 * 60 * 60 * 1000) {
      KB_INDEX = await buildKbIndexSafe();
    }

    const snippets = scoreAndSelectSnippets(question, KB_INDEX?.docs || [], MAX_SNIPPETS);
    const prompt = systemPrompt(brand);
    const ragBlock = renderRag(context, snippets);

    const payload = {
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Question: ${question}\n\n${ragBlock}` }
      ]
    };

    const ai = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(payload)
    }, 20_000);

    if (!ai.ok) {
      const text = await ai.text();
      return res.status(502).send(`Upstream error from Groq: ${ai.status} ${text}`);
    }

    const data = await ai.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || 'No answer';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(answer);
  } catch (e) {
    console.error('assist RAG error:', e);
    return res.status(500).send(`Server error: ${e?.message || e}`);
  }
}

/* ---------- RAG helpers ---------- */
function systemPrompt(brand) {
  return [
    `You are a ${brand} POS support assistant.`,
    `Answer in concise, numbered steps. Be decisive & safe.`,
    `Prefer facts from the "KB Snippets" below. If you cite, do **bold** article names and include the URL at the end.`,
    `If escalation is needed, include the support URL.`,
  ].join('\n');
}

function renderRag(context, snippets) {
  const lines = [];
  const { path = [], steps = [], crumbs = [] } = context || {};
  if (crumbs.length) lines.push(`Breadcrumbs: ${crumbs.join(' > ')}`);
  if (path.length) lines.push(`Flow Path: ${path.join(' > ')}`);
  if (steps.length) lines.push(`Current Steps:\n- ${steps.join('\n- ')}`);

  if (snippets.length) {
    lines.push('KB Snippets:');
    for (const s of snippets) {
      lines.push(`• [${s.title}] ${s.excerpt}\n  URL: ${s.url}`);
    }
  }
  lines.push(`Support URL: https://onepos.zohodesk.com/portal/en/newticket?departmentId=601183000000006907&layoutId=601183000015067001`);
  return lines.join('\n\n');
}

async function buildKbIndexSafe() {
  try { return await buildKbIndex(); }
  catch (e) {
    console.error('KB index build failed:', e);
    return { docs: [], ts: Date.now() };
  }
}

async function buildKbIndex() {
  const docs = [];
  const seen = new Set();
  const q = [KB_ROOT];

  while (q.length && docs.length < MAX_PAGES) {
    const url = q.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!isAllowed(url)) continue;

    const html = await fetchText(url, 10_000);
    if (!html) continue;

    const { title, text, links } = extract(html, url);
    if (text.trim().length > 200) docs.push({ url, title, text });

    for (const href of links) {
      if (href.startsWith(KB_ROOT) && isAllowed(href) && !seen.has(href)) q.push(href);
    }
  }
  return { docs, ts: Date.now() };
}

function isAllowed(u) { try { return ALLOWLIST.includes(new URL(u).hostname); } catch { return false; } }

async function fetchText(url, timeoutMs = 8000) {
  try {
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'WIKK/1.0 (+vercel)' } }, timeoutMs);
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

function extract(html, baseUrl) {
  const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || '').trim();
  const text = stripHtml(html).replace(/\s+/g, ' ').slice(0, 20000);
  const links = [...html.matchAll(/href="([^"]+)"/gi)]
    .map(m => toAbs(baseUrl, m[1])).filter(Boolean);
  return { title, text, links };
}

// ✅ FIXED VERSION
function stripHtml(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

function toAbs(base, href){ try { return new URL(href, base).toString(); } catch { return null; } }

function scoreDoc(q, doc) {
  const t = doc.text.toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of terms) {
    const m = t.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'));
    if (m) s += Math.sqrt(m.length + 0.5);
  }
  if (terms.length > 1 && t.includes(terms.join(' '))) s += 1.2;
  return s;
}

function scoreAndSelectSnippets(q, docs, k) {
  return (docs || [])
    .map(d => ({ d, s: scoreDoc(q, d) }))
    .filter(x => x.s > 0)
    .sort((a,b) => b.s - a.s)
    .slice(0, k)
    .map(({ d }) => ({
      url: d.url,
      title: d.title || 'KB Article',
      excerpt: d.text.slice(0, 400) + (d.text.length > 400 ? '…' : '')
    }));
}

/* ---------- tiny fetch with timeout ---------- */
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}
