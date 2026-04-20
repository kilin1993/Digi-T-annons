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

// Gör UNESCO-funktionerna tillgängliga för andra komponenter senare
window.renderUnescoSite = renderUnescoSite;
window.getUnescoSiteById = getUnescoSiteById;
window.getUnescoSiteByName = getUnescoSiteByName;
window.loadUnescoSites = loadUnescoSites;