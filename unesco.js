const overlay = document.getElementById("overlay");
const popup = document.getElementById("popup");
const sidePopup = document.getElementById("sidePopup");
const toggleDescriptionBtn = document.getElementById("toggleDescriptionBtn");

// Lagrar all UNESCO-data som hämtas från backend
let unescoSites = [];

// Håller koll på vilken post som visas just nu
let currentSiteIndex = 0;

// Styr om popup-texten är expanderad eller inte
let isDescriptionExpanded = false;

// Sparar hela beskrivningen för aktuell plats
let currentFullDescription = "";

// Kommer att uppdateras av geolacation i webbläsaren
let userPosition = null;
let currentDistanceKm = null;

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

// Skriver in UNESCO-data i huvudpopupen
function renderPopup(site) {
  const kicker = document.querySelector(".popup-kicker");
  const title = document.querySelector(".popup-title");
  const text = document.querySelector(".popup-text");

  currentFullDescription = site.description || "";
  isDescriptionExpanded = false;

  if (kicker) kicker.textContent = "Discover a UNESCO World Heritage Site";
  if (title) title.textContent = site.name;
  if (text) text.textContent = truncateText(currentFullDescription);

  // Visar bara knappen om texten faktiskt är lång
  if (toggleDescriptionBtn) {
    const shouldShowButton = currentFullDescription.length > 220;
    toggleDescriptionBtn.style.display = shouldShowButton ? "inline-block" : "none";
    toggleDescriptionBtn.textContent = "Visa mer";
  }
}

// Skriver in UNESCO-data i sidopopupen
function renderSidePopup(site) {
  const title = document.querySelector(".side-title");
  const text = document.querySelector(".side-text");

  if (title) title.textContent = site.name;
  if (text) text.textContent = `${site.country} · ${site.region}`;
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
    toggleDescriptionBtn.textContent = "Visa mer";
    isDescriptionExpanded = false;
  } else {
    text.textContent = currentFullDescription;
    toggleDescriptionBtn.textContent = "Visa mindre";
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

// Hittar närmaste UNESCO plats baserat på användarens position
function findNearestSite(position) {
  return unescoSites.reduce(
    (closest, site) => {
      if (site.latitude == null || site.longitude == null) return closest;

      const distanceKm = getDistanceKm(
        position.latitude,
        position.longitude,
        Number(site.latitude),
        Number(site.longitude)
      );

      return distanceKm < closest.distanceKm
        ? { site, distanceKm }
        : closest;
    },
    { site: null, distanceKm: Infinity }
  );
}

// Funktion som körs när man klickar på knappen "Aktivera världsarvsinfo"
async function activateNearbyInfo() {
  try {
    if (!unescoSites.length) {
      unescoSites = await loadUnescoSites();
    }

    // Hämtar användarens position och hittar närmaste UNESCO-plats
    userPosition = await getUserLocation();
    const { site, distanceKm } = findNearestSite(userPosition);

    if (!site) {
      return alert("Kunde inte hitta någon UNESCO-plats med koordinater.");
    }

    currentDistanceKm = distanceKm;
    currentSiteIndex = unescoSites.findIndex(s => s.id === site.id);

    // Uppdaterar popupen med den närmaste platsen och öppnar den
    renderUnescoSite(site);
    openPopup();
    openMini();
  } catch (error) {
    console.error("Kunde inte hämta användarens plats:", error);
    alert("Du behöver godkänna platsåtkomst för att använda funktionen.");
  }
}

// Startar komponenten:
// 1. hämtar data
// 2. visar första UNESCO-posten
async function initUnescoComponent() {
  unescoSites = await loadUnescoSites();

  if (!unescoSites.length) {
    console.warn("No UNESCO sites found.");
    return;
  }

  renderUnescoSite(getCurrentSite());

  // Bra för demo. Kan tas bort senare om annan komponent
  // ska styra när popupen öppnas.
  setTimeout(() => {
    openPopup();
  }, 1500);
}

// Kopplar "Visa mer"-knappen till expand/collapse-funktionen
if (toggleDescriptionBtn) {
  toggleDescriptionBtn.addEventListener("click", toggleDescription);
}

window.addEventListener("load", initUnescoComponent);

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