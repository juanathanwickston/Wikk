// pages/index.js
import { useState, useRef, useEffect } from 'react';

const SUPPORT_URL =
  "https://onepos.zohodesk.com/portal/en/newticket?departmentId=601183000000006907&layoutId=601183000015067001";

export default function Home(){
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Welcome to onePOS Assist. Ask anything about printers, KDS, menu sync, payments, or networking. I’ll reply with decisive, numbered steps." }
  ]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(()=>{ listRef.current?.lastElementChild?.scrollIntoView({behavior:'smooth'}); },[messages, loading]);

  async function ask(){
    const question = q.trim();
    if(!question) return;
    setQ("");
    setMessages(m=>[...m, { role:'user', content: question }]);
    setLoading(true);
    try{
      const res = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: { path:['root'], steps:[], crumbs:[] }, brand:'onePOS' })
      });
      const text = await res.text();
      setMessages(m=>[...m, { role:'assistant', content: text }]);
    }catch(err){
      setMessages(m=>[...m, { role:'assistant', content: `Error: ${err?.message||'Could not reach /api/assist'}` }]);
    }finally{
      setLoading(false);
    }
  }

  function onKey(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); ask(); } }

  return (
    <main className="shell">
      <div className="chrome">
        <div className="dot" aria-hidden />
        <div className="title">onePOS Assist</div>
        <div className="spacer"/>
        <a className="pill" href={SUPPORT_URL} target="_blank" rel="noreferrer">Open Ticket ↗</a>
      </div>

      <section className="glass">
        <div className="messages" ref={listRef}>
          {messages.map((m, i)=> (
            <div key={i} className={`row ${m.role}`}>
              <div className="meta">{m.role==='user'?'You':'Assistant'}</div>
              <div className="bubble" dangerouslySetInnerHTML={{__html: escapeToHtml(m.content)}} />
            </div>
          ))}
          {loading && <div className="typing">Thinking…</div>}
        </div>
        <div className="composer">
          <textarea
            value={q}
            onChange={e=>setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type your POS question… (Shift+Enter for newline)"
          />
          <button onClick={ask} disabled={loading}>{loading? 'Sending…' : 'Ask AI'}</button>
        </div>
      </section>

      <footer className="hint">
        Tip: Include device model (e.g., SNBC S80), connection (Serial/USB/Ethernet), and any error codes.
      </footer>

      <style jsx global>{`
        :root{
          --bg: #090d18; --fg:#e7ecff; --muted:#a5b0c8; --accent:#20d58a;
          --edge: rgba(255,255,255,.06); --edge-2: rgba(255,255,255,.12);
          --glass: rgba(16, 24, 40, .52);
          --radius: 18px;
        }
        *{box-sizing:border-box}
        html, body, #__next{height:100%}
        body{
          margin:0;
          font:15px/1.45 system-ui,-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          color:var(--fg);
          background:
            radial-gradient(1200px 800px at 10% -10%, #1a2b6b33, transparent),
            radial-gradient(1400px 900px at 110% 10%, #00ffb022, transparent),
            linear-gradient(180deg, #0b1220 0%, #070b15 100%);
        }
        .shell{min-height:100%; display:grid; grid-template-rows:auto 1fr auto; gap:18px; padding:24px;}
        .chrome{
          display:flex; align-items:center; gap:10px; padding:10px 14px;
          border:1px solid var(--edge); border-radius:14px; background:rgba(255,255,255,.04);
          box-shadow:0 10px 30px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06);
          backdrop-filter: blur(10px) saturate(140%);
        }
        .dot{width:10px;height:10px;border-radius:50%; background:var(--accent); box-shadow:0 0 12px var(--accent)}
        .title{font-weight:800; letter-spacing:.2px; text-transform:uppercase; color:var(--muted); font-size:13px}
        .pill{
          font-size:12px; color:var(--fg); border:1px solid var(--edge); padding:6px 10px; border-radius:999px; text-decoration:none;
          background:rgba(255,255,255,.04); box-shadow:inset 0 1px 0 rgba(255,255,255,.06)
        }
        .pill:hover{background:rgba(255,255,255,.07)}
        .spacer{flex:1}

        .glass{
          display:grid; grid-template-rows:1fr auto; height:70vh; border-radius:var(--radius);
          border:1px solid var(--edge-2); background:var(--glass);
          backdrop-filter: blur(18px) saturate(160%);
          box-shadow: 0 18px 60px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08);
          overflow:hidden
        }

        .messages{padding:16px; overflow-y:auto}
        .row{margin:12px 0; display:grid; gap:8px}
        .row .meta{font-size:11px; color:var(--muted)}
        .row.user{justify-items:end}
        .row.user .bubble{
          background: linear-gradient(180deg, #1d3b5e, #10243d);
          border:1px solid rgba(255,255,255,.12);
          box-shadow: 0 6px 18px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06)
        }
        .row.assistant .bubble{
          background: rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.12);
          box-shadow: 0 6px 18px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.06)
        }
        .bubble{max-width:720px; padding:12px 14px; border-radius:14px; white-space:pre-wrap}
        .typing{font-size:13px; color:var(--muted)}

        .composer{
          display:flex; gap:10px; padding:12px; border-top:1px solid var(--edge-2);
          background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02));
        }
        .composer textarea{
          flex:1; min-height:70px; resize:vertical; color:var(--fg);
          background: rgba(255,255,255,.04); border:1px solid var(--edge);
          border-radius:12px; padding:12px; outline:none;
          box-shadow: inset 0 2px 10px rgba(0,0,0,.25)
        }
        .composer textarea:focus{
          border-color:#2ee6a0;
          box-shadow: 0 0 0 3px rgba(46,230,160,.15), inset 0 2px 10px rgba(0,0,0,.28)
        }
        .composer button{
          border:1px solid var(--edge-2); padding:10px 14px; border-radius:12px;
          background: linear-gradient(180deg, #1c2a3c, #121b2a); color:var(--fg); cursor:pointer; font-weight:600;
          box-shadow: 0 8px 20px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08)
        }
        .composer button:hover{filter:brightness(1.08)}
        .composer button:disabled{opacity:.6; cursor:not-allowed}

        .hint{font-size:12px; color:var(--muted); text-align:center}
        @media (max-width: 640px){ .glass{height: 75vh;} }
      `}</style>
    </main>
  );
}

function escapeToHtml(s){
  // basic escape, preserve blank lines
  const esc = s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\\n\\n/g,'<br/><br/>');
  return esc;
}
