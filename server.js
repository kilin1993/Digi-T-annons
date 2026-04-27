import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = 3000;


// Gör det möjligt att använda __dirname i ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//planer för betalningsidan
const plans = [
  { id: "onetime", name: "Engång", amount: 49, currency: "SEK" },
  { id: "subscription", name: "Månad", amount: 39, currency: "SEK" }
];

// Serverar filer direkt från projektets rotmapp
app.use(express.static(__dirname));
app.use(express.json());

// hantering av CORS och JSON-body parsing
app.use(express.json());

// Gör om UNESCO:s rådata till ett enklare format
function mapUnescoRecord(site) {
  return {
    id: site.id_no || null,
    name: site.name_en || "Unknown",
    shortDescription: site.short_description_en || "",
    description: site.description_en || "",
    country: site.states_names?.join(", ") || "Unknown",
    region: site.region || "Unknown",
    latitude: site.coordinates?.lat || null,
    longitude: site.coordinates?.lon || null
  };
}

// Egen endpoint som frontend och andra komponenter kan använda
app.get("/api/unesco/sites", async (req, res) => {
  try {
    const allSites = [];
    const limit = 100;
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {
      const url = `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?limit=${limit}&offset=${offset}&lang=en`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0"
        }
      });

      if (!response.ok) {
        throw new Error(`UNESCO API error: ${response.status}`);
      }

      const data = await response.json();
      const results = data.results || [];

      const mappedSites = results.map(mapUnescoRecord);
      allSites.push(...mappedSites);

      if (results.length < limit) {
        keepFetching = false;
      } else {
        offset += limit;
      }
    }

    res.json(allSites);
  } catch (error) {
    console.error("Error fetching UNESCO data:", error);
    res.status(500).json({
      error: "Could not fetch UNESCO data"
    });
  }
});

function extractGeminiText(data) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

async function generateGeminiAnswer({ prompt, model }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 220,
        temperature: 0.4
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || "Gemini-anropet misslyckades");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return extractGeminiText(data);
}

app.post("/api/chat", async (req, res) => {
  try {
    const { question, site, description, distanceKm } = req.body;

    if (!question || !site) {
      return res.status(400).json({
        error: "question and site are required"
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY saknas i .env"
      });
    }

    const siteContext = {
      name: site.name,
      country: site.country,
      region: site.region,
      description: description || site.shortDescription || site.description || "",
      distanceKm: distanceKm ?? null
    };

    const preferredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    const models = [...new Set([preferredModel, ...fallbackModels])];
    const prompt =
      "Du är en hjälpsam svensk chatbot för en UNESCO världsarvsannons. " +
      "Svara kort, tydligt och bara utifrån den världsarvsdata du får. " +
      "Om frågan inte går att besvara från datan, säg det och föreslå en fråga om plats, land, region, beskrivning eller avstånd.\n\n" +
      `Världsarvsdata:\n${JSON.stringify(siteContext, null, 2)}\n\n` +
      `Fråga från användaren: ${question}`;

    let lastError = null;

    for (const model of models) {
      try {
        const answer = await generateGeminiAnswer({ prompt, model });
        return res.json({
          answer: answer || "Jag kunde inte skapa ett svar just nu.",
          model
        });
      } catch (error) {
        lastError = error;

        if (error.status !== 429 && error.status !== 503) {
          break;
        }
      }
    }

    const isTemporaryGeminiError =
      lastError?.status === 429 || lastError?.status === 503;

    res.status(lastError?.status || 500).json({
      error: isTemporaryGeminiError
        ? "Gemini är tillfälligt överbelastat. Försök igen om en stund."
        : lastError?.message || "Gemini-anropet misslyckades."
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint för att returnera betalningsplanerna
app.get('/plans', (req, res) => {
  res.json(plans);
});

app.post('payments', (req, res) => {
  try {
    const body = req.body;
    console.log('BODY:', body);

    const { plan, method: paymentMethod, customer = {}, card = {} } = body;
    const { email, phone } = customer;
    const { cardName, cardNumber, expiry, cvc } = card;

    const selectedPlan = plans.find((p) => p.id === plan);

    if (!selectedPlan) {
      return res.status(400).json({
        status: 'failed',
        message: 'Ogiltig plan'
      });
    }

    if (!paymentMethod || !['klarna', 'card'].includes(paymentMethod)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Ogiltig betalmetod'
      });
    }

    if (paymentMethod === 'klarna') {
      if (!email || !phone) {
        return res.status(400).json({
          status: 'failed',
          message: 'E-post och telefonnummer krävs för Klarna-betalning'
        });
      }
    }

    if (paymentMethod === 'card') {
      if (!cardNumber || !expiry || !cvc || !cardName) {
        return res.status(400).json({
          status: 'failed',
          message: 'Alla kortuppgifter krävs för kortbetalning'
        });
      }
    }

    const success = Math.random() < 0.4;
    const now = Date.now();

    if (!success) {
      return res.json({
        status: 'failed',
        message: 'Betalningen misslyckades. Försök igen.',
        plan: selectedPlan,
        paymentMethod,
        customer: paymentMethod === 'klarna' ? { email, phone } : undefined,
        card: paymentMethod === 'card' ? { last4: cardNumber.slice(-4), expiry} : undefined
      });
    }

    return res.json({
      status: 'success',
      message: 'Betalningen lyckades',
      plan: selectedPlan,
      paymentId: `pay_${now}`,
      subscriptionId: `sub_${now}`,
      plan: selectedPlan,
      paymentMethod,
      customer: paymentMethod === 'klarna' ? { email, phone } : undefined,
      card: paymentMethod === 'card' ? { last4: cardNumber.slice(-4), expiry} : undefined
    });
  } catch (error) {
    console.error('Fel i /payments:', error);

    return res.status(400).json({
      status: 'failed',
      message: error.message || 'Ogiltig request body'
    });
  }
});


app.post("/api/translate", async (req, res) => {
  try {
    const { text, to } = req.body;

    if (!text || !to) {
      return res.status(400).json({ error: "text and to are required" });
    }

    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
    const key = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION;

    console.log("ENDPOINT:", endpoint);
    console.log("KEY exists:", !!key);
    console.log("REGION:", region);

    const url = `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ Text: text }])
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: rawText });
    }

    const data = JSON.parse(rawText);
    const translated = data?.[0]?.translations?.[0]?.text ?? text;

    res.json({ translated });
  } catch (error) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
