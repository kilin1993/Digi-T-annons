import nodemailer from "nodemailer";

import dotenv from "dotenv";
dotenv.config();

const EXTERNAL_NOTIFICATION_ENDPOINT =
  process.env.EXTERNAL_NOTIFICATION_ENDPOINT;

const cooldownMap = new Map();
const COOLDOWN_MS = 60 * 60 * 1000;

function isValidSmsNumber(to) {
  return /^\+46\d{9}$/.test(to);
}

function isValidEmail(to) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);
}

function getCooldownKey({ channel, to, user_id, site_id }) {
  return `${channel}:${user_id || to}:${site_id || "general"}`;
}

function isInCooldown({ channel, to, user_id, site_id }) {
  const key = getCooldownKey({ channel, to, user_id, site_id });
  const lastSent = cooldownMap.get(key);
  const now = Date.now();

  return lastSent && now - lastSent < COOLDOWN_MS;
}

function saveCooldown({ channel, to, user_id, site_id }) {
  const key = getCooldownKey({ channel, to, user_id, site_id });
  cooldownMap.set(key, Date.now());
}

async function sendSms({ to, message }) {
  const username = process.env.HELLOSMS_USERNAME;
  const password = process.env.HELLOSMS_PASSWORD;
  const sender = process.env.HELLOSMS_SENDER || "ConsultX";
  const testMode = process.env.HELLOSMS_TEST_MODE !== "false";

  if (!username || !password) {
    throw new Error("Missing HelloSMS credentials");
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  const response = await fetch("https://api.hellosms.se/v1/sms/send/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`
    },
    body: JSON.stringify({
      to,
      message,
      from: sender,
      testMode
    })
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error("HelloSMS status:", response.status);
    console.error("HelloSMS response:", responseText);
    throw new Error("sms_failed");
  }

  console.log("HelloSMS success:", responseText);
  return true;
}

async function sendEmail({ to, subject, message }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 2525),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: subject || "UNESCO info",
    text: message
  });

  return true;
}

export async function sendNotification(data) {
  const { channel, to, message, subject, user_id, site_id } = data;

  if (EXTERNAL_NOTIFICATION_ENDPOINT) {
    const response = await fetch(EXTERNAL_NOTIFICATION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    return {
      status: response.status,
      body: await response.json()
    };
  }

  if (!["sms", "email"].includes(channel)) {
    return {
      status: 400,
      body: { success: false, error: "invalid_type" }
    };
  }

  if (!to || !message) {
    return {
      status: 400,
      body: { success: false, error: "invalid_recipient" }
    };
  }

  if (channel === "sms" && !isValidSmsNumber(to)) {
    return {
      status: 400,
      body: { success: false, error: "invalid_recipient" }
    };
  }

  if (channel === "email" && !isValidEmail(to)) {
    return {
      status: 400,
      body: { success: false, error: "invalid_recipient" }
    };
  }

  if (isInCooldown({ channel, to, user_id, site_id })) {
    return {
      status: 429,
      body: { success: false, error: "cooldown" }
    };
  }

  try {
    if (channel === "sms") {
      await sendSms({ to, message });
    }

    if (channel === "email") {
      await sendEmail({ to, subject, message });
    }

    saveCooldown({ channel, to, user_id, site_id });

    return {
      status: 200,
      body: { success: true, channel }
    };
  } catch (error) {
    console.error("Notification error:", error);

    return {
      status: 500,
      body: { success: false, error: "server_error" }
    };
  }
}