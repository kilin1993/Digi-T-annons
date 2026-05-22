import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sendNotification } from "./notificationService.js";
import dotenv from "dotenv";
dotenv.config();
import { adConfig } from "./ad-config.js";
import fs from "fs/promises";
import { uiTexts } from "./i18n.js";

const app = express();
const port = process.env.PORT || 3000;


// Gör det möjligt att använda __dirname i ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//planer för betalningsidan
/* const plans = [
  { id: "onetime", name: "Månatlig", amount: 49, currency: "SEK" },
  { id: "subscription", name: "Årlig", amount: 549, currency: "SEK" }
]; */
//Pris sätts i konfigurationsfil av kund
const plans = Object.values(adConfig.pricing);

// Klarna Playground-konfiguration
const KLARNA_BASE_URL = process.env.KLARNA_BASE_URL || 'https://api.playground.klarna.com';
const KLARNA_USERNAME = process.env.KLARNA_USERNAME || '';
const KLARNA_PASSWORD = process.env.KLARNA_PASSWORD || '';

// Serverar filer direkt från projektets rotmapp
app.use(express.static(__dirname));

// hantering av CORS och JSON-body parsing
app.use(express.json());

async function klarnaApiRequest(endpoint, method = 'POST', body = null) {
  const url = `${KLARNA_BASE_URL}${endpoint}`;
  const auth = Buffer.from(`${KLARNA_USERNAME}:${KLARNA_PASSWORD}`).toString('base64');
  const options = {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(`Klarna API error ${response.status}`);
    err.data = data;
    throw err;
  }

  return data;
}

function getKlarnaMerchantUrl(req, path) {
  const baseUrl = process.env.KLARNA_MERCHANT_URL_BASE || `https://${req.get('host')}`;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

// Gör om UNESCO:s rådata till ett enklare format
function mapUnescoRecord(site) {
  const id = site.id_no || null;

  return {
    id,
    name: site.name_en || "Unknown",
    shortDescription: site.short_description_en || "",
    description: site.description_en || "",
    country: site.states_names?.join(", ") || "Unknown",
    region: site.region || "Unknown",
    latitude: site.coordinates?.lat || null,
    longitude: site.coordinates?.lon || null,
    url: id ? `https://whc.unesco.org/en/list/${id}` : ""
  };
}

let cachedSites = null;
let cacheTimestamp = 0;

//Data från Unesco API hämtas varje 24h, cachas på servern där emellan
//för att öka prestanda och onödiga anrop
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 timmar

// Egen endpoint som frontend och andra komponenter kan använda
app.get("/api/unesco/sites", async (req, res) => {
  try {

    // Om cache finns och är giltig → använd den
    if (
      cachedSites &&
      Date.now() - cacheTimestamp < CACHE_DURATION
    ) {
      console.log("Serving UNESCO sites from cache");
      return res.json(cachedSites);
    }

    console.log("Fetching UNESCO sites from UNESCO API");

    const allSites = [];
    const limit = 100;
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {

      const url =
        `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?limit=${limit}&offset=${offset}&lang=en`;

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

    // Spara cache
    cachedSites = allSites;
    cacheTimestamp = Date.now();

    console.log(`Cached ${allSites.length} UNESCO sites`);

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
    const { question, site, description, distanceKm, language } = req.body;

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
    const answerLanguage = language === "en" ? "English" : "Swedish";
    const prompt =
      `You are a helpful chatbot for a UNESCO World Heritage ad. Answer in ${answerLanguage}. ` +
      "Keep the answer short and clear. Only use the World Heritage data you receive. " +
      "If the user asks how to subscribe, answer that they should press the Subscribe button, fill in email and mobile number, then enter card details or use Klarna. Inform the user that there is no commitment period and that they can cancel at any time." +
      "If the question cannot be answered from the data, say that and suggest asking about location, country, region, description, or distance.\n\n" +
      `World Heritage data:\n${JSON.stringify(siteContext, null, 2)}\n\n` +
      `User question: ${question}`;

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
      code: isTemporaryGeminiError ? "temporary_ai_error" : "ai_error",
      error: isTemporaryGeminiError
        ? "Gemini är tillfälligt överbelastat. Försök igen om en stund."
        : lastError?.message || "Gemini-anropet misslyckades."
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ code: "server_error", error: error.message });
  }
});

