import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const app = express();

// Set JSON parse limits high enough to accommodate massive rosters or brackets safely of up to 50MB
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// On Vercel serverless environment, only /tmp is fully writable and readable.
const DATA_DIR = path.join("/tmp", "reports");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Health status indicator
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", environment: "vercel-serverless" });
});

// Securely store a compressed tournament report session
app.post("/api/reports", (req, res) => {
  try {
    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Empty or invalid report data details." });
    }
    
    // Generate an 12-char unique hash key
    const id = crypto.randomBytes(6).toString("hex");
    const filePath = path.join(DATA_DIR, `${id}.json`);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    res.json({ id });
  } catch (err: any) {
    console.error("[Backend Error] Error saving report:", err);
    res.status(500).json({ error: err.message || "Failed to store serverless report." });
  }
});

// Fetch a stored tournament report by key
app.get("/api/reports/:id", (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(DATA_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Tournament report not found or has expired." });
    }
    
    const content = fs.readFileSync(filePath, "utf-8");
    res.json(JSON.parse(content));
  } catch (err: any) {
    console.error("[Backend Error] Error reading report:", err);
    res.status(500).json({ error: err.message || "Failed to retrieve public report." });
  }
});

export default app;
