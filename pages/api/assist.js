// pages/api/assist.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { question, context, brand } = req.body;

    // Example — call your AI model here
    // This is just a mock for testing; replace with actual Groq call
    const answer = `You asked: "${question}" — Context: ${JSON.stringify(context)}, Brand: ${brand}`;

    return res.status(200).json({ reply: answer });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
