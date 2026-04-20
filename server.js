import express from "express";
import path from "path";
import { fileURLToPath } from "url";

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




app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});