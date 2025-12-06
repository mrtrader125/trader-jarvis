export async function textToSpeechBuffer(text) {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) {
    console.error("Missing DEEPGRAM_API_KEY for TTS");
    return null;
  }

  try {
    const res = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${dgKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!res.ok) {
      console.error("Deepgram TTS error:", res.status, await res.text());
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return arrayBuffer;
  } catch (err) {
    console.error("Deepgram TTS request failed:", err);
    return null;
  }
}
