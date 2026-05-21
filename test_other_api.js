const BASE_URL = "https://DIN-ENDPOINT.trycloudflare.com";

async function testSms() {
  try {
    const response = await fetch(
      `${BASE_URL}/api/notification/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          channel: "sms",
          to: "+46701234567",
          message: "Test-SMS från extern klient",
          user_id: "1",
          site_id: "unesco-test"
        })
      }
    );

    const data = await response.json();

    console.log("SMS-svar:");
    console.log(data);

  } catch (error) {
    console.error("SMS-fel:", error);
  }
}

async function testEmail() {
  try {
    const response = await fetch(
      `${BASE_URL}/api/notification/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          channel: "email",
          to: "dinmail@test.se",
          subject: "Testmail",
          message: "Test-email från extern klient",
          user_id: "1",
          site_id: "unesco-test"
        })
      }
    );

    const data = await response.json();

    console.log("Email-svar:");
    console.log(data);

  } catch (error) {
    console.error("Email-fel:", error);
  }
}

async function runTests() {
  await testSms();
  await testEmail();
}

runTests();