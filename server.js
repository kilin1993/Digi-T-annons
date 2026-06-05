import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sendNotification } from "./notificationService.js";
import dotenv from "dotenv";
dotenv.config();
import fs from "fs/promises";
import { uiTexts } from "./i18n.js";

const app = express();
const port = process.env.PORT || 3000;


// Gör det möjligt att använda __dirname i ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hämtar plans från pricing.json
async function getPlans() {
  const data = await fs.readFile(
    path.join(__dirname, "config", "pricing.json"),
    "utf8"
  );

  const config = JSON.parse(data);
  return Object.values(config.pricing);
}

function getPlanName(plan, language = "sv") {
  return plan.name || uiTexts[language]?.[plan.nameKey] || uiTexts.sv?.[plan.nameKey] || plan.id;
}

function getPlanAmountMinor(plan) {
  return Math.round(Number(plan.amount) * 100);
}

function getIncludedTaxAmountMinor(amountMinor, taxRate = 2500) {
  return Math.round(amountMinor - (amountMinor * 10000) / (10000 + taxRate));
}

// Klarna Playground-konfiguration
const KLARNA_BASE_URL = process.env.KLARNA_BASE_URL || 'https://api.playground.klarna.com';
const KLARNA_USERNAME = process.env.KLARNA_USERNAME || '';
const KLARNA_PASSWORD = process.env.KLARNA_PASSWORD || '';

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use("/config", (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Config"');
    return res.status(401).send("Authentication required");
  }

  const base64 = auth.split(" ")[1];

  const [username, password] = Buffer.from(base64, "base64")
    .toString()
    .split(":");

  if (
    username === process.env.CONFIG_USERNAME &&
    password === process.env.CONFIG_PASSWORD
  ) {
    return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Config"');
  return res.status(401).send("Wrong credentials");
});

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

