import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection } from "firebase/firestore";

const app = express();

// Initialize Firebase in backend for cloud persistence support on Vercel
let db: any = null;
try {
  let firebaseConfig: any = null;
  let firestoreDatabaseId: string | undefined = undefined;

  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    firebaseConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId
    };
    firestoreDatabaseId = config.firestoreDatabaseId;
  } else if (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID) {
    // Fallback to environment variables (useful for serverless Vercel deployments)
    firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID
    };
    firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
  }

  if (firebaseConfig) {
    const appInstance = initializeApp(firebaseConfig);
    db = getFirestore(appInstance, firestoreDatabaseId);
    console.log("Firebase initialized successfully in backend api!");
  } else {
    console.warn("No Firebase configuration found (neither firebase-applet-config.json nor environment variables are present)");
  }
} catch (e) {
  console.error("Failed to initialize Firebase in backend api:", e);
}

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
app.post("/api/reports", async (req, res) => {
  try {
    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Empty or invalid report data details." });
    }
    
    // Generate an 12-char unique hash key
    const id = crypto.randomBytes(6).toString("hex");
    
    // 1. Try storing in Firestore first for Vercel persistence
    if (db) {
      try {
        const payloadStr = JSON.stringify(data);
        const docRef = doc(collection(db, "reports"), id);
        await setDoc(docRef, { payload: payloadStr });
        console.log(`Saved report ${id} to Firestore.`);
      } catch (fbErr: any) {
        console.error("Failed to save report to Firestore, falling back to disk", fbErr);
      }
    }
    
    // 2. Also write to local file as backup (in case offline or local dev is without Firestore)
    try {
      const filePath = path.join(DATA_DIR, `${id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (diskErr) {
      console.warn("Could not write report to local disk", diskErr);
    }
    
    res.json({ id });
  } catch (err: any) {
    console.error("[Backend Error] Error saving report:", err);
    res.status(500).json({ error: err.message || "Failed to store serverless report." });
  }
});

// Fetch a stored tournament report by key
app.get("/api/reports/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Try retrieving from Firestore first!
    if (db) {
      try {
        const docRef = doc(db, "reports", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const docData = docSnap.data();
          if (docData && docData.payload) {
            try {
              const parsed = JSON.parse(docData.payload);
              return res.json(parsed);
            } catch (e) {
              // If it's stored directly as an object, return it
              return res.json(docData);
            }
          } else if (docData) {
            return res.json(docData);
          }
        }
      } catch (fbErr) {
        console.error(`Failed to load report ${id} from Firestore, falling back to disk`, fbErr);
      }
    }
    
    // 2. Fallback to local file
    let filePath = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
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
      model: "gemini-2.5-flash",
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
