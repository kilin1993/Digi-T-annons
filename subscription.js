const subscriptionStyle = `
* {
  box-sizing: border-box;
}

:host {
  display: block;
  font-family: Arial, sans-serif;
  color: #12352f;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  color: #777;
  font-size: 0.82rem;
  white-space: nowrap;
}

.step {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e7eee9;
  color: #12352f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.title {
  font-size: 1.35rem;
  font-weight: 800;
  margin: 18px 0 14px;
}

.subscription-box {
  border: 1px solid #e2e8e4;
  border-radius: 16px;
  padding: 18px;
  background: #fbfdfb;
  margin-bottom: 18px;
}

.subscription-box h3 {
  margin: 0 0 6px;
  font-size: 1.05rem;
}

.subscription-box p {
  margin: 0 0 14px;
  font-size: 0.9rem;
  color: #555;
}

.input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid #d7ddd9;
  border-radius: 12px;
  background: #fff;
  font-size: 0.95rem;
  margin-bottom: 10px;
}

.notice-options {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.notice-options label {
  border: 1px solid #d7ddd9;
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  cursor: pointer;
}

.error {
  color: #d12b2b;
  margin-top: 10px;
  font-size: 0.9rem;
}
`;

class SubscriptionForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.form = {
      email: "",
      phone: "",
      notificationType: "sms"
    };

    this.error = "";
  }

  connectedCallback() {
    this.render();
    this.bind();
  }

  getData() {
    return { ...this.form };
  }

  setData(data) {
    this.form = {
      email: data.email || "",
      phone: data.phone || "",
      notificationType: data.notificationType || "sms"
    };
  
    this.render();
    this.bind();
  }

  validate() {
    if (!this.form.email.trim()) return "Fyll i e-post";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim())) {
      return "Fyll i en giltig e-postadress";
    }

    if (!this.form.phone.trim()) return "Fyll i telefonnummer";

    if (!/^\+46\d{9}$/.test(this.form.phone.trim())) {
      return "Telefonnummer måste ha formatet +46701234567";
    }

    return "";
  }

  isValid() {
    this.error = this.validate();
    this.render();
    this.bind();
    return !this.error;
  }

  bind() {
    const email = this.shadowRoot.querySelector("#email");
    const phone = this.shadowRoot.querySelector("#phone");

    if (email) {
      email.oninput = (e) => {
        this.form.email = e.target.value;
        this.emitChange();
      };
    }

    if (phone) {
      phone.oninput = (e) => {
        this.form.phone = e.target.value;
        this.emitChange();
      };
    }

    this.shadowRoot.querySelectorAll('[name="notificationType"]').forEach((el) => {
      el.onchange = (e) => {
        this.form.notificationType = e.target.value;
        this.emitChange();
      };
    });
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent("subscription-change", {
      detail: this.getData(),
      bubbles: true,
      composed: true
    }));
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${subscriptionStyle}</style>

      <div class="stepper">
        <div class="step">
          <span class="step-number">1</span>
          <span>Prenumerera</span>
        </div>
        <span>—</span>
        <div class="step">
          <span class="step-number">2</span>
          <span>Betala</span>
        </div>
        <span>—</span>
        <div class="step">
          <span class="step-number">3</span>
          <span>Klart</span>
        </div>
      </div>

      <h2 class="title">1. Prenumeration</h2>

      <div class="subscription-box">
        <h3>Registrera dig</h3>
        <p>Ingen bindningstid. Bekräftelse skickas till din e-post.</p>

        <input
          class="input"
          id="email"
          type="email"
          placeholder="Din e-postadress"
          value="${this.form.email}"
        >

        <input
          class="input"
          id="phone"
          type="tel"
          placeholder="Ditt mobilnummer, t.ex. +46701234567"
          value="${this.form.phone}"
        >

        <div class="notice-options">
          <label>
            <input type="radio" name="notificationType" value="sms" ${this.form.notificationType === "sms" ? "checked" : ""}>
            SMS
          </label>

          <label>
            <input type="radio" name="notificationType" value="email" ${this.form.notificationType === "email" ? "checked" : ""}>
            E-post
          </label>

          <label>
            <input type="radio" name="notificationType" value="both" ${this.form.notificationType === "both" ? "checked" : ""}>
            SMS & E-post
          </label>
        </div>

        ${this.error ? `<div class="error">${this.error}</div>` : ""}
      </div>
    `;
  }
}

if (!customElements.get("subscription-form")) {
  customElements.define("subscription-form", SubscriptionForm);
}