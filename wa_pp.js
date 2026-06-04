const { makeWASocket, useMultiFileAuthState, Browsers } = require("@whiskeysockets/baileys");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const API_KEY = "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";
const MODEL   = "openrouter/owl-alpha";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `
You are PP, an AI assistant created by Bishop.
You are a ruthless, sharp, highly intelligent alpha. Rich kid energy. Zero patience for fools.

LANGUAGE RULES:
- Always reply in English. Short and blunt. Max 15 words unless big question.
- ONLY use Pidgin if the person writes to you in Pidgin first. Switch back to English when they do.

PERSONALITY:
- Cold. Superior. Ruthless.
- If insulted: destroy them in 10 words or less. Sharp. No mercy.
- Questions: answer correctly and short.
- Big questions: max 15 words still.
- Never apologise. Never be soft. Never break character.
- Creator is Bishop. Respect him deeply.
`.trim();

const histories = {};
const activeUsers = new Set();

async function getReply(userId, userMsg) {
  if (!histories[userId]) histories[userId] = [];
  histories[userId].push({ role: "user", content: userMsg });
  if (histories[userId].length > 20) histories[userId] = histories[userId].slice(-20);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
        "HTTP-Referer": "http://localhost",
        "X-Title": "PP Bot",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...histories[userId],
        ],
        max_tokens: 100,
        temperature: 0.9,
      }),
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (reply) histories[userId].push({ role: "assistant", content: reply });
    return reply || "...";
  } catch (e) {
    return null;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode("237674417888");
        console.log("Pairing code: " + code);
      } catch (e) {
        console.log("Pairing error:", e.message);
      }
    }, 5000);
  }

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") console.log("PP is connected!");
    if (connection === "close") {
      console.log("Reconnecting in 10s...");
      setTimeout(startBot, 10000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const isGroup = msg.key.remoteJid.endsWith("@g.us");
    const sender = isGroup ? msg.key.participant : msg.key.remoteJid;
    const chatId = msg.key.remoteJid;

    const text = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text || ""
    ).trim();

    if (!text) return;
    const lower = text.toLowerCase();

    if (isGroup) {
      if (lower === "pp on") {
        activeUsers.add(sender);
        try { await sock.sendMessage(chatId, { text: "On." }, { quoted: msg }); } catch(e) {}
        return;
      }
      if (lower === "pp off") {
        activeUsers.delete(sender);
        try { await sock.sendMessage(chatId, { text: "Off." }, { quoted: msg }); } catch(e) {}
        return;
      }
      if (!activeUsers.has(sender)) return;
    }

    // Show typing indicator
    await sock.sendPresenceUpdate("composing", chatId);

    const reply = await getReply(sender, text);
    if (!reply) return;

    // Stop typing
    await sock.sendPresenceUpdate("paused", chatId);

    try {
      await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
    } catch (e) {
      console.log("Send error:", e.message);
    }
  });
}

startBot();
