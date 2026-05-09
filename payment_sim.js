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

.stepper {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
  color: #777;
  font-size: 0.9rem;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e7eee9;
  color: #12352f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.step.active .step-number {
  background: #0f5132;
  color: white;
}

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

.subscription-box {
  border: 1px solid #e2e8e4;
  border-radius: 16px;
  padding: 18px;
  background: #fbfdfb;
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

.notice-options,
.methods {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.notice-options label,
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

    // ger planer för demo-läge
    this.plans = [
      { id: 'onetime', name: 'Månatlig', amount: 49, currency: 'SEK' },
      { id: 'subscription', name: 'Årlig', amount: 549, currency: 'SEK' }
    ];

    // standardval för plan och betalningsmetod
    this.selectedPlan = 'onetime';
    this.method = 'card';
    this.status = 'idle';
    this.message = '';

    // formdata för betalning
    this.form = {
      email: '',
      phone: '',
      notificationType: 'sms',
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
    if (this.mode !== 'api') {
      this.render();
      this.bind();
      return;
    }
    // API-läge: hämta planer från servern
    this.status = 'loading';
    this.message = 'Hämtar planer...';
    this.render();
    this.bind();

    // Försök att hämta planer från API
    try {
      const res = await fetch(`${this.baseUrl}/plans`);
      const data = await res.json();

      this.plans = Array.isArray(data.plans) ? data.plans : data;
      this.selectedPlan = this.plans[0]?.id || '';
      this.status = 'idle';
      this.message = '';

      // Om det uppstår ett fel, sätt status till "failed" och visa ett felmeddelande
    } catch {
      this.status = 'failed';
      this.message = 'Kunde inte hämta planer';
    }

    // Rendera komponenten och binda event listeners
    this.render();
    this.bind();
  }
  // Funktion för att binda event listeners till formulärelement
  bind() {
    const plan = this.shadowRoot.querySelector('#plan');
    const pay = this.shadowRoot.querySelector('#pay');

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
    const email = this.shadowRoot.querySelector('#email');
    const phone = this.shadowRoot.querySelector('#phone');
    const cardName = this.shadowRoot.querySelector('#cardName');
    const cardNumber = this.shadowRoot.querySelector('#cardNumber');
    const expiry = this.shadowRoot.querySelector('#expiry');
    const cvc = this.shadowRoot.querySelector('#cvc');
    const notificationType = this.shadowRoot.querySelector('#notificationType');

    // Binda inputhändelser för att uppdatera formdata
    if (email) email.oninput = (e) => (this.form.email = e.target.value);
    if (phone) phone.oninput = (e) => (this.form.phone = e.target.value);
    if (cardName) cardName.oninput = (e) => (this.form.cardName = e.target.value);
    if (cardNumber) cardNumber.oninput = (e) => (this.form.cardNumber = e.target.value);
    if (expiry) expiry.oninput = (e) => (this.form.expiry = e.target.value);
    if (cvc) cvc.oninput = (e) => (this.form.cvc = e.target.value);

    this.shadowRoot.querySelectorAll('[name="notificationType"]').forEach((el) => {
      el.onchange = (e) => {
        this.form.notificationType = e.target.value;
      };
    });

    // När "Betala" knappen klickas, starta betalningsprocessen
    if (pay) {
      pay.onclick = () => this.pay();
    }
  }

  // Funktion för att validera formuläret innan betalning
  validate() {
    if (!this.selectedPlan) {
      return 'Välj en plan';
    }

    if (!this.form.email.trim()) {
      return 'Fyll i e-post';
    }

    if (!this.form.phone.trim()) {
      return 'Fyll i telefonnummer';
    }

    if (!/^\+46\d{9}$/.test(this.form.phone.trim())) {
      return 'Telefonnummer måste ha formatet +46701234567';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim())) {
      return 'Fyll i en giltig e-postadress';
    }

    if (this.method === 'card') {
      if (!this.form.cardName.trim()) {
        return 'Fyll i kortinnehavarens namn';
      }

      if (!this.form.cardNumber.trim()) {
        return 'Fyll i kortnummer';
      }

      if (!this.form.expiry.trim()) {
        return 'Fyll i utgångsdatum';
      }

      if (!this.form.cvc.trim()) {
        return 'Fyll i CVC';
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

    // Status medan betalningen hanteras
    this.status = 'processing';
    this.message = this.method === 'klarna' ? 'Förbereder Klarna...' : 'Bearbetar...';
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
            this.message = 'Klarna laddas, klicka igen när det är klart.';
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
      this.message = error.message || 'Något gick fel';
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
      const response = await fetch(`${this.baseUrl}/klarna/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: this.selectedPlan,
          customer: {
            email: this.form.email,
            phone: this.form.phone
          }
        })
      });

      const data = await response.json();
      if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || 'Kunde inte skapa Klarna-session');
      }

      this.klarnaSession = data;
      this.klarnaReady = false;
      this.status = 'idle';
      this.message = 'Laddar Klarna...';
      this.render();
      this.bind();

      await this.loadKlarna();
      await this.initKlarnaPayments();

      this.status = 'success';
      this.message = 'Klarna är redo. Klicka knappen igen för att slutföra betalningen.';
      this.klarnaReady = true;
      this.render();
      this.bind();
    } catch (error) {
      throw error;
    }
  }

  // Funktion för att ladda Klarna SDK
  async loadKlarna() {
    if (window.Klarna) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://x.klarnacdn.net/kp/lib/v1/api.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Kunde inte ladda Klarna SDK'));
      document.head.appendChild(script);
    });
  }

  // Funktion för att starta Klarna Payments
  async initKlarnaPayments() {
    return new Promise((resolve, reject) => {
      if (!window.Klarna || !window.Klarna.Payments) {
        return reject(new Error('Klarna är inte tillgänglig'));
      }

      window.Klarna.Payments.init({
        client_token: this.klarnaSession.client_token
      });

      const container = this.shadowRoot.querySelector('#klarna-container');
      if (!container) {
        return reject(new Error('Klarna-container saknas i DOM'));
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
            reject(new Error('Klarna är inte tillgängligt för denna order'));
          }
        }
      );
    });
  }

  // Funktion för att auktorisera Klarna betalning
  async authorizeKlarnaPayment() {
    if (!window.Klarna || !window.Klarna.Payments) {
      throw new Error('Klarna är inte tillgängligt');
    }

    this.status = 'processing';
    this.message = 'Auktoriserar Klarna betalning...';
    this.render();

    return new Promise((resolve, reject) => {
      window.Klarna.Payments.authorize(
        {},
        {
          billing_address: {
            email: this.form.email,
            phone: this.form.phone,
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
                throw new Error(orderData.message || 'Kunde inte skapa order');
              }

              this.status = 'success';
              this.message = 'Betalningen är godkänd!';
              this.dispatchEvent(new CustomEvent('payment-success', {
                detail: {
                  order_id: orderData.order_id,
                  method: 'klarna',
                  customer: {
                    email: this.form.email,
                    phone: this.form.phone,
                    notificationType: this.form.notificationType
                  }
                },
                bubbles: true,
                composed: true
              }));
              this.render();
              this.bind();
              resolve();
            } catch (error) {
              this.status = 'failed';
              this.message = error.message || 'Kunde inte skapa order';
              this.render();
              this.bind();
              reject(error);
            }
          } else {
            this.status = 'failed';
            this.message = (res && res.error && res.error.message) || 'Klarna nekade auktoriseringen';
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
            email: this.form.email,
            phone: this.form.phone
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
        throw new Error(result.message || 'Betalningen misslyckades');
      }
    } else {
      await new Promise((r) => setTimeout(r, 800));
      result = Math.random() > 0.3
        ? { status: 'success', message: 'Betalningen lyckades' }
        : { status: 'failed', message: 'Betalningen misslyckades' };
    }

    this.status = result.status || 'failed';
    this.message = result.message || 'Något gick fel';

    const eventName = this.status === 'success' ? 'payment-success' : 'payment-failed';
    this.dispatchEvent(new CustomEvent(eventName, {
      detail: {
        ...result,
        customer: {
          email: this.form.email,
          phone: this.form.phone,
          notificationType: this.form.notificationType
        }
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
        <input class="input" id="cardName" placeholder="Kortinnehavarens namn" value="${this.form.cardName}">
        <input class="input" id="cardNumber" placeholder="1234 1234 1234 1234" value="${this.form.cardNumber}">
        <div class="card-row">
          <input class="input" id="expiry" placeholder="MM/ÅÅ" value="${this.form.expiry}">
          <input class="input" id="cvc" placeholder="CVC" value="${this.form.cvc}">
        </div>
      `;
    }

    return '';
  }
  // Funktion för att rendera hela komponenten
  render() {
    const options = this.plans.map((p) => `
      <option value="${p.id}" ${this.selectedPlan === p.id ? 'selected' : ''}>
        ${p.name} - ${p.amount} ${p.currency}
      </option>
    `).join('');

    this.shadowRoot.innerHTML = `
      <style>${style}</style>

      <div class="card">

        <div class="stepper">
          <div class="step active">
            <span class="step-number">1</span>
            <span>Prenumerera</span>
          </div>
          <span>—</span>
          <div class="step">
            <span class="step-number">2</span>
            <span>Betalning</span>
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
          <p>Få SMS när du är nära ett UNESCO-världsarv. Bekräftelse skickas till din e-post.</p>

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
              <input type="radio" name="notificationType" value="sms" ${this.form.notificationType === 'sms' ? 'checked' : ''}>
              SMS
            </label>

            <label>
              <input type="radio" name="notificationType" value="email" ${this.form.notificationType === 'email' ? 'checked' : ''}>
              E-post
            </label>

            <label>
              <input type="radio" name="notificationType" value="both" ${this.form.notificationType === 'both' ? 'checked' : ''}>
              SMS & E-post
            </label>
          </div>
        </div>

        <div class="section">
          <h2 class="title">2. Betalning</h2>

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
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Visa_Inc._logo_%282021%E2%80%93present%29.svg/960px-Visa_Inc._logo_%282021%E2%80%93present%29.svg.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail" alt="Visa" width="40" /><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Mastercard_2019_logo.svg/120px-Mastercard_2019_logo.svg.png" alt="Mastercard" width="40" />
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
                ? 'Slutför Klarna'
                : 'Betala med Klarna'
              : 'Betala'}
        </button>

        <div class="safe-text">Säker betalning med kryptering</div>

        <div class="status ${this.status === 'success' ? 'success' : 'error'}">
          ${this.message}
        </div>
      </div>
    </div>
  `;
  }
}
// Registrera custom elementet om det inte redan är registrerat
if (!customElements.get('payment-simulator')) {
  customElements.define('payment-simulator', PaymentSimulator);
}