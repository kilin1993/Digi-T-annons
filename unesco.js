import { translateText } from "./translation.js";
import { t } from "./i18n.js";
import { initChatbot } from "./chatbot.js";

const overlay = document.getElementById("overlay");
const popup = document.getElementById("popup");
const adCard = document.querySelector(".ad");
const toggleDescriptionBtn = document.getElementById("toggleDescriptionBtn");
const languageSelect = document.getElementById("languageSelect");
const API_BASE_URL = window.UNESCO_AD_BASE_URL || window.location.origin;

function apiUrl(path) {
  return new URL(path, API_BASE_URL).toString();
}

// Lagrar all UNESCO-data som hämtas från backend
let unescoSites = [];

// Håller koll på vilken post som visas just nu
let currentSiteIndex = 0;

// Styr om popup-texten är expanderad eller inte
let isDescriptionExpanded = false;

// Sparar hela beskrivningen för aktuell plats
let currentFullDescription = "";

//Sparar orginalspråk och översatt språk
let originalDescription = "";
let currentLanguage = getPageLanguage();

// Kommer att uppdateras av geolacation i webbläsaren
let userPosition = null;
let currentDistanceKm = null;

let primaryNearestSite = null;
let primaryNearestDistanceKm = null;
let currentNearbySites = [];

let activeSubscription = null;
let locationWatchId = null;
const NOTIFY_RADIUS_KM = 5;

let uiLanguage = getPageLanguage();

const chatbot = initChatbot({
  getCurrentSite,
  getCurrentDescription: () => currentFullDescription,
  getCurrentDistanceKm: () => currentDistanceKm
});


function openPopup() {
  overlay.classList.add("show");
  popup.classList.add("show");
}


function closeAll() {
  overlay.classList.remove("show");
  popup.classList.remove("show");
}

function openAdpopout() {
  openPopup();
}

window.openPayment = function () {
  const container = document.getElementById("paymentContainer");
  if (!container) return;

  container.classList.remove("hidden");

  container.innerHTML = `
    <payment-simulator mode="api" base-url="${API_BASE_URL}"></payment-simulator>
  `;
};

window.closePayment = function () {
  const container = document.getElementById("paymentContainer");
  if (!container) return;

  container.classList.add("hidden");
  container.innerHTML = "";
};

window.handleDecline = function () {
  const container = document.getElementById("paymentContainer");

  // Om betalningen är synlig → stäng den
  if (container && !container.classList.contains("hidden")) {
    closePayment();
    return;
  }

  // annars stäng hela popupen
  closeAll();
};

// Hämtar UNESCO-data från din egen endpoint i server.js
async function loadUnescoSites() {
  try {
    const response = await fetch(apiUrl("/api/unesco/sites"));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load UNESCO sites");
    }

    return data;
  } catch (error) {
    console.error("Could not load UNESCO sites:", error);
    return [];
  }
}

// Returnerar den UNESCO-post som är aktiv just nu
function getCurrentSite() {
  if (!unescoSites.length) return null;
  return unescoSites[currentSiteIndex];
}

// Kortar ner lång text så att popupen inte blir för stor direkt
function truncateText(text, maxLength = 220) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

// Skriver in UNESCO-data i huvudpopupen
async function renderPopup(site) {
  const kicker = document.querySelector(".popup-kicker");
  const title = document.querySelector(".popup-title");
  const text = document.querySelector(".popup-text");
  const link = document.getElementById("unescoLink");

  // Spara original (engelska från API)
  originalDescription = site.description || "";
  currentFullDescription = originalDescription;
  isDescriptionExpanded = false;

  // Behåll valt språk
  if (languageSelect) {
    languageSelect.value = currentLanguage;
  }

  // UI-texter
  if (kicker) kicker.textContent = t("discover", uiLanguage);
  if (title) title.textContent = site.name;
  if (text) text.textContent = "Laddar svensk text...";

  if (link) {
    if (site.url) {
      link.href = site.url;
      link.style.display = "inline-block";
    } else {
      link.removeAttribute("href");
      link.style.display = "none";
    }
  }

  // Visa rätt knapptext
  if (toggleDescriptionBtn) {
    const shouldShowButton = currentFullDescription.length > 220;
    toggleDescriptionBtn.style.display = shouldShowButton ? "inline-block" : "none";
    toggleDescriptionBtn.textContent = t("showMore", uiLanguage);
  }

  renderUiLanguage();
  await translateCurrentSite(currentLanguage);
}