// Returnerar betalningsplanerna
app.get('/plans', (req, res) => {
  res.json(plans);
});

// Skapa klarna session och returnera session id och client token
app.post('/klarna/sessions', async (req, res) => {
  try {
    const { planId, customer } = req.body;
    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      return res.status(400).json({ status: 'failed', message: 'Ogiltig plan' });
    }

    const sessionData = {
      acquiring_channel: 'ECOMMERCE',
      intent: 'buy',
      purchase_country: 'SE',
      purchase_currency: 'SEK',
      locale: 'sv-SE',
      order_amount: selectedPlan.amount * 100,
      order_tax_amount: Math.round(selectedPlan.amount * 100 * 0.25),
      order_lines: [
        {
          type: 'physical',
          reference: selectedPlan.id,
          name: selectedPlan.name,
          quantity: 1,
          unit_price: selectedPlan.amount * 100,
          tax_rate: 2500,
          total_amount: selectedPlan.amount * 100,
          total_tax_amount: Math.round(selectedPlan.amount * 100 * 0.25)
        }
      ],
      merchant_urls: {
        confirmation: getKlarnaMerchantUrl(req, '/confirmation'),
        notification: getKlarnaMerchantUrl(req, '/notification')
      }
    };

    const klarnaSession = await klarnaApiRequest('/payments/v1/sessions', 'POST', sessionData);

    res.json({
      status: 'success',
      session_id: klarnaSession.session_id,
      client_token: klarnaSession.client_token,
      payment_method_categories: klarnaSession.payment_method_categories
    });
  } catch (error) {
    console.error('Klarna session creation error:', error);
    res.status(500).json({ status: 'failed', message: 'Kunde inte skapa Klarna-session' });
  }
});

// Skapa Klarna order baserat på session och returnera order id och url
app.post('/klarna/orders', async (req, res) => {
  try {
    const { authorization_token, planId } = req.body;
    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      return res.status(400).json({ status: 'failed', message: 'Ogiltig plan' });
    }

    const orderData = {
      purchase_country: 'SE',
      purchase_currency: 'SEK',
      locale: 'sv-SE',
      order_amount: selectedPlan.amount * 100,
      order_tax_amount: Math.round(selectedPlan.amount * 100 * 0.25),
      order_lines: [
        {
          type: 'physical',
          reference: selectedPlan.id,
          name: selectedPlan.name,
          quantity: 1,
          unit_price: selectedPlan.amount * 100,
          tax_rate: 2500,
          total_amount: selectedPlan.amount * 100,
          total_tax_amount: Math.round(selectedPlan.amount * 100 * 0.25)
        }
      ],
      merchant_reference1: `order_${Date.now()}`
    };

    const klarnaOrder = await klarnaApiRequest(
      `/payments/v1/authorizations/${authorization_token}/order`,
      'POST',
      orderData
    );

    res.json({
      status: 'success',
      order_id: klarnaOrder.order_id,
      redirect_url: klarnaOrder.redirect_url
    });
  } catch (error) {
    console.error('Klarna order creation error:', error);
    res.status(500).json({ status: 'failed', message: 'Kunde inte skapa Klarna-order' });
  }
});

