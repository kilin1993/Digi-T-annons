import { t } from "./i18n.js";

//css utanför klassen för att hålla det rent och bara renderas en gång
const style = `
* {
  box-sizing: border-box;
}
:host {
  display: block;
  max-width: 560px;
  font-family: Arial, sans-serif;
  color: #12352f;
}

.card {
  border: 1px solid #e2e8e4;
  border-radius: 18px;
  padding: 26px;
  background: #fff;
  box-shadow: 0 12px 35px rgba(0,0,0,0.08);
}
/* .step.active .step-number {
  background: #0f5132;
  color: white;
} */

.title {
  font-size: 1.35rem;
  font-weight: 800;
  margin: 18px 0 14px;
  color: #12352f;
}

.section {
  border-top: 1px solid #e5e7eb;
  padding-top: 18px;
  margin-top: 18px;
}


.input,
.select {
  width: 100%;
  box-sizing: border-box;
  height: 48px;
  padding: 0 14px;
  border: 1px solid #d7ddd9;
  border-radius: 12px;
  background: #fff;
  font-size: 0.95rem;
  margin-bottom: 10px;
}

.input:focus,
.select:focus {
  outline: none;
  border-color: #0f5132;
  box-shadow: 0 0 0 3px rgba(15,81,50,0.12);
}

.methods {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0;
}


.methods label {
  border: 1px solid #d7ddd9;
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  cursor: pointer;
  font-size: 0.95rem;
}

.row {
  margin-bottom: 12px;
}

.card-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.button {
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 12px;
  background: #0f5132;
  color: white;
  font-weight: 800;
  cursor: pointer;
  font-size: 1rem;
  margin-top: 8px;
  box-shadow: 0 8px 18px rgba(15,81,50,0.22);
}

.button:disabled {
  opacity: 0.6;
}

.status {
  margin-top: 12px;
  font-size: 0.9rem;
}

.error {
  color: #d12b2b;
}

.success {
  color: #0f5132;
}

.safe-text {
  margin-top: 12px;
  font-size: 0.8rem;
  color: #64748b;
  text-align: center;
}
`;

// Payment Simulator Web Component
class PaymentSimulator extends HTMLElement {

  // consturctor som ger initiala värden
  constructor() {

    // Anropa super() för att initiera HTMLElement
    super();
    this.attachShadow({ mode: 'open' });

    //Språk
    this.language =
      document.documentElement.lang?.slice(0, 2).toLowerCase() === "en"
        ? "en"
        : "sv";

    // ger planer för demo-läge
    this.plans = [
      { id: 'onetime', nameKey: 'monthly', amount: 49, currency: 'SEK' },
      { id: 'subscription', nameKey: 'yearly', amount: 549, currency: 'SEK' }
    ];

    // standardval för plan och betalningsmetod
    this.selectedPlan = 'monthly';
    this.method = 'card';
    this.status = 'idle';
    this.message = '';

    
    this.subscription = {
      email: "",
      phone: "",
      notificationType: "sms"
    };
    // formdata för betalning
    this.form = {
      cardName: '',
      cardNumber: '',
      expiry: '',
      cvc: ''
    };

    this.klarnaSession = null;
    this.klarnaReady = false;
  }
  // När elementet läggs till i DOM:en, ladda planer och rendera
  connectedCallback() {
    this.loadPlans();
  }

  // Getter för att hämta "mode" attributet, default till "demo"
  get mode() {
    return this.getAttribute('mode') || 'demo';
  }

  // Getter för att hämta "base-url" attributet, default till tom sträng
  get baseUrl() {
    return this.getAttribute('base-url') || '';
  }

  // Funktion för att ladda planer från API
async loadPlans() {
  const customerConfig = window.UNESCO_AD_CONFIG;

  if (customerConfig?.pricing) {
    this.plans = Object.values(customerConfig.pricing);
    this.selectedPlan = this.plans[0]?.id || '';
    this.render();
    this.bind();
    return;
  }

  if (this.mode !== 'api') {
    this.render();
    this.bind();
    return;
  }

  this.status = 'loading';
  this.message = t("loadingPlans", this.language);
  this.render();
  this.bind();

  try {
    const res = await fetch(`${this.baseUrl}/plans`);
    const data = await res.json();

    this.plans = Array.isArray(data.plans) ? data.plans : data;
    this.selectedPlan = this.plans[0]?.id || '';
    this.status = 'idle';
    this.message = '';
  } catch {
    this.status = 'failed';
    this.message = t("paymentError", this.language);
  }

  this.render();
  this.bind();
}

