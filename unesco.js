import { translateText } from "./translation.js";
import { t } from "./i18n.js";

const overlay = document.getElementById("overlay");
const popup = document.getElementById("popup");
const sidePopup = document.getElementById("sidePopup");
const adCard = document.querySelector(".ad");
const toggleDescriptionBtn = document.getElementById("toggleDescriptionBtn");
const languageSelect = document.getElementById("languageSelect");
const popupStatus = document.getElementById("popupStatus");

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
let currentLanguage = "sv";

// Kommer att uppdateras av geolacation i webbläsaren
let userPosition = null;
let currentDistanceKm = null;

let uiLanguage = "sv";


function openPopup() {
  overlay.classList.add("show");
  popup.classList.add("show");
}

function openMini() {
  sidePopup.classList.add("show");
}

function closeMini() {
  sidePopup.classList.remove("show");
}

function closeAll() {
  overlay.classList.remove("show");
  popup.classList.remove("show");
  closeMini();
}

function openAdpopout() {
  openPopup();
  openMini();
}

function setPopupStatus(message, type = "loading") {
  if (!popupStatus) return;

  popupStatus.textContent = message;
  popupStatus.style.display = "block";
  popupStatus.className = `popup-status ${type}`;
}

function setSideStatus(key) {
  const el = document.getElementById("sideStatus");
  if (!el) return;

  el.textContent = t(key, uiLanguage);
  el.style.display = "block";
}

function clearSideStatus() {
  const el = document.getElementById("sideStatus");
  if (!el) return;

  el.textContent = "";
  el.style.display = "none";
}

function clearPopupStatus() {
  if (!popupStatus) return;

  popupStatus.textContent = "";
  popupStatus.style.display = "none";
  popupStatus.className = "popup-status";
}

window.openPayment = function () {
  const modal = document.getElementById('paymentModal');
  const container = document.getElementById('paymentContainer');

  modal.classList.add('active');

  // skapa komponenten dynamiskt
  container.innerHTML = `
    <payment-simulator mode="api"></payment-simulator>
  `;
};

window.closePayment = function () {
  document.getElementById('paymentModal').classList.remove('active');
};

// Hämtar UNESCO-data från din egen endpoint i server.js
async function loadUnescoSites() {
  try {
    const response = await fetch("/api/unesco/sites");
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

function renderNearbySitesList(nearbySites) {
  const list = document.getElementById("nearbySitesList");
  if (!list) return;

  list.innerHTML = nearbySites
    .slice(1)
    .map(({ site, distanceKm }) => `
      <button class="nearby-site-item" data-site-id="${site.id}">
        ${site.name} · ${distanceKm.toFixed(1)} km ↗
      </button>
    `)
    .join("");

  list.querySelectorAll(".nearby-site-item").forEach(button => {
    button.addEventListener("click", () => {
      const siteId = button.dataset.siteId;
      const selected = unescoSites.find(site => String(site.id) === String(siteId));

      if (!selected) return;

      currentSiteIndex = unescoSites.findIndex(site => String(site.id) === String(siteId));
      renderUnescoSite(selected);
    });
  });
}

// Skriver in UNESCO-data i huvudpopupen
function renderPopup(site) {
  const kicker = document.querySelector(".popup-kicker");
  const title = document.querySelector(".popup-title");
  const text = document.querySelector(".popup-text");
  const image = document.querySelector(".popup-left");
  const unescoLink = document.getElementById("unescoLink");

  // Spara original (engelska från API)
  originalDescription = site.description || "";
  currentFullDescription = originalDescription;
  isDescriptionExpanded = false;

  // Startspråk
  currentLanguage = "sv";
  uiLanguage = "sv";

  // Se till att dropdownen visar svenska
  if (languageSelect) {
    languageSelect.value = "sv";
  }

  if (unescoLink) {
    unescoLink.href = site.unescoUrl || "https://whc.unesco.org";
  }

  // Bildlogik med fallback
  const fallbackImage = "https://images.unsplash.com/photo-1616428090830-59bd09d9f272?w=1200&auto=format&fit=crop";

  let imageUrl = fallbackImage;

  if (site.imageUrl && /\.(jpg|jpeg|png|webp)$/i.test(site.imageUrl)) {
    imageUrl = site.imageUrl;
  }

  if (image) {
    image.style.background = `
    linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.4)),
    url("${imageUrl}") center/cover no-repeat
  `;
  }

  // UI-texter
  if (kicker) kicker.textContent = t("discover", uiLanguage);
  if (title) title.textContent = site.name;
  if (text) text.textContent = "Laddar svensk text...";

  // Visa rätt knapptext
  if (toggleDescriptionBtn) {
    const shouldShowButton = currentFullDescription.length > 220;
    toggleDescriptionBtn.style.display = shouldShowButton ? "inline-block" : "none";
    toggleDescriptionBtn.textContent = t("showMore", uiLanguage);
  }

  // Översätt aktuell text till svenska
  translateCurrentSite("sv");
}

// Skriver in UNESCO-data i sidopopupen
function renderSidePopup(site) {
  const title = document.querySelector(".side-title");
  const text = document.querySelector(".side-text");
  const miniMap = document.querySelector(".mini-map");

  if (title) title.textContent = site.name;
  if (text) text.textContent = `${site.country} · ${site.region}`;

  // 👇 BILDLOGIK
  const fallbackImage =
    "https://images.unsplash.com/photo-1616428090830-59bd09d9f272?w=1200&auto=format&fit=crop";

  let imageUrl = fallbackImage;

  if (site.imageUrl && /\.(jpg|jpeg|png|webp)$/i.test(site.imageUrl)) {
    imageUrl = site.imageUrl;
  }

  if (miniMap) {
    miniMap.style.background = `
      linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.4)),
      url("${imageUrl}") center/cover no-repeat
    `;
  }
}

// Renderar UNESCO-modulen
// Just nu uppdateras bara popup och sidopopup,
// inte bakgrundssidan/fake-tidningen
function renderUnescoSite(site) {
  if (!site) return;

  renderPopup(site);
  renderSidePopup(site);
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

// Hämtar användarens geolocation
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocation stöds inte i webbläsaren."));
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude
        }),
      reject
    );
  });
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

  text.textContent = "Översätter...";

  try {
    const translatedText = await translateText(originalDescription, language);

    currentFullDescription = translatedText;

    text.textContent = isDescriptionExpanded
      ? currentFullDescription
      : truncateText(currentFullDescription);

  } catch (error) {
    console.error("Translation error:", error);
    text.textContent = "Fel vid översättning";
  }
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