// Endpoint för att hantera betalningar
app.post('/payments', async (req, res) => {
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

    const success = paymentMethod === 'card' ? true : Math.random() < 0.4;
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

/* const subscriptions = [];
const sentHeritageNotifications = new Set();

function createSubscriptionId() {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
} */

// För att spara prenumerationer till en json fil
const SUBSCRIPTIONS_FILE = path.join(__dirname, "subscriptions.json");
const sentHeritageNotifications = new Set();

async function readSubscriptions() {
  try {
    const data = await fs.readFile(SUBSCRIPTIONS_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveSubscriptions(subscriptions) {
  await fs.writeFile(
    SUBSCRIPTIONS_FILE,
    JSON.stringify(subscriptions, null, 2)
  );
}


app.post("/api/subscriptions", async (req, res) => {
  try {
    const { email, phone, notificationType, language } = req.body;
    const messageLanguage = language === "en" ? "en" : "sv";
    const texts = uiTexts[messageLanguage];

    if (!email || !phone || !notificationType) {
      return res.status(400).json({
        success: false,
        error: "missing_fields"
      });
    }

    const subscriptions = await readSubscriptions();

    const nextId =
      subscriptions.length > 0
        ? Math.max(...subscriptions.map((sub) => Number(sub.subscriptionId) || 0)) + 1
        : 1;

    const subscription = {
      subscriptionId: nextId,
      email,
      phone,
      notificationType,
      active: true,
      sentSiteIds: [],
      created_at: new Date().toISOString()
    };

    subscriptions.push(subscription);
    await saveSubscriptions(subscriptions);

    await sendNotification({
      channel: "email",
      to: email,
      subject: texts.subscriptionConfirmationSubject,
      message:
    `${texts.subscriptionConfirmationMessage}
    ${texts.unsubscribeText}
    http://localhost:${port}/api/subscriptions/cancel?subscriptionId=${subscription.subscriptionId}
    `,
      user_id: subscription.subscriptionId,
      site_id: "subscription-confirmation"
    });

    return res.json({
      success: true,
      subscription
    });
  } catch (error) {
    console.error("Subscription error:", error);
    return res.status(500).json({
      success: false,
      error: "server_error"
    });
  }
});
app.get("/api/subscriptions/cancel", async (req, res) => {
  try {
    const { subscriptionId } = req.query;

    const subscriptions = await readSubscriptions();

    const subscription = subscriptions.find(
      (sub) => String(sub.subscriptionId) === String(subscriptionId)
    );

    if (!subscription) {
      return res.status(404).send("Prenumerationen hittades inte.");
    }

    subscription.active = false;
    await saveSubscriptions(subscriptions);

    return res.send("Prenumerationen är avslutad.");
  } catch (error) {
    console.error("Cancel subscription error:", error);

    return res.status(500).send("Något gick fel vid avregistrering.");
  }
});

app.post("/api/subscriptions/notify-nearby", async (req, res) => {
  try {
    const { subscriptionId, site } = req.query;

    const subscriptions = await readSubscriptions();

    const subscription = subscriptions.find(
      (sub) =>
        String(sub.subscriptionId) === String(subscriptionId) &&
        sub.active
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "subscription_not_found"
      });
    }

    if (!site || !site.id || !site.name) {
      return res.status(400).json({
        success: false,
        error: "invalid_site"
      });
    }

    if (!Array.isArray(subscription.sentSiteIds)) {
      subscription.sentSiteIds = [];
    }

    if (subscription.sentSiteIds.includes(site.id)) {
      return res.json({
        success: true,
        skipped: true,
        reason: "already_sent"
      });
    }

    if (subscription.notificationType === "sms" || subscription.notificationType === "both") {
      await sendNotification({
        channel: "sms",
        to: subscription.phone,
        subject: `${texts.nearbyNotificationSubject} ${site.name}`,

        message:
        `${texts.nearbyNotificationMessage} ${site.name}.

        ${texts.readMoreHere} ${site.url || ""}

        ${texts.unsubscribeContact} digitkonsult@gmail.com`,
      });
    }

    if (subscription.notificationType === "email" || subscription.notificationType === "both") {
      await sendNotification({
        channel: "email",
        to: subscription.email,
        subject: `${texts.nearbyNotificationSubject} ${site.name}`,

        message:
        `${texts.nearbyNotificationMessage} ${site.name}.

        ${texts.readMoreHere} ${site.url || ""}

        ${texts.unsubscribeContact} digitkonsult@gmail.com`,
      });
    }

    subscription.sentSiteIds.push(site.id);
    await saveSubscriptions(subscriptions);

    return res.json({
      success: true
    });
  } catch (error) {
    console.error("Nearby notification error:", error);
    return res.status(500).json({
      success: false,
      error: "server_error"
    });
  }
});

app.post("/api/notification/send", async (req, res) => {
  const result = await sendNotification(req.body);
  return res.status(result.status).json(result.body);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
