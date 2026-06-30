import app from "./api/index";
import path from "path";
import fs from "fs";
import express from "express";

async function startServer() {
  const PORT = 3000;

  // Determine if we should run in development mode (Vite dev server) or production mode (serve static files)
  const isDev = process.env.NODE_ENV !== "production" && 
                fs.existsSync(path.resolve(process.cwd(), "vite.config.ts"));

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Add fallback for SPA client-side routes (like /report/:id) in development
    app.get("*", async (req, res, next) => {
      // Exclude API routes
      if (req.originalUrl.startsWith("/api/")) {
        return next();
      }
      try {
        const htmlPath = path.resolve(process.cwd(), "index.html");
        let html = fs.readFileSync(htmlPath, "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
