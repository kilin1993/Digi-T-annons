export async function translateText(text, language) {
  if (!text || !language) {
    throw new Error("Text och språk krävs för översättning.");
  }

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      to: language
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Kunde inte översätta texten.");
  }

  return data.translated || text;
}