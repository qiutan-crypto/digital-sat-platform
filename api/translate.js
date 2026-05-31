export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  // Define the strict prompt
  const systemPrompt = "Translate the following text into Chinese. Keep all LaTeX formulas (such as \\( ... \\) or $$ ... $$) and Markdown formatting completely intact. Return ONLY the translation, without any additional conversational text, comments, or explanations.";
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [{
          parts: [{ text }]
        }],
        generationConfig: {
          temperature: 0.1 // Low temperature for factual translation
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      return res.status(response.status).json({ error: 'Error calling Gemini API', details: data });
    }

    const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!translatedText) {
      return res.status(500).json({ error: 'No translation returned from Gemini' });
    }

    return res.status(200).json({ translation: translatedText.trim() });
    
  } catch (error) {
    console.error('Translate API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