  // Funktion för att binda event listeners till formulärelement
  bind() {
    const plan = this.shadowRoot.querySelector('#plan');
    const pay = this.shadowRoot.querySelector('#pay');
    // Prenumerationskomponenten
    const subscriptionForm = this.shadowRoot.querySelector("subscription-form");

    if (subscriptionForm) {
      subscriptionForm.setData(this.subscription);
    
      subscriptionForm.addEventListener("subscription-change", (event) => {
        this.subscription = event.detail;
      });
    }
    // När en plan väljs, uppdatera selectedPlan
    if (plan) {
      plan.onchange = (e) => {
        this.selectedPlan = e.target.value;
        this.render();
        this.bind();
      };
    }

    // När betalningsmetod ändras, uppdatera method och rendera om
    this.shadowRoot.querySelectorAll('[name="method"]').forEach((el) => {
      el.onchange = (e) => {
        this.method = e.target.value;
        this.render();
        this.bind();
      };
    });

    // Hämta inputfält för kund- och kortinformation
    const cardName = this.shadowRoot.querySelector('#cardName');
    const cardNumber = this.shadowRoot.querySelector('#cardNumber');
    const expiry = this.shadowRoot.querySelector('#expiry');
    const cvc = this.shadowRoot.querySelector('#cvc');

    // Binda inputhändelser för att uppdatera formdata
    if (cardName) cardName.oninput = (e) => (this.form.cardName = e.target.value);
    if (cardNumber) cardNumber.oninput = (e) => (this.form.cardNumber = e.target.value);
    if (expiry) expiry.oninput = (e) => (this.form.expiry = e.target.value);
    if (cvc) cvc.oninput = (e) => (this.form.cvc = e.target.value);


    // När "Betala" knappen klickas, starta betalningsprocessen
    if (pay) {
      pay.onclick = () => this.pay();
    }
  }

  // Funktion för att validera formuläret innan betalning
  validate() {
    if (!this.selectedPlan) {
      return t("choosePlan", this.language);
    }

    const subscriptionForm = this.shadowRoot.querySelector("subscription-form");

    if (!subscriptionForm || !subscriptionForm.isValid()) {
      return subscriptionForm?.error || t("subscriptionDetailsRequired", this.language);
    }

    if (this.method === 'card') {
      if (!this.form.cardName.trim()) {
        return t("cardHolderRequired", this.language);
      }

      if (!this.form.cardNumber.trim()) {
        return t("cardNumberRequired", this.language);
      }

      if (!this.form.expiry.trim()) {
        return t("expiryRequired", this.language);
      }

      if (!this.form.cvc.trim()) {
        return t("cvcRequired", this.language);
      }
    }

    return '';
  }

  // Funktion för att hantera betalning
  async pay() {
    const error = this.validate();
    if (error) {
      this.status = 'failed';
      this.message = error;
      this.render();
      this.bind();
      return;
    }

    const subscriptionForm = this.shadowRoot.querySelector("subscription-form");

    if (subscriptionForm) {
      this.subscription = subscriptionForm.getData();
    }

    if (this.method === 'klarna' && this.klarnaReady) {
      await this.authorizeKlarnaPayment();
      this.render();
      this.bind();
      return;
    }

    // Status medan betalningen hanteras
    this.status = 'processing';
    this.message = this.method === 'klarna'
      ? t("preparingKlarna", this.language)
      : t("processing", this.language);

    this.render();
    this.bind();

    try {
      if (this.method === 'klarna') {
        if (this.mode === 'api') {
          if (!this.klarnaSession) {
            await this.handleKlarnaPayment();
          } else if (this.klarnaReady) {
            await this.authorizeKlarnaPayment();
          } else {
            this.status = 'idle';
            this.message = t("klarnaLoading", this.language);
            this.render();
            this.bind();
            return;
          }
        } else {
          await this.handleKlarnaPayment();
        }
      } else {
        await this.handleCardPayment();
      }
    } catch (error) {
      console.error('Frontendfel i pay():', error);
      this.status = 'failed';
      this.message = error.message || t("paymentError", this.language);
      this.render();
      this.bind();
      return;
    }

    this.render();
    this.bind();
  }

