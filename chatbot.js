export function initChatbot({
  getCurrentSite,
  getCurrentDescription,
  getCurrentDistanceKm
}) {
  const chatbot = document.getElementById("chatbot");
  const chatToggleBtn = document.getElementById("chatToggleBtn");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");

  function addMessage(text, sender = "bot") {
    if (!chatMessages) return;

    const message = document.createElement("div");
    message.className = `chat-message ${sender}`;
    message.textContent = text;
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function askAi(question) {
    const site = getCurrentSite();

    if (!site) {
      return "Jag hittar ingen vald världsarvsplats just nu.";
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        site,
        description: getCurrentDescription(),
        distanceKm: getCurrentDistanceKm()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Chatten kunde inte svara just nu.");
    }

    return data.answer || "Chatten kunde inte svara just nu.";
  }

  function reset(site) {
    if (!chatMessages || !site) return;

    chatMessages.innerHTML = "";
    addMessage(`Hej! Fråga mig om ${site.name}.`);
  }

  function setOpen(isOpen) {
    if (!chatbot || !chatToggleBtn) return;

    chatbot.classList.toggle("collapsed", !isOpen);
    chatToggleBtn.setAttribute("aria-expanded", String(isOpen));
    chatToggleBtn.setAttribute(
      "title",
      isOpen ? "Stäng chatten" : "Öppna chatten"
    );
    chatToggleBtn.classList.toggle("open", isOpen);

    if (isOpen && chatInput) {
      chatInput.focus();
    }
  }

  function toggle() {
    if (!chatbot) return;
    setOpen(chatbot.classList.contains("collapsed"));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!chatInput || !chatMessages) return;

    const question = chatInput.value.trim();
    if (!question) return;

    addMessage(question, "user");
    chatInput.value = "";
    addMessage("Tänker...", "bot");

    try {
      const answer = await askAi(question);
      chatMessages.lastElementChild.textContent = answer;
    } catch (error) {
      console.error("Chat error:", error);
      chatMessages.lastElementChild.textContent =
        error.message || "Chatten kunde inte svara just nu.";
    }
  }

  if (chatForm) {
    chatForm.addEventListener("submit", handleSubmit);
  }

  if (chatToggleBtn) {
    chatToggleBtn.addEventListener("click", toggle);
  }

  return {
    reset,
    setOpen
  };
}