function getPublicBaseUrl(req) {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.KLARNA_MERCHANT_URL_BASE;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
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
        maxOutputTokens: 500,
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
      "If the user asks how to unsubscribe, answer that they should click the unsubscribe link in the subscription email or sms." +
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
app.get('/plans', async (req, res) => {
  const plans = await getPlans();
  res.json(plans);
});

// Skapa klarna session och returnera session id och client token
app.post('/klarna/sessions', async (req, res) => {
  try {
    const { planId, customer } = req.body;
    const plans = await getPlans();
    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      return res.status(400).json({ status: 'failed', message: 'Ogiltig plan' });
    }

    const orderAmount = getPlanAmountMinor(selectedPlan);
    const orderTaxAmount = getIncludedTaxAmountMinor(orderAmount);

    const sessionData = {
      acquiring_channel: 'ECOMMERCE',
      intent: 'buy',
      purchase_country: 'SE',
      purchase_currency: 'SEK',
      locale: 'sv-SE',
      order_amount: orderAmount,
      order_tax_amount: orderTaxAmount,
      order_lines: [
        {
          type: 'physical',
          reference: selectedPlan.id,
          name: getPlanName(selectedPlan),
          quantity: 1,
          unit_price: orderAmount,
          tax_rate: 2500,
          total_amount: orderAmount,
          total_tax_amount: orderTaxAmount
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
    const plans = await getPlans();
    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      return res.status(400).json({ status: 'failed', message: 'Ogiltig plan' });
    }

    const orderAmount = getPlanAmountMinor(selectedPlan);
    const orderTaxAmount = getIncludedTaxAmountMinor(orderAmount);

    const orderData = {
      purchase_country: 'SE',
      purchase_currency: 'SEK',
      locale: 'sv-SE',
      order_amount: orderAmount,
      order_tax_amount: orderTaxAmount,
      order_lines: [
        {
          type: 'physical',
          reference: selectedPlan.id,
          name: getPlanName(selectedPlan),
          quantity: 1,
          unit_price: orderAmount,
          tax_rate: 2500,
          total_amount: orderAmount,
          total_tax_amount: orderTaxAmount
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

    const plans = await getPlans();
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
    const subscriptions = JSON.parse(data);
    return Array.isArray(subscriptions) ? subscriptions : [];
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
    const { email, phone, notificationType, language, planId } = req.body;
    const messageLanguage = language === "en" ? "en" : "sv";
    const texts = uiTexts[messageLanguage];

    if (!email || !phone || !notificationType) {
      return res.status(400).json({
        success: false,
        error: "missing_fields"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const subscriptions = await readSubscriptions();

    const existingSubscription = subscriptions.find((sub) =>
      sub.active !== false &&
      sub.email &&
      sub.email.trim().toLowerCase() === normalizedEmail
    );

    if (existingSubscription) {
      return res.status(409).json({
        success: false,
        error: "email_already_registered"
      });
    }

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
      lastNotifiedSiteId: null,
      created_at: new Date().toISOString()
    };

    subscriptions.push(subscription);
    await saveSubscriptions(subscriptions);

    const accountUrl =
      `${getPublicBaseUrl(req)}/mina-sidor/account.html?subscriptionId=${subscription.subscriptionId}`;

    await sendNotification({
      channel: "email",
      to: email,
      subject: texts.subscriptionConfirmationSubject,
      message:
    `${texts.subscriptionConfirmationMessage}

    Min sida:
    ${accountUrl}
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

app.get("/api/account/:subscriptionId", async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const subscriptions = await readSubscriptions();

    const subscription = subscriptions.find(
      (sub) => String(sub.subscriptionId) === String(subscriptionId)
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "subscription_not_found"
      });
    }

    return res.json({
      success: true,
      subscription
    });
  } catch (error) {
    console.error("Account subscription error:", error);

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
    const { subscriptionId, site, language } = req.body;
    const messageLanguage = language === "en" ? "en" : "sv";
    const texts = uiTexts[messageLanguage];

    const subscriptions = await readSubscriptions();

    const subscription = subscriptions.find(
      (sub) =>
        String(sub.subscriptionId) === String(subscriptionId) &&
        sub.active !== false
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "subscription_not_found"
      });
    }


    const accountUrl =
  `${getPublicBaseUrl(req)}/mina-sidor/account.html?subscriptionId=${subscription.subscriptionId}`;
  
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

    if (
  subscription.notificationType === "sms" ||
  subscription.notificationType === "both"
) {
  await sendNotification({
    channel: "sms",
    to: subscription.phone,
    subject: `${texts.nearbyNotificationSubject} ${site.name}`,
    message:
`${texts.nearbyNotificationMessage} ${site.name}.

Min sida:
${accountUrl}`,
    user_id: subscription.subscriptionId,
    site_id: site.id
  });
}

if (
  subscription.notificationType === "email" ||
  subscription.notificationType === "both"
) {
  await sendNotification({
    channel: "email",
    to: subscription.email,
    subject: `${texts.nearbyNotificationSubject} ${site.name}`,
    message:
`${texts.nearbyNotificationMessage} ${site.name}.

Min sida:
${accountUrl}`,
    user_id: subscription.subscriptionId,
    site_id: site.id
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

app.post("/config/pricing", async (req, res) => {
  console.log("CONFIG BODY:", req.body);

  const { monthly, yearly } = req.body;

  const filePath = path.join(__dirname, "config", "pricing.json");

  console.log("Writing to:", filePath);

  const config = {
    pricing: {
      monthly: {
        id: "monthly",
        nameKey: "monthly",
        amount: Number(monthly),
        currency: "SEK"
      },
      yearly: {
        id: "yearly",
        nameKey: "yearly",
        amount: Number(yearly),
        currency: "SEK"
      }
    }
  };

  await fs.writeFile(filePath, JSON.stringify(config, null, 2));

  res.json({ success: true });
});

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function findNearbySites(userLat, userLon, sites, radiusKm = 25) {
  return sites
    .map(site => ({
      ...site,
      distanceKm: getDistanceKm(
        userLat,
        userLon,
        site.latitude,
        site.longitude
      )
    }))
    .filter(site => site.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

app.post("/api/location", async (req, res) => {
  try {
    const token = req.query.token;

    if (token !== process.env.OWNTRACKS_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = req.body;

    console.log("OwnTracks payload:", payload);

    if (!payload || payload._type !== "location") {
      return res.status(200).json({
        message: `Ignored ${payload?._type || "unknown"} message`
      });
    }

    const lat = Number(payload.lat);
    const lon = Number(payload.lon);
    const trackerId = payload.tid || "unknown";
    const email = payload.topic?.toLowerCase();

    if (!lat || !lon) {
      return res.status(400).json({
        error: "Missing latitude or longitude"
      });
    }

    if (!email) {
      return res.status(400).json({
        error: "Missing email in OwnTracks topic"
      });
    }

    const subscriptions = await readSubscriptions();

    const subscription = subscriptions.find(sub =>
      sub.active !== false &&
      sub.email &&
      sub.email.toLowerCase() === email
    );

    if (!subscription) {
      console.log(`No subscription found for ${email}`);

      return res.status(404).json({
        error: "Subscription not found",
        email
      });
    }

    console.log("Matched subscription:", subscription.email);

    const sites = cachedSites || [];

    console.log(`Cached sites loaded: ${sites.length}`);

    if (sites.length === 0) {
      return res.status(200).json({
        message: "Location received, but no UNESCO sites are cached",
        email,
        trackerId
      });
    }

    const nearbySites = findNearbySites(
      lat,
      lon,
      sites,
      500 // test-radie, sänk senare till t.ex. 25 eller 50
    );

    console.log(
      "Nearby sites:",
      nearbySites.map(site => ({
        name: site.name,
        country: site.country,
        distanceKm: site.distanceKm.toFixed(2)
      }))
    );

    const closestSite = nearbySites[0];
    

    if (!closestSite) {
      return res.status(200).json({
        message: "Location received, no nearby UNESCO sites",
        email,
        trackerId,
        lat,
        lon
      });
    }

    const messageLanguage = subscription.language === "en" ? "en" : "sv";
    const texts = uiTexts[messageLanguage];

    const unsubscribeUrl =
      `${getPublicBaseUrl(req)}/api/subscriptions/cancel?subscriptionId=${subscription.subscriptionId}`;

    const notificationMessage =
      `${texts.nearbyNotificationMessage} ${closestSite.name}.


      ${texts.unsubscribeText}
      ${unsubscribeUrl}`;

    const subject = `${texts.nearbyNotificationSubject} ${closestSite.name}`;

    const notificationResults = [];

    if (
      (subscription.notificationType === "sms" ||
        subscription.notificationType === "both") &&
      subscription.phone
    ) {
      const smsResult = await sendNotification({
        channel: "sms",
        to: subscription.phone,
        subject,
        message: notificationMessage,
        user_id: subscription.subscriptionId,
        site_id: closestSite.id
      });

      console.log("SMS notification result:", smsResult);
      notificationResults.push({
        channel: "sms",
        result: smsResult
      });
    }

    if (
      (subscription.notificationType === "email" ||
        subscription.notificationType === "both") &&
      subscription.email
    ) {
      const emailResult = await sendNotification({
        channel: "email",
        to: subscription.email,
        subject,
        message: notificationMessage,
        user_id: subscription.subscriptionId,
        site_id: closestSite.id
      });

      console.log("Email notification result:", emailResult);
      notificationResults.push({
        channel: "email",
        result: emailResult
      });
    }

    return res.status(200).json({
      message: "Location received, notification handled",
      email,
      trackerId,
      site: {
        id: closestSite.id,
        name: closestSite.name,
        country: closestSite.country,
        distanceKm: Number(closestSite.distanceKm.toFixed(2))
      },
      notifications: notificationResults
    });

  } catch (error) {
    console.error("OwnTracks error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

