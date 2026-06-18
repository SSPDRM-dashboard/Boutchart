import app from "./api/index";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const PORT = 3000;

  // Vite preview & server-side middleware configuration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(expressStaticFallback(distPath));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });
}

function expressStaticFallback(distPath: string) {
  const express = require("express");
  const fallback = express.Router();
  fallback.use(express.static(distPath));
  fallback.get("*", (req: any, res: any) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
  return fallback;
}

startServer();

