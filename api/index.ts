import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();

// Set JSON parse limits high enough to accommodate massive rosters or brackets safely of up to 50MB
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy initializer for Google GenAI client to preserve robustness of startup without api key
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required but missing. Go to Settings > Secrets to configure your key.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

// Define persistent paths in the workspace root directory so they are saved permanently
const localReportsDir = path.join(process.cwd(), "stored_reports");
let DATA_DIR = localReportsDir;

try {
  if (!fs.existsSync(localReportsDir)) {
    fs.mkdirSync(localReportsDir, { recursive: true });
  }
} catch (err) {
  console.warn("[Storage Error] Could not write to local process.cwd() directory. Falling back to /tmp/reports", err);
  DATA_DIR = path.join("/tmp", "reports");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Health status indicator
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", environment: "web-applet-persistent" });
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
    let filePath = path.join(DATA_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      // Check fallback path in /tmp just in case the report was stored there
      const fallbackPath = path.join("/tmp", "reports", `${id}.json`);
      if (fs.existsSync(fallbackPath)) {
        filePath = fallbackPath;
      } else {
        return res.status(404).json({ error: "Tournament report not found or has expired." });
      }
    }
    
    const content = fs.readFileSync(filePath, "utf-8");
    res.json(JSON.parse(content));
  } catch (err: any) {
    console.error("[Backend Error] Error reading report:", err);
    res.status(500).json({ error: err.message || "Failed to retrieve public report." });
  }
});

// Parse a bracket/roster PDF file using Gemini 3.5 Flash
app.post("/api/parse-pdf-bracket", async (req: any, res: any) => {
  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "Missing pdfBase64 raw string field." });
    }

    // Clean up base64 prefix if present
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");

    const client = getGeminiClient();

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: cleanBase64
          }
        },
        {
          text: "Analyze this PDF, which contains sports tournament tournament brackets, schedules, bout lists, or division draws. " +
                "Carefully extract all distinct weight classes, divisions, age categories, or belt levels. " +
                "For each group: " +
                "1. List the names of all players/athletes along with their registration team, school, or club if listed (default to empty string if missing). " +
                "Do NOT include standard system lines or 'Bye' entrants as competitors in the extracted competitor names list. " +
                "2. Extract any matches or matchups with their associated official bout numbers/match numbers as explicitly written on the sheet or bracket layout. " +
                "Provide the names of the two competing athletes for that matchup (athlete1 and athlete2), and the exact bout/match number (integer)."
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            divisions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  categoryName: {
                    type: Type.STRING,
                    description: "Descriptive name of the division, bracket, or weight group (e.g. -60kg Female, Men's Heavyweight, etc.)"
                  },
                  competitors: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: {
                          type: Type.STRING,
                          description: "The full name of the fighter or match participant."
                        },
                        club: {
                          type: Type.STRING,
                          description: "The team, association, academy, or club name if listed, otherwise empty."
                        }
                      },
                      required: ["name"]
                    }
                  },
                  bouts: {
                    type: Type.ARRAY,
                    description: "List of explicit individual matchups/bouts found in this division with assigned bout numbers.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        athlete1: {
                          type: Type.STRING,
                          description: "Name of the first athlete/competitor in this match."
                        },
                        athlete2: {
                          type: Type.STRING,
                          description: "Name of the second athlete/competitor in this match."
                        },
                        boutNumber: {
                          type: Type.INTEGER,
                          description: "The official bout, match, or fight index number as labeled on the bracket sheet."
                        }
                      },
                      required: ["athlete1", "athlete2", "boutNumber"]
                    }
                  }
                },
                required: ["categoryName", "competitors"]
              }
            }
          },
          required: ["divisions"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("The Gemini model returned an empty string output.");
    }

    const parsedData = JSON.parse(text);
    res.json(parsedData);
  } catch (err: any) {
    console.error("[Gemini PDF Parse Error]", err);
    res.status(500).json({ error: err.message || "Failed to process PDF bracket. Ensure GEMINI_API_KEY is configured." });
  }
});

export default app;
