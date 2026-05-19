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

  // Svenska som standard
  let language = "sv"; 

  // Textinnehåll för olika språk
  const texts = {
    sv: {
      greeting: "Hej! Här kan du fråga mig om",
      thinking: "Tänker...",
      noSite: "Jag hittar ingen vald världsarvsplats just nu.",
      error: "Chatten kunde inte svara just nu.",
      emptyAnswer: "Jag kan tyvärr inte svara på det just nu. Prova att fråga om platsen, landet, regionen, avståndet eller hur du prenumererar.",
      temporaryError: "AI-tjänsten är tillfälligt upptagen. Försök igen om en stund.",
      closeTitle: "Stäng chatten",
      openTitle: "Öppna chatten",
      chatTitle: "Fråga om världsarvet",
      chatSubtitle: "Testa: var ligger det, vad är det, region eller avstånd.",
      placeholder: "Skriv en fråga...",
      submitLabel: "Skicka"
    },
    en: {
      greeting: "Hi! Here you can ask me about",
      thinking: "Thinking...",
      noSite: "I can't find any selected World Heritage site right now.",
      error: "The chat couldn't respond right now.",
      emptyAnswer: "I can't answer that right now. Try asking about the site, country, region, distance, or how to subscribe.",
      temporaryError: "The AI service is temporarily busy. Please try again shortly.",
      closeTitle: "Close chat",
      openTitle: "Open chat",
      chatTitle: "Ask about the World Heritage site",
      chatSubtitle: "Try: where is it, what is it, region or distance.",
      placeholder: "Type a question...",
      submitLabel: "Send"
    }
  };

  // Funktion för att hämta text 
  function getText(key) {
    return texts[language][key] || texts.sv[key];
  }

  // Lägg till ett meddelande i chatten
  function addMessage(text, sender = "bot") {
    if (!chatMessages) return;

    const message = document.createElement("div");
    message.className = `chat-message ${sender}`;
    message.textContent = text;
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Skicka en fråga till AI och få ett svar
  async function askAi(question) {
    const site = getCurrentSite();

    if (!site) {
      return getText("noSite");
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
        distanceKm: getCurrentDistanceKm(),
        language
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const isTemporaryError =
        data.code === "temporary_ai_error" ||
        response.status === 429 ||
        response.status === 503;

      throw new Error(
        isTemporaryError ? getText("temporaryError") : getText("error")
      );
    }

    return data.answer || getText("emptyAnswer");
  }

  // Återställ chatten när en ny plats väljs
  function reset(site) {
    if (!chatMessages || !site) return;

    chatMessages.innerHTML = "";
    addMessage(`${getText("greeting")} ${site.name}.`);
  }

  // Uppdatera UI texten baserat på det valda språket
  function updateUiText() {
    if (chatToggleBtn) {
      const isOpen = chatbot && !chatbot.classList.contains("collapsed");
      chatToggleBtn.setAttribute(
        "title",
        isOpen ? getText("closeTitle") : getText("openTitle")
      );
    }

    const chatTitle = document.querySelector(".chatbot-title");
    const chatSubtitle = document.querySelector(".chatbot-subtitle");
    const submitButton = document.querySelector("#chatForm button[type='submit']");

    if (chatTitle) chatTitle.textContent = getText("chatTitle");
    if (chatSubtitle) chatSubtitle.textContent = getText("chatSubtitle");
    if (chatInput) chatInput.placeholder = getText("placeholder");
    if (submitButton) submitButton.textContent = getText("submitLabel");
  }

  // Byt språk och uppdatera UI
  function setLanguage(newLanguage) {
    language = texts[newLanguage] ? newLanguage : "sv";
    updateUiText();
  }

    // Öppna eller stäng chatten
  function setOpen(isOpen) {
    if (!chatbot || !chatToggleBtn) return;

    chatbot.classList.toggle("collapsed", !isOpen);
    chatToggleBtn.setAttribute("aria-expanded", String(isOpen));
    chatToggleBtn.setAttribute(
      "title",
      isOpen ? getText("closeTitle") : getText("openTitle")
    );
    chatToggleBtn.classList.toggle("open", isOpen);

    if (isOpen && chatInput) {
      chatInput.focus();
    }
  }

  // Växla mellan öppet och stängt läge
  function toggle() {
    if (!chatbot) return;
    setOpen(chatbot.classList.contains("collapsed"));
  }

  // Hantera formulärinlämning
  async function handleSubmit(event) {
    event.preventDefault();

    if (!chatInput || !chatMessages) return;

    const question = chatInput.value.trim();
    if (!question) return;

    addMessage(question, "user");
    chatInput.value = "";
    addMessage(getText("thinking"), "bot");

    try {
      const answer = await askAi(question);
      chatMessages.lastElementChild.textContent = answer || getText("emptyAnswer");
    } catch (error) {
      console.error("Chat error:", error);
      chatMessages.lastElementChild.textContent =
        error.message || getText("error");
    }
  }

  if (chatForm) {
    chatForm.addEventListener("submit", handleSubmit);
  }

  if (chatToggleBtn) {
    chatToggleBtn.addEventListener("click", toggle);
  }

  updateUiText();

  return {
    reset,
    setOpen,
    setLanguage
  };
}
