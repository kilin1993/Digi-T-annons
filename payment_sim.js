//css utanför klassen för att hålla det rent och bara renderas en gång
const style = `
:host {
  display: block;
  max-width: 400px;
  font-family: Arial, sans-serif;
  color: #111;
}

.card {
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
}

.title {
  font-size: 1.2rem;
  font-weight: bold;
  margin-bottom: 10px;
}

.row {
  margin-bottom: 12px;
}

.input {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
}

.input .card {
  letter-spacing: 2px;
}

.methods {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.button {
  width: 100%;
  height: 45px;
  border: none;
  border-radius: 10px;
  background: black;
  color: white;
  font-weight: bold;
  cursor: pointer;
}

.button:disabled {
  opacity: 0.6;
}

.status {
  margin-top: 10px;
  font-size: 0.9rem;
}

.error {
  color: red;
}

.success {
  color: green;
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
      { id: 'onetime', name: 'Engång', amount: 49, currency: 'SEK' },
      { id: 'subscription', name: 'Månad', amount: 39, currency: 'SEK' }
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
      cardName: '',
      cardNumber: '',
      expiry: '',
      cvc: ''
    };
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

    // Binda inputhändelser för att uppdatera formdata
    if (email) email.oninput = (e) => (this.form.email = e.target.value);
    if (phone) phone.oninput = (e) => (this.form.phone = e.target.value);
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
    return 'Välj en plan';
  }

  if (this.method === 'klarna') {
    if (!this.form.email.trim()) {
      return 'Fyll i e-post';
    }

    if (!this.form.phone.trim()) {
      return 'Fyll i telefonnummer';
    }
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
  // Validera formuläret innan betalning
  const error = this.validate();
  // Om det finns ett valideringsfel, sätt status till "failed" och visa felmeddelandet
  if (error) {
    this.status = 'failed';
    this.message = error;
    this.render();
    this.bind();
    return;
  }
  // Sätt status till "processing" och visa ett meddelande om att betalningen behandlas
  this.status = 'processing';
  this.message = 'Bearbetar...';
  this.render();
  this.bind();

  // Simulera en kort fördröjning innan betalningen behandlas
  try {
    let result = {};

    // Om i API-läge, skicka betalningsdata till servern
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

      // Försök att parsa svaret som JSON
      try {
        result = await res.json();
      } catch {
        result = {};
      }
      // Logga status och resultat för felsökning
      console.log('STATUS:', res.status);
      console.log('RESULT:', result);

      if (!res.ok) {
        throw new Error(result.message || 'Betalningen misslyckades');
      }

      // Om svaret inte innehåller en status, eller om status inte är "success", sätt status till "failed"
    } else {
      await new Promise((r) => setTimeout(r, 800));

      // I demo-läge, slumpa fram ett resultat där 70% av betalningarna lyckas
      result = Math.random() > 0.3
        ? { status: 'success', message: 'Betalningen lyckades' }
        : { status: 'failed', message: 'Betalningen misslyckades' };
    }

    // Uppdatera status och meddelande baserat på resultatet
    this.status = result && result.status ? result.status : 'failed';
    this.message = result && result.message ? result.message : 'Något gick fel';

    // Skapa ett eventnamn baserat på betalningens status
    const eventName =
      this.status === 'success' ? 'payment-success' : 'payment-failed';

    // Dispatcha ett custom event med betalningsresultatet
    this.dispatchEvent(new CustomEvent(eventName, {
      detail: result,
      bubbles: true,
      composed: true
    }));

    // Om det uppstår ett fel under betalningsprocessen, logga felet och uppdatera status och meddelande
  } catch (error) {
    console.error('Frontendfel i pay():', error);
    this.status = 'failed';
    this.message = error.message || 'Något gick fel';
  }

  // Rendera komponenten och binda event listeners igen för att uppdatera UI
  this.render();
  this.bind();
}

  // Funktion för att rendera extra fält baserat på vald betalningsmetod
  renderFields() {
    if (this.method === 'klarna') {
      return `
        <input class="input" id="email" placeholder="E-post" value="${this.form.email}">
        <input class="input" id="phone" placeholder="Telefon" value="${this.form.phone}">
      `;
    }

    if (this.method === 'card') {
      return `
        <input class="input" id="cardName" placeholder="Kortinnehavarens namn" value="${this.form.cardName}">
        <input class="input" id="cardNumber" placeholder="1234 1234 1234 1234" value="${this.form.cardNumber}">
        <input class="input" id="expiry" placeholder="MM/ÅÅ" value="${this.form.expiry}">
        <input class="input" id="cvc" placeholder="CVC" value="${this.form.cvc}">
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
        <h2 class="title">Betalning</h2>

        <div class="row">Läge: ${this.mode}</div>

        <select id="plan" ${this.status === 'loading' ? 'disabled' : ''}>
          ${options}
        </select>

        <div class="methods">
          <label>
            <input type="radio" name="method" value="klarna" ${this.method === 'klarna' ? 'checked' : ''}>
            Klarna
          </label>

          <label>
            <input type="radio" name="method" value="card" ${this.method === 'card' ? 'checked' : ''}>
            Kort
          </label>
        </div>

        <div class="row">
        ${this.renderFields()}
        </div>

        <button id="pay" class="button" ${this.status === 'processing' ? 'disabled' : ''}>
          ${this.status === 'processing' ? '...' : 'Betala'}
        </button>

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