import express from "express";
import cors from "cors";
import evangelizo from "evangelizo";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// ---------------- CORE LOGIC ----------------
const getLiturgy = async (date) => {
  const options = {
    date: parseInt(date),
    lang: "AM",
  };

  try {
    console.log(`🔍 Fetching liturgy for: ${date}`);

    // We fetch one by one or wrap in a safer structure to prevent crash if one fails
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

    const cleanSaint = saint ? saint.split('(')[0].replace(/St\./g, 'Saint').trim() : "Saint of the Day";

    return {
      title: title || "Daily Liturgy",
      color: title?.toLowerCase().includes("easter") ? "White" : "Green",
      saint: { name: cleanSaint, rawName: saint },
      readings: [
        { label: "First Reading", title: frTitle, text: frText },
        { label: "Responsorial Psalm", title: psTitle, text: psText },
        { label: "Holy Gospel", title: gspTitle, text: gspText },
      ].filter(r => r.text !== ""), // Only return readings that actually have text
    };
  } catch (error) {
    console.error("Internal Logic Error:", error);
    throw new Error("The liturgical service is currently updating data for this date.");
  }
};

// ---------------- ROUTE ----------------
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
    // FIX: Check if err exists before accessing .message
    console.error("❌ Backend Error:", err?.message || "Unknown Error");
    res.status(500).json({
      error: "Failed to fetch liturgy",
      details: err?.message || "Check your internet connection or WSL DNS settings",
    });
  }
});

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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port:${PORT}`);
});