  // Funktion för att hantera Klarna betalning
  async handleKlarnaPayment() {
    try {
      console.log("Klarna customer:", this.subscription);

      const response = await fetch(`${this.baseUrl}/klarna/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: this.selectedPlan,
          customer: {
            email: this.subscription.email,
            phone: this.subscription.phone
          }
        })
      });

      const data = await response.json();

      if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || t("paymentError", this.language));
      }

      this.klarnaSession = data;
      this.klarnaReady = false;
      this.status = 'idle';
      this.message = t("klarnaLoading", this.language);
      this.render();
      this.bind();

      await this.loadKlarna();
      await this.initKlarnaPayments();

      this.status = 'success';
      this.message = t("klarnaReady", this.language);
      this.klarnaReady = true;
      this.updateStatusUi();

    } catch (error) {
      throw error;
    }
  }

  // Funktion för att ladda Klarna SDK
  updateStatusUi() {
    const pay = this.shadowRoot.querySelector('#pay');
    const status = this.shadowRoot.querySelector('.status');

    if (pay) {
      pay.disabled = this.status === 'processing';
      pay.textContent = this.method === 'klarna'
        ? this.klarnaReady
          ? t("completeKlarna", this.language)
          : t("payWithKlarna", this.language)
        : t("pay", this.language);
    }

    if (status) {
      status.className = `status ${this.status === 'success' ? 'success' : 'error'}`;
      status.textContent = this.message;
    }
  }

  async loadKlarna() {
    if (window.Klarna) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://x.klarnacdn.net/kp/lib/v1/api.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(t("paymentError", this.language)));
      document.head.appendChild(script);
    });
  }

  // Funktion för att starta Klarna Payments
  async initKlarnaPayments() {
    return new Promise((resolve, reject) => {
      if (!window.Klarna || !window.Klarna.Payments) {
        return reject(new Error(t("paymentError", this.language)));
      }

      window.Klarna.Payments.init({
        client_token: this.klarnaSession.client_token
      });

      const container = this.shadowRoot.querySelector('#klarna-container');

      if (!container) {
        return reject(new Error(t("paymentError", this.language)));
      }

      window.Klarna.Payments.load(
        {
          container
        },
        {},
        (res) => {
          if (res && res.show_form) {
            resolve();
          } else {
            reject(new Error(t("paymentError", this.language)));
          }
        }
      );
    });
  }

  // Funktion för att auktorisera Klarna betalning
  async authorizeKlarnaPayment() {
    if (!window.Klarna || !window.Klarna.Payments) {
      throw new Error(t("paymentError", this.language));
    }

    this.status = 'processing';
    this.message = t("authorizingKlarna", this.language);

    return new Promise((resolve, reject) => {
      window.Klarna.Payments.authorize(
        {},
        {
          billing_address: {
            email: this.subscription.email,
            phone: this.subscription.phone,
            country: 'SE',
            given_name: 'Test',
            family_name: 'Kund',
            street_address: 'Demo gatan 1',
            postal_code: '11122',
            city: 'Stockholm'
          }
        },
        async (res) => {
          if (res && res.approved && res.authorization_token) {
            try {
              const orderResponse = await fetch(`${this.baseUrl}/klarna/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  authorization_token: res.authorization_token,
                  planId: this.selectedPlan
                })
              });

              const orderData = await orderResponse.json();

              if (!orderResponse.ok || orderData.status !== 'success') {
                throw new Error(orderData.message || t("paymentError", this.language));
              }

              const customerData = { ...this.subscription };

              this.status = 'success';
              this.message = t("paymentApproved", this.language);

              this.subscription = {
                email: "",
                phone: "",
                notificationType: "sms"
              };

              this.dispatchEvent(new CustomEvent('payment-success', {
                detail: {
                  order_id: orderData.order_id,
                  method: 'klarna',
                  customer: customerData
                },
                bubbles: true,
                composed: true
              }));

              this.render();
              this.bind();
              resolve();

            } catch (error) {
              this.status = 'failed';
              this.message = error.message || t("paymentError", this.language);
              this.render();
              this.bind();
              reject(error);
            }
          } else {
            this.status = 'failed';
            this.message = (res && res.error && res.error.message) || t("paymentFailed", this.language);
            this.render();
            this.bind();
            reject(new Error(this.message));
          }
        }
      );
    });
  }

  // Funktion för att hantera kortbetalning
  async handleCardPayment() {
    let result = {};

    if (this.mode === 'api') {
      const res = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: this.selectedPlan,
          method: this.method,
          customer: {
            email: this.subscription.email,
            phone: this.subscription.phone
          },
          card: {
            cardName: this.form.cardName,
            cardNumber: this.form.cardNumber,
            expiry: this.form.expiry,
            cvc: this.form.cvc
          }
        })
      });

      try {
        result = await res.json();
      } catch {
        result = {};
      }

      if (!res.ok) {
        throw new Error(t("paymentFailed", this.language));
      }
    } else {
      await new Promise((r) => setTimeout(r, 800));

      result = Math.random() > 0.3
        ? { status: 'success', message: t("paymentSuccess", this.language) }
        : { status: 'failed', message: t("paymentFailed", this.language) };
    }

    this.status = result.status || 'failed';
    this.message = result.message || t("paymentError", this.language);

    const customerData = { ...this.subscription };

    if (this.status === 'success') {
      this.subscription = {
        email: "",
        phone: "",
        notificationType: "sms"
      };
    }

    const eventName = this.status === 'success' ? 'payment-success' : 'payment-failed';

    this.dispatchEvent(new CustomEvent(eventName, {
      detail: {
        ...result,
        customer: customerData
      },
      bubbles: true,
      composed: true
    }));
  }

  // Funktion för att rendera extra fält baserat på vald betalningsmetod
