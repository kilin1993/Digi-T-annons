
const API_BASE_URL = window.location.origin;

function apiUrl(path) {
  return new URL(path, API_BASE_URL).toString();
}

function getActiveSubscription() {
  const storedSubscription = localStorage.getItem("activeSubscription");

  if (!storedSubscription) {
    return null;
  }

  try {
    return JSON.parse(storedSubscription);
  } catch {
    return null;
  }
}

function formatNotificationType(type) {
  if (type === "sms") return "SMS";
  if (type === "email") return "E-post";
  if (type === "both") return "SMS och e-post";
  return "Ej angivet";
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

  document.getElementById("owntracksUserId").textContent =
    subscription.subscriptionId || "Ej angivet";

  document.getElementById("createdAt").textContent =
    formatDate(subscription.created_at);

  document.getElementById("owntracksUrl").textContent =
    `${API_BASE_URL}/api/location`;
}

function addMessage(text, sender = "bot") {
  const chatMessages = document.getElementById("chatMessages");

  const message = document.createElement("div");
  message.className = `account-chat-message ${sender}`;
  message.textContent = text;

  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setupChatbot(subscription) {
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");

  addMessage("Hej! Jag är din UNESCO-assistent. Ställ gärna en fråga.");

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const question = chatInput.value.trim();

    if (!question) return;

    addMessage(question, "user");
    chatInput.value = "";

    addMessage("Tänker...", "bot");

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question,
          site: {
            name: "UNESCO World Heritage",
            country: "",
            region: "",
            shortDescription:
              "Användaren är prenumerant på UNESCO-notiser.",
            description:
              "Användaren är prenumerant på UNESCO-notiser."
          },
          description:
            "Användaren är prenumerant på UNESCO-notiser.",
          distanceKm: null,
          language: "sv"
        })
      });

      const data = await response.json();

      chatMessages.lastElementChild.textContent =
        data.answer || "Jag kunde inte svara just nu.";
    } catch (error) {
      console.error("Chat error:", error);
      chatMessages.lastElementChild.textContent =
        "Chatten kunde inte svara just nu.";
    }
  });
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
        apiUrl(`/api/subscriptions/cancel?subscriptionId=${subscription.subscriptionId}`)
      );

      const text = await response.text();

      if (!response.ok) {
        alert(text || "Kunde inte avsluta prenumerationen.");
        return;
      }

      subscription.active = false;
      localStorage.setItem("activeSubscription", JSON.stringify(subscription));

      renderSubscription(subscription);

      alert(text || "Prenumerationen är avslutad.");
    } catch (error) {
      console.error("Cancel subscription error:", error);
      alert("Något gick fel vid avregistrering.");
    }
  });
}

function initAccountPage() {
  const subscription = getActiveSubscription();

  if (!subscription) {
    alert("Ingen aktiv prenumeration hittades.");
    window.location.href = "/";
    return;
  }

  renderSubscription(subscription);
  setupChatbot(subscription);
  setupLogout();
  setupCancelSubscription(subscription);
}

initAccountPage();