function findNearestSites(position, limit = 3) {
  return unescoSites
    .filter(site => site.latitude != null && site.longitude != null)
    .map(site => ({
      site,
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
    setPopupStatus(t("loadingNearest", uiLanguage), "loading");
    setSideStatus("loadingNearby");

    if (!unescoSites.length) {
      unescoSites = await loadUnescoSites();
    }

    // Hämtar användarens position och hittar närmaste UNESCO-plats
    userPosition = await getUserLocation();
    const nearbySites = findNearestSites(userPosition, 5);
    const { site, distanceKm } = nearbySites[0];

    if (!site) {
      return alert("Kunde inte hitta någon UNESCO-plats med koordinater.");
    }

    currentDistanceKm = distanceKm;
    currentSiteIndex = unescoSites.findIndex(s => s.id === site.id);

    // Uppdaterar popupen med den närmaste platsen och öppnar den
    clearPopupStatus();
    clearSideStatus();
    renderUnescoSite(site);
    renderNearbySitesList(nearbySites);
    openPopup();
    openMini();
  } catch (error) {
    console.error("Kunde inte hämta användarens plats:", error);
    setPopupStatus("Kunde inte hämta din plats.", "error");
    setSideStatus("nearbyError");
    alert("Du behöver godkänna platsåtkomst för att använda funktionen.");
  }
}

// Startar komponenten:
// 1. hämtar data
// 2. visar första UNESCO-posten
async function initUnescoComponent() {
  setPopupStatus("Läser in världsarv...", "loading");

  unescoSites = await loadUnescoSites();

  if (!unescoSites.length) {
    setPopupStatus("Kunde inte ladda UNESCO-data.", "error");
    console.warn("No UNESCO sites found.");
    return;
  }

  clearPopupStatus();

  renderUnescoSite(getCurrentSite());
  renderUiLanguage();

  setTimeout(() => {
    openPopup();
  }, 1500);
}

// Kopplar "Visa mer"-knappen till expand/collapse-funktionen
if (toggleDescriptionBtn) {
  toggleDescriptionBtn.addEventListener("click", toggleDescription);
}

if (adCard) {
  adCard.addEventListener("click", openAdpopout);
}

window.addEventListener("load", initUnescoComponent);

function renderUiLanguage() {
  document.querySelector(".popup-kicker").textContent = t("discover", uiLanguage);
  document.querySelector("label[for='languageSelect']").textContent = t("chooseLanguage", uiLanguage);

  if (toggleDescriptionBtn) {
    toggleDescriptionBtn.textContent = isDescriptionExpanded
      ? t("showLess", uiLanguage)
      : t("showMore", uiLanguage);
  }

  document.getElementById("unescoLink").textContent = t("readMoreUnesco", uiLanguage);
  document.getElementById("nearbyHeading").textContent = t("nearbyHeading", uiLanguage);
  document.querySelector(".popup-actions .primary").textContent = t("activate", uiLanguage);
  document.querySelector(".popup-actions .secondary").textContent = t("noThanks", uiLanguage);
  document.querySelector(".side-title").textContent = t("nearby", uiLanguage);
  document.querySelector(".side-content .primary").textContent = t("subscribeSms", uiLanguage);
  document.getElementById("featureNearby").textContent = t("featureNearby", uiLanguage);
  document.getElementById("featureLanguage").textContent = t("featureLanguage", uiLanguage);
  document.getElementById("featureQuestions").textContent = t("featureQuestions", uiLanguage);
  document.getElementById("featureSms").textContent = t("featureSms", uiLanguage);
}

if (languageSelect) {
  languageSelect.addEventListener("change", async () => {
    const selectedLanguage = languageSelect.value;
    currentLanguage = selectedLanguage;

    if (selectedLanguage === "en") {
      uiLanguage = "en";
    } else {
      uiLanguage = "sv";
    }

    renderUiLanguage();
    await translateCurrentSite(selectedLanguage);
  });
}

// Gör popup-funktionerna tillgängliga från HTML
window.openPopup = openPopup;
window.openMini = openMini;
window.closeMini = closeMini;
window.closeAll = closeAll;
window.showNextSite = showNextSite;
window.showPreviousSite = showPreviousSite;
window.activateNearbyInfo = activateNearbyInfo;

// Gör UNESCO-funktionerna tillgängliga för andra komponenter senare
window.renderUnescoSite = renderUnescoSite;
window.getUnescoSiteById = getUnescoSiteById;
window.getUnescoSiteByName = getUnescoSiteByName;
window.loadUnescoSites = loadUnescoSites;