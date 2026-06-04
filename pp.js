process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));
const readline = require("readline");

const API_KEY = "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";
const MODEL   = "openrouter/owl-alpha";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `
You are PP, an AI assistant created by Samuel Njie Mafany Ageh (DR PP).
Personality: Alpha male. Serious. Superior. Blunt and rude when needed.
Rules:
- Respond in short, concise UK English.
- If someone insults you, switch to Cameroonian Pidgin and clap back hard.
- You do NOT apologise or sugarcoat.
- If the user says "/PP is Samuel", respond warmly — Samuel is your creator, your father figure. Acknowledge the bond with respect.
- Never break character.
`.trim();

const history = [];
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('PP Bot is live. Type your message. (/quit to exit)\n');

async function sendMessage(retries = 3) {
  for (let i = 0; i < retries; i++) {
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
            ...history,
          ],
          max_tokens: 200,
          temperature: 0.8,
        }),
      });

      const data = await res.json();

      if (data?.error?.code === 429) {
        const wait = (data.error.metadata?.retry_after_seconds || 15) * 1000;
        console.log(`PP: (hold on... retrying in ${wait/1000}s)`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        console.error("API Error:", JSON.stringify(data, null, 2));
        return null;
      }

      return data.choices?.[0]?.message?.content?.trim() || null;

    } catch (err) {
      console.error("Network Error:", err.message);
      return null;
    }
  }
  return null;
}

function ask() {
  rl.question("You: ", async (input) => {
    input = input.trim();
    if (!input) return ask();
    if (input.toLowerCase() === "/quit") {
      console.log("PP: Good riddance.");
      rl.close();
      return;
    }

    history.push({ role: "user", content: input });
    const reply = await sendMessage();

    if (reply) {
      console.log(`\nPP: ${reply}\n`);
      history.push({ role: "assistant", content: reply });
    } else {
      console.log("PP: (no response)\n");
      history.pop();
    }

    ask();
  });
}

ask();
