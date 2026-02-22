export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    const { text } = JSON.parse(event.body);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
      contents: [{ parts: [{ text: `In a heroic gamer voice, say: ${text}` }] }],
      generationConfig: { 
        responseModalities: ["AUDIO"], 
        speechConfig: { 
          voiceConfig: { 
            prebuiltVoiceConfig: { voiceName: "Puck" } 
          } 
        } 
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini TTS error: ${response.status}`);
    }

    const result = await response.json();
    const audioData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioData })
    };

  } catch (error) {
    console.error('TTS error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