// Renderar UNESCO-modulen
// Just nu uppdateras bara popup,
// inte bakgrundssidan/fake-tidningen
async function renderUnescoSite(site) {
  if (!site) return;

  await renderPopup(site);
  chatbot.reset(site);
}

// Växlar mellan kort och full beskrivning i popupen
function toggleDescription() {
  const text = document.querySelector(".popup-text");
  if (!text || !toggleDescriptionBtn) return;

  if (isDescriptionExpanded) {
    text.textContent = truncateText(currentFullDescription);
    toggleDescriptionBtn.textContent = t("showMore", uiLanguage);
    isDescriptionExpanded = false;
  } else {
    text.textContent = currentFullDescription;
    toggleDescriptionBtn.textContent = t("showLess", uiLanguage);
    isDescriptionExpanded = true;
  }
}

// Visar nästa UNESCO-post i listan
function showNextSite() {
  if (!unescoSites.length) return;

  currentSiteIndex = (currentSiteIndex + 1) % unescoSites.length;
  renderUnescoSite(getCurrentSite());
}

// Visar föregående UNESCO-post i listan
function showPreviousSite() {
  if (!unescoSites.length) return;

  currentSiteIndex =
    (currentSiteIndex - 1 + unescoSites.length) % unescoSites.length;
  renderUnescoSite(getCurrentSite());
}

// Hämtar en UNESCO-post via id
function getUnescoSiteById(id) {
  return unescoSites.find(site => site.id === id) || null;
}

// Hämtar en UNESCO-post via namn
function getUnescoSiteByName(name) {
  return (
    unescoSites.find(
      site => site.name.toLowerCase() === name.toLowerCase()
    ) || null
  );
}

// Hämtar användarens geolocation med fallback lösning
async function getUserLocation() {
  // Försök 1: Använd navigator.geolocation
  try {
    if (navigator.geolocation) {
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) =>
            resolve({
              latitude: coords.latitude,
              longitude: coords.longitude
            }),
          reject,
          { timeout: 5000 }
        );
      });
    }
  } catch (error) {
    console.warn("Geolocation misslyckades:", error);
  }

  // Försök 2: Fallback till GeoIP API
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (response.ok) {
      const data = await response.json();
      console.log("Använder GeoIP fallback, land:", data.country_code);
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        country: data.country_code
      };
    }
  } catch (error) {
    console.warn("GeoIP fallback misslyckades:", error);
  };
}

