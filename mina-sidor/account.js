import { initChatbot } from "../chatbot.js";

const API_BASE_URL = window.location.origin;

function apiUrl(path) {
  return new URL(path, API_BASE_URL).toString();
}

function getSubscriptionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("subscriptionId");
}

async function loadSubscriptionFromServer(subscriptionId) {
  const response = await fetch(
    apiUrl(`/api/account/${subscriptionId}`)
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "subscription_not_found");
  }

  return data.subscription;
}

let currentSite = null;
let currentDistanceKm = null;

async function loadUnescoSites() {
  const response = await fetch(apiUrl("/api/unesco/sites"));
  return response.json();
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude
      }),
      reject,
      { timeout: 8000 }
    );
  });
}

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

function findNearestSite(position, sites) {
  return sites
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
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

async function loadNearestSiteForChatbot() {
  try {
    const [sites, position] = await Promise.all([
      loadUnescoSites(),
      getUserLocation()
    ]);

    currentSite = findNearestSite(position, sites);
    currentDistanceKm = currentSite?.distanceKm ?? null;
  } catch (error) {
    console.error("Nearest site error:", error);
    currentSite = null;
    currentDistanceKm = null;
  }
}

function formatNotificationType(type) {
  if (type === "sms") return "SMS";
  if (type === "email") return "E-post";
  if (type === "both") return "SMS och e-post";
  return "Ej angivet";
}

function formatPlan(planId) {
  if (planId === "onetime") return "Månatlig";
  if (planId === "subscription") return "Årlig";
  if (planId === "monthly") return "Månatlig";
  if (planId === "yearly") return "Årlig";
  return planId || "Ej angivet";
}

function formatDate(dateString) {
  if (!dateString) return "Ej angivet";

  return new Date(dateString).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function renderSubscription(subscription) {
  document.getElementById("status").textContent =
    subscription.active !== false ? "Aktiv" : "Avslutad";

  document.getElementById("email").textContent =
    subscription.email || "Ej angivet";

  document.getElementById("phone").textContent =
    subscription.phone || "Ej angivet";

  document.getElementById("notificationType").textContent =
    formatNotificationType(subscription.notificationType);

  document.getElementById("planId").textContent =
    formatPlan(subscription.planId);
  
  document.getElementById("owntracksUserId").textContent =
    subscription.subscriptionId || "Ej angivet";

  document.getElementById("createdAt").textContent =
    formatDate(subscription.created_at);

  document.getElementById("owntracksUrl").textContent =
    `${API_BASE_URL}/api/location`;
}

function setupLogout() {
  const logoutButton = document.getElementById("logoutButton");

  if (!logoutButton) return;

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("activeSubscription");
    window.location.href = "/";
  });
}

function setupCancelSubscription(subscription) {
  const cancelButton = document.getElementById("cancelSubscription");

  if (!cancelButton) return;

  cancelButton.addEventListener("click", async () => {
    const confirmed = confirm(
      "Är du säker på att du vill avsluta prenumerationen?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        apiUrl(
          `/api/subscriptions/cancel?subscriptionId=${subscription.subscriptionId}`
        )
      );

      const text = await response.text();

      if (!response.ok) {
        alert(text || "Kunde inte avsluta prenumerationen.");
        return;
      }

      subscription.active = false;

      // Ta bort aktiv prenumeration från localStorage
      localStorage.removeItem("activeSubscription");

      // Uppdatera visningen
      renderSubscription(subscription);
      updateFeatureVisibility(subscription);

      alert(text || "Prenumerationen är avslutad.");
    } catch (error) {
      console.error("Cancel subscription error:", error);
      alert("Något gick fel vid avregistrering.");
    }
  });
}

function setupAccountChatbot() {
  const chatbot = initChatbot({
    getCurrentSite: () => currentSite,
    getCurrentDescription: () =>
      currentSite?.description ||
      currentSite?.shortDescription ||
      "",
    getCurrentDistanceKm: () => currentDistanceKm
  });

  if (currentSite) {
    chatbot.reset(currentSite);
  }
}

function updateFeatureVisibility(subscription) {
  const isActive = subscription && subscription.active !== false;

  const chatbot = document.getElementById("chatbot");
  const locationCard = document.getElementById("locationNotifications");
  const latestNotificationCard = document.getElementById("latestNotificationCard");
  if (chatbot) {
    chatbot.style.display = isActive ? "block" : "none";
  }

  if (locationCard) {
    locationCard.style.display = isActive ? "block" : "none";
  }

  if (latestNotificationCard) {
    latestNotificationCard.style.display = isActive ? "block" : "none";
  }
}

async function initAccountPage() {
  const subscriptionId = getSubscriptionIdFromUrl();

  if (!subscriptionId) {
    alert("Ingen prenumeration angiven.");
    window.location.href = "/";
    return;
  }


  try {
    const subscription = await loadSubscriptionFromServer(subscriptionId);

    localStorage.setItem(
      "activeSubscription",
      JSON.stringify(subscription)
    );

    renderSubscription(subscription);
    updateFeatureVisibility(subscription);

    setupLogout();
    setupCancelSubscription(subscription);

    if (subscription.active !== false) {
      await loadNearestSiteForChatbot();
      setupAccountChatbot();
}
  } catch (error) {
    console.error("Account load error:", error);
    alert("Prenumerationen kunde inte hittas.");
    window.location.href = "/";
  }
}


initAccountPage();