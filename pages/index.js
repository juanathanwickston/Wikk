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
          color:var(-