async function activateAndOpenPayment() {
  try {
    const currentSite = getCurrentSite();

    // Om ett världsarv redan visas:
    // hämta ev. platsdata, men rendera INTE om popupen
    if (currentSite) {
      if (!userPosition || currentDistanceKm === null) {
        try {
          userPosition = await getUserLocation();

          const nearestSites = findNearestSites(userPosition, 4);
          const nearestSite = nearestSites[0];

    if (nearestSite) {
      currentDistanceKm = nearestSite.distanceKm;
    }

        } catch (error) {
          console.warn("Platsåtkomst nekades eller misslyckades:", error);
        }
      }

      openPayment();
      return;
    }

    // Fallback: om inget världsarv finns alls
    const title = document.querySelector(".popup-title");
    const text = document.querySelector(".popup-text");

    if (title) title.textContent = "Hämtar världsarv...";
    if (text) text.textContent = "Letar efter världsarv nära dig...";

    const [sites, position] = await Promise.all([
      unescoSites.length ? Promise.resolve(unescoSites) : loadUnescoSites(),
      getUserLocation(),
    ]);

    unescoSites = sites;
    userPosition = position;

    const nearestSites = findNearestSites(userPosition, 4);
    const site = nearestSites[0];

    if (!site) {
      return alert("Kunde inte hitta någon UNESCO-plats.");
    }


    currentDistanceKm = site.distanceKm;
    currentSiteIndex = unescoSites.findIndex(s => s.id === site.id);

    await renderUnescoSite(site);

    openPayment();

  } catch (error) {
    console.error(error);
    alert("Du behöver godkänna platsåtkomst.");
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateCurrentSite(language) {
  const text = document.querySelector(".popup-text");
  if (!text) return;

  if (!originalDescription.trim()) {
    text.textContent = "Ingen text finns att översätta.";
    return;
  }

  if (language === "en") {
    currentFullDescription = originalDescription;
    text.textContent = isDescriptionExpanded
      ? currentFullDescription
      : truncateText(currentFullDescription);
    return;
  }

  text.textContent = "Översätter världsarv...";

  try {
    const [translatedText] = await Promise.all([
      translateText(originalDescription, language),
    ]);

    currentFullDescription = translatedText;

    text.textContent = isDescriptionExpanded
      ? currentFullDescription
      : truncateText(currentFullDescription);

  } catch (error) {
    console.error("Translation error:", error);
    text.textContent = "Fel vid översättning";
  }
}

function getPageLanguage() {
  const pageLang = document.documentElement.lang || "en";
  const shortLang = pageLang.slice(0, 2).toLowerCase();

  if (shortLang === "sv") return "sv";
  if (shortLang === "en") return "en";

  return "en";
}


// Haversine formeln för att räkna ut avstånd i km mellan två koordinater
const toRadians = (value) => (value * Math.PI) / 180;

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}



function findNearestSites(position, limit = 4) {
  return unescoSites
    .filter(site => site.latitude != null && site.longitude != null)
    .map(site => ({
      ...site,
      distanceKm: getDistanceKm(
        position.latitude,
        position.longitude,
        Number(site.latitude),
        Number(site.longitude)
      )
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}


// Funktion som körs när man klickar på knappen "Aktivera världsarvsinfo"
async function activateNearbyInfo() {
  try {
    openPopup();

    const title = document.querySelector(".popup-title");
    const text = document.querySelector(".popup-text");

    if (title) title.textContent = "Hämtar världsarv...";
    if (text) text.textContent = "Letar efter världsarv nära dig...";

    const [sites, position] = await Promise.all([
      unescoSites.length ? Promise.resolve(unescoSites) : loadUnescoSites(),
      getUserLocation(),
    ]);

    unescoSites = sites;
    userPosition = position;

    // NYTT: hämta flera närmaste istället för bara en
    const nearestSites = findNearestSites(userPosition, 4);
    const site = nearestSites[0];

    primaryNearestSite = site;
    primaryNearestDistanceKm = site.distanceKm;
    currentNearbySites = nearestSites;

    if (!site) {
      return alert("Kunde inte hitta någon UNESCO-plats med koordinater.");
    }

    currentDistanceKm = site.distanceKm;
    currentSiteIndex = unescoSites.findIndex(s => s.id === site.id);

    // Visa huvudplatsen (som innan)
    await renderUnescoSite(site);

    // NYTT: rendera fler alternativ under
    renderNearbySites(nearestSites);

  } catch (error) {
    console.error("Kunde inte hämta användarens plats:", error);
    alert("Du behöver godkänna platsåtkomst för att använda funktionen.");
  }

}

function renderNearbySites(sites) {
  const container = document.getElementById("nearbySites");
  if (!container) return;

  const currentSite = getCurrentSite();
  const isViewingPrimary = primaryNearestSite && currentSite?.id === primaryNearestSite.id;

  const alternatives = sites
    .filter(site => site.id !== currentSite?.id)
    .slice(0, 3);

container.innerHTML = `
  ${!isViewingPrimary && primaryNearestSite ? `
    <button class="nearby-back-btn" type="button">
      ${t("backToNearest", uiLanguage)}
    </button>
  ` : ""}

  <h3>${t("nearbySites", uiLanguage)}</h3>

  <div class="nearby-sites-list">
    ${alternatives.map(site => `
      <button class="nearby-site-card" data-site-id="${site.id}">
        <span>${site.name}</span>
        <small>${site.distanceKm.toFixed(1)} km</small>
      </button>
    `).join("")}
  </div>
`;

  const backBtn = container.querySelector(".nearby-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", async () => {
      currentSiteIndex = unescoSites.findIndex(s => s.id === primaryNearestSite.id);
      currentDistanceKm = primaryNearestDistanceKm;

      await renderUnescoSite(primaryNearestSite);
      renderNearbySites(currentNearbySites);
    });
  }

  container.querySelectorAll(".nearby-site-card").forEach(button => {
    button.addEventListener("click", async () => {
      const site = sites.find(s => s.id === button.dataset.siteId);
      if (!site) return;

      currentSiteIndex = unescoSites.findIndex(s => s.id === site.id);
      currentDistanceKm = site.distanceKm;

      await renderUnescoSite(site);
      renderNearbySites(currentNearbySites);
    });
  });
}

async function createSubscriptionAfterPayment(customer) {
  const response = await fetch(apiUrl("/api/subscriptions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...customer,
      language: uiLanguage
    })
  });

  const data = await response.json();

  if (!response.ok) {
    alert("Betalningen gick igenom, men prenumerationen kunde inte skapas.");
    return;
  }

  activeSubscription = data.subscription;
  localStorage.setItem("activeSubscription", JSON.stringify(activeSubscription));

  alert("Prenumerationen är aktiv! Bekräftelsemejl har skickats.");

  startLocationMonitoring();
}

function startLocationMonitoring() {
  if (!activeSubscription) return;

  if (!navigator.geolocation) {
    alert("Platstjänst stöds inte i webbläsaren.");
    return;
  }

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
  }

  locationWatchId = navigator.geolocation.watchPosition(
    async ({ coords }) => {
      const position = {
        latitude: coords.latitude,
        longitude: coords.longitude
      };

      const nearestSites = findNearestSites(position, 1);
      const nearestSite = nearestSites[0];

      if (!nearestSite) return;

      if (nearestSite.distanceKm <= NOTIFY_RADIUS_KM) {
        await notifyNearbyHeritage(nearestSite);
      }
    },
    (error) => {
      console.error("Location monitoring error:", error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 10000
    }
  );
}

async function notifyNearbyHeritage(site) {
  if (!activeSubscription) return;

  const response = await fetch(apiUrl("/api/subscriptions/notify-nearby"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      subscriptionId: activeSubscription.subscriptionId,
      language: uiLanguage,
      site: {
        id: site.id,
        name: site.name,
        url: site.url
      }
    })
  });

  const data = await response.json();
  console.log("Nearby notification:", data);
}

