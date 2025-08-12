export default function Home(){
  return (
    <main style={{fontFamily:'system-ui, -apple-system, Segoe UI, Roboto',padding:20}}>
      <h1>onePOS Troubleshooter</h1>
      <p>This is a minimal Next.js page so Vercel can build your app. Your backend lives at <code>/api/assist</code>.</p>
      <div id="onepos-troubleshooter"
           data-endpoint="/api/assist"
           data-support-url="https://onepos.zohodesk.com/portal/en/newticket?departmentId=601183000000006907&layoutId=601183000015067001">
        {/* Paste your widget HTML/JS here OR mount via a React component. */}
      </div>
    </main>
  );
}