renderFields() {
  if (this.method === 'klarna') {
    return `
      ${this.klarnaSession ? `
        <div id="klarna-container" style="margin-top: 16px;"></div>
      ` : ''}
    `;
  }

  if (this.method === 'card') {
    return `
      <input class="input" id="cardName" placeholder="${t("cardHolderName", this.language)}" value="${this.form.cardName}">
      <input class="input" id="cardNumber" placeholder="1234 1234 1234 1234" value="${this.form.cardNumber}">
      <div class="card-row">
        <input class="input" id="expiry" placeholder="${t("expiry", this.language)}" value="${this.form.expiry}">
        <input class="input" id="cvc" placeholder="CVC" value="${this.form.cvc}">
      </div>
    `;
  }

  return '';
}

  // Funktion för att rendera hela komponenten
  render() {
    this.language =
      document.documentElement.lang?.slice(0, 2).toLowerCase() === "en"
        ? "en"
        : "sv";

    const options = this.plans.map((p) => `
      <option value="${p.id}" ${this.selectedPlan === p.id ? 'selected' : ''}>
        ${t(p.nameKey, this.language)} - ${p.amount} ${p.currency}
      </option>
    `).join('');

    this.shadowRoot.innerHTML = `
      <style>${style}</style>

      <div class="card">

        <subscription-form></subscription-form>

        <div class="section">
          <h2 class="title">2. ${t("payment", this.language)}</h2>

          <select id="plan" class="select" ${this.status === 'loading' ? 'disabled' : ''}>
            ${options}
          </select>

        <div class="methods">
         <label>
            <input type="radio" name="method" value="klarna" ${this.method === 'klarna' ? 'checked' : ''}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Klarna_Logo_black.svg/960px-Klarna_Logo_black.svg.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail" alt="Klarna" width="40" />
          </label>

          <label>
            <input type="radio" name="method" value="card" ${this.method === 'card' ? 'checked' : ''}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Visa_Inc._logo_%282021%E2%80%93present%29.svg/960px-Visa_Inc._logo_%282021%E2%80%93present%29.svg.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail" alt="Visa" width="40" />
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Mastercard_2019_logo.svg/120px-Mastercard_2019_logo.svg.png" alt="Mastercard" width="40" />
          </label>
        </div>

        <div class="row">
          ${this.renderFields()}
        </div>

        <button id="pay" class="button" ${this.status === 'processing' ? 'disabled' : ''}>
          ${this.status === 'processing'
            ? '...'
            : this.method === 'klarna'
              ? this.klarnaReady
                ? t("completeKlarna", this.language)
                : t("payWithKlarna", this.language)
              : t("pay", this.language)}
        </button>

        <div class="safe-text">${t("securePayment", this.language)}</div>

        <div class="status ${this.status === 'success' ? 'success' : 'error'}">
          ${this.message}
        </div>
      </div>
    `;
  }
}

// Registrera custom elementet om det inte redan är registrerat
if (!customElements.get('payment-simulator')) {
  customElements.define('payment-simulator', PaymentSimulator);
}
