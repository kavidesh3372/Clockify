// server.js
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

import qrcode from "qrcode-terminal";
import fetch from "node-fetch";
import express from "express";
import dotenv from "dotenv";

dotenv.config(); // Load .env variables

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIG ---
const CLOCKIFY_API_KEY = process.env.CLOCKIFY_API_KEY;
const WORKSPACE_ID = process.env.WORKSPACE_ID;
const USER_ID = process.env.USER_ID;
const TARGET_NUMBER = process.env.TARGET_NUMBER; // 91XXXXXXXXXX@c.us

// --- WHATSAPP CLIENT ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("Scan this QR code with WhatsApp to log in.");
});

client.on("ready", () => {
  console.log("WhatsApp client ready!");
});

client.initialize();

// --- FETCH CLOCKIFY REPORT ---
async function getClockifyReport() {
  // Get today's date
  const today = new Date();

  // Format date as DD/MM/YYYY
  const formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
    today.getMonth() + 1
  ).padStart(2, "0")}/${today.getFullYear()}`;

  const startDate = new Date(today);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);

  const start = startDate.toISOString();
  const end = endDate.toISOString();

  console.log(`Fetching report for: ${formattedDate}`);
  console.log(`Date range: ${start} to ${end}`);

  const url = `https://api.clockify.me/api/v1/workspaces/${WORKSPACE_ID}/user/${USER_ID}/time-entries?start=${start}&end=${end}`;

  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": CLOCKIFY_API_KEY },
    });
    const entries = await res.json();

    if (!Array.isArray(entries)) {
      console.error("Clockify API returned:", entries);
      return "No entries found or API error.";
    }

    // Remove duplicates based on description
    const uniqueEntries = [];
    const seenDescriptions = new Set();

    for (const e of entries) {
      let desc = e.description || "No description";
      desc = desc.replace(/\[CA-\d+\]:\s*/i, "").trim();
      desc = desc.charAt(0).toUpperCase() + desc.slice(1);

      // Check if we've seen this description before
      if (!seenDescriptions.has(desc)) {
        seenDescriptions.add(desc);
        uniqueEntries.push({
          description: desc,
          duration: e.timeInterval?.duration || "PT0S",
        });
      }
    }

    let report = `Daily Report for ${formattedDate}:\n\n`;

    for (let i = 0; i < uniqueEntries.length; i++) {
      const e = uniqueEntries[i];
      report += `${i + 1}) ${e.description}\n`;
    }

    return report;
  } catch (err) {
    console.error("Error fetching Clockify report:", err);
    return "Failed to fetch Clockify report.";
  }
}
// --- SEND REPORT ---
async function sendReport() {
  if (!client.info) {
    console.log("WhatsApp client not ready yet");
    return;
  }

  try {
    const report = await getClockifyReport();
    // Wait a few seconds to ensure WhatsApp DOM is loaded
    await new Promise((r) => setTimeout(r, 5000));
    await client.sendMessage(TARGET_NUMBER, report);
    console.log("Clockify report sent successfully!");
  } catch (err) {
    console.error("Error sending WhatsApp message:", err);
  }
}

// --- HTTP ENDPOINTS ---
app.get("/", (req, res) => res.send("Server is running..."));

app.get("/send-report", async (req, res) => {
  await sendReport();
  res.send("Send report triggered!");
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