// Startar komponenten:
// 1. hämtar data
// 2. visar första UNESCO-posten
async function initUnescoComponent() {
  currentLanguage = getPageLanguage();
  uiLanguage = getPageLanguage();

  if (languageSelect) {
    languageSelect.value = currentLanguage;
  }

  unescoSites = await loadUnescoSites();

  if (!unescoSites.length) {
    console.warn("No UNESCO sites found.");
    return;
  }

  await renderUnescoSite(getCurrentSite());
  renderUiLanguage();
}

// Kopplar "Visa mer"-knappen till expand/collapse-funktionen
if (toggleDescriptionBtn) {
  toggleDescriptionBtn.addEventListener("click", toggleDescription);
}

if (adCard) {
  adCard.addEventListener("click", activateNearbyInfo);
}
// window.addEventListener("load", initUnescoComponent);

function renderUiLanguage() {
  const kicker = document.querySelector(".popup-kicker");
  const languageLabel = document.querySelector("label[for='languageSelect']");
  const primaryBtn = document.querySelector(".popup-actions .primary");
  const secondaryBtn = document.querySelector(".popup-actions .secondary");
  const unescoLink = document.getElementById("unescoLink");
  
  if (unescoLink) unescoLink.textContent = t("unescoLink", uiLanguage);

  if (kicker) kicker.textContent = t("discover", uiLanguage);
  if (languageLabel) languageLabel.textContent = t("chooseLanguage", uiLanguage);

  if (toggleDescriptionBtn) {
    toggleDescriptionBtn.textContent = isDescriptionExpanded
      ? t("showLess", uiLanguage)
      : t("showMore", uiLanguage);
  }

  if (primaryBtn) primaryBtn.textContent = t("activate", uiLanguage);
  if (secondaryBtn) secondaryBtn.textContent = t("noThanks", uiLanguage);

  const featureNearby = document.getElementById("featureNearby");
  const featureLanguage = document.getElementById("featureLanguage");
  const featureQuestions = document.getElementById("featureQuestions");
  const featureSms = document.getElementById("featureSms");

  if (featureNearby) featureNearby.textContent = t("featureNearby", uiLanguage);
  if (featureLanguage) featureLanguage.textContent = t("featureLanguage", uiLanguage);
  if (featureQuestions) featureQuestions.textContent = t("featureQuestions", uiLanguage);
  if (featureSms) featureSms.textContent = t("featureSms", uiLanguage);

  const heroTitleLine1 = document.getElementById("heroTitleLine1");
  const heroTitleLine2 = document.getElementById("heroTitleLine2");
  const heroTitleLine3 = document.getElementById("heroTitleLine3");
  const heroNoticeTitle = document.getElementById("heroNoticeTitle");
  const heroNoticeSubtitle = document.getElementById("heroNoticeSubtitle");
  const heroRealtimeTitle = document.getElementById("heroRealtimeTitle");
  const heroRealtimeSubtitle = document.getElementById("heroRealtimeSubtitle");

  if (heroTitleLine1) heroTitleLine1.textContent = t("heroTitleLine1", uiLanguage);
  if (heroTitleLine2) heroTitleLine2.textContent = t("heroTitleLine2", uiLanguage);
  if (heroTitleLine3) heroTitleLine3.textContent = t("heroTitleLine3", uiLanguage);
  if (heroNoticeTitle) heroNoticeTitle.textContent = t("heroNoticeTitle", uiLanguage);
  if (heroNoticeSubtitle) heroNoticeSubtitle.textContent = t("heroNoticeSubtitle", uiLanguage);
  if (heroRealtimeTitle) heroRealtimeTitle.textContent = t("heroRealtimeTitle", uiLanguage);
  if (heroRealtimeSubtitle) heroRealtimeSubtitle.textContent = t("heroRealtimeSubtitle", uiLanguage);

  const adTitle = document.getElementById("adTitle");
  const adText = document.getElementById("adText");
  const adButton = document.getElementById("adButton");
  const adPopularTitle = document.getElementById("adPopularTitle");
  const adSite1Country = document.getElementById("adSite1Country");
  const adSite2Country = document.getElementById("adSite2Country");

  if (adTitle) adTitle.textContent = t("adTitle", uiLanguage);
  if (adText) adText.textContent = t("adText", uiLanguage);
  if (adButton) adButton.textContent = t("adButton", uiLanguage);
  if (adPopularTitle) adPopularTitle.textContent = t("adPopularTitle", uiLanguage);
  if (adSite1Country) adSite1Country.textContent = t("adSite1Country", uiLanguage);
  if (adSite2Country) adSite2Country.textContent = t("adSite2Country", uiLanguage);
}

