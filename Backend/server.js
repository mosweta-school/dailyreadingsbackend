import express from "express";
import cors from "cors";
import evangelizo from "evangelizo";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
 
const app = express();
app.use(cors());
app.use(express.json());
 
const PORT = process.env.PORT || 5000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
 
// ─── db.json persistence ──────────────────────────────────────────────────────
const DB_PATH = "./db.json";
 
const loadConfig = () => {
  if (!existsSync(DB_PATH)) return { showImage: true, updatedAt: null };
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { showImage: true, updatedAt: null };
  }
};
 
const saveConfig = (config) => {
  writeFileSync(DB_PATH, JSON.stringify(config, null, 2));
};
 
let imageConfig = loadConfig();
 
// ─── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server });
 
const broadcast = (payload) => {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
};
 
wss.on("connection", (ws) => {
  console.log("🔌 Client connected");
  ws.send(JSON.stringify({ type: "image_config", ...imageConfig }));
  ws.on("close", () => console.log("🔌 Client disconnected"));
});
 
// ─── Admin routes ─────────────────────────────────────────────────────────────
app.post("/api/admin/image-toggle", (req, res) => {
  const { password, showImage } = req.body;
 
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD not set on server" });
  }
 
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
 
  imageConfig = { showImage, updatedAt: new Date().toISOString() };
  saveConfig(imageConfig);
  broadcast({ type: "image_config", ...imageConfig });
 
  console.log(`🖼️  Image visibility set to: ${showImage}`);
  res.json({ success: true, ...imageConfig });
});
 
// Public: current image config (for frontend fallback on WS failure)
app.get("/api/image-config", (req, res) => {
  res.json(imageConfig);
});
 
// ─── Core liturgy logic ───────────────────────────────────────────────────────
const getLiturgy = async (date) => {
  const options = {
    date: parseInt(date),
    lang: "AM",
  };
 
  try {
    console.log(`🔍 Fetching liturgy for: ${date}`);
 
    const [title, saint, frTitle, frText, psTitle, psText, gspTitle, gspText] = await Promise.all([
      evangelizo.getLiturgicTitle(options).catch(() => "Daily Liturgy"),
      evangelizo.getSaint(options).catch(() => "Saint of the Day"),
      evangelizo.getReadingLt("FR", options).catch(() => ""),
      evangelizo.getReading("FR", options).catch(() => ""),
      evangelizo.getReadingLt("PS", options).catch(() => ""),
      evangelizo.getReading("PS", options).catch(() => ""),
      evangelizo.getReadingLt("GSP", options).catch(() => ""),
      evangelizo.getReading("GSP", options).catch(() => ""),
    ]);
 
    const cleanSaint = saint
      ? saint.split("(")[0].replace(/St\./g, "Saint").trim()
      : "Saint of the Day";
 
    return {
      title: title || "Daily Liturgy",
      color: title?.toLowerCase().includes("easter") ? "White" : "Green",
      saint: { name: cleanSaint, rawName: saint },
      readings: [
        { label: "First Reading", title: frTitle, text: frText },
        { label: "Responsorial Psalm", title: psTitle, text: psText },
        { label: "Holy Gospel", title: gspTitle, text: gspText },
      ].filter((r) => r.text !== ""),
    };
  } catch (error) {
    console.error("Internal Logic Error:", error);
    throw new Error("The liturgical service is currently updating data for this date.");
  }
};
// ─── Health route ────────────────────────────────────────────────────────────
app.get("/", async (req, res) => {
  try {
    res.send("Welcome to the Liturgy API.");
  } catch (err) {
    console.error("❌ Root Route Error:", err?.message || "Unknown Error");
    res.status(500).json({
      error: "Failed to load root route",
      details: err?.message || "Check your internet connection or WSL DNS settings",
    });
  }
});
 
// ─── Liturgy route ────────────────────────────────────────────────────────────
app.get("/api/liturgy", async (req, res) => {
  try {
    const { date } = req.query;
    console.log(`📅 Received request for date: ${date}`);
 
    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }
 
    const data = await getLiturgy(date);
    res.json(data);
  } catch (err) {
    console.error("❌ Backend Error:", err?.message || "Unknown Error");
    res.status(500).json({
      error: "Failed to fetch liturgy",
      details: err?.message || "Check your internet connection or WSL DNS settings",
    });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Server running on port:${PORT}`);
  console.log(`🖼️  Image visibility: ${imageConfig.showImage}`);
  console.log(`🔐 Admin password: ${ADMIN_PASSWORD ? "set ✓" : "NOT SET ⚠️"}`);
});