if (languageSelect) {
  languageSelect.addEventListener("change", async () => {
    const selectedLanguage = languageSelect.value;
    currentLanguage = selectedLanguage;

    uiLanguage = selectedLanguage === "en" ? "en" : "sv";

    document.documentElement.lang = uiLanguage;

    renderUiLanguage();

    const paymentSimulator = document.querySelector("payment-simulator");

    if (paymentSimulator) {
      paymentSimulator.render();
      paymentSimulator.bind();
    }

    if (currentNearbySites.length) {
      renderNearbySites(currentNearbySites);
    }

    await translateCurrentSite(selectedLanguage);
    chatbot.setLanguage(selectedLanguage);

    const currentSite = getCurrentSite();
    if (currentSite) {
      chatbot.reset(currentSite);
    }
  });
}

window.openPopup = openPopup;


// Gör popup-funktionerna tillgängliga från HTML
window.openPopup = openPopup;
window.closeAll = closeAll;
window.showNextSite = showNextSite;
window.showPreviousSite = showPreviousSite;
window.activateNearbyInfo = activateNearbyInfo;

// Gör UNESCO-funktionerna tillgängliga för andra komponenter senare
window.renderUnescoSite = renderUnescoSite;
window.getUnescoSiteById = getUnescoSiteById;
window.getUnescoSiteByName = getUnescoSiteByName;
window.loadUnescoSites = loadUnescoSites;
window.activateAndOpenPayment = activateAndOpenPayment;

document.addEventListener("payment-success", async (event) => {
  const customer = event.detail.customer;

  if (!customer) {
    console.warn("payment-success saknar customer-data");
    return;
  }

  await createSubscriptionAfterPayment(customer);
});
