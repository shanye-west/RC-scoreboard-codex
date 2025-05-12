// server/index.ts

// 1) Load .env so process.env.DATABASE_URL is defined
import "dotenv/config";

import express, { Request, Response, NextFunction } from "express";
// 2) Import both your Drizzle ORM client and Neon Pool
import { db, pool } from "./db";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware for all /api routes
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// Helper function to capture error details
function captureError(err: any) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Error:`, err);
  return { timestamp, error: err };
}

(async () => {
  // 3) Smoke-test Neon on startup
  try {
    const result = await pool.query<{ now: Date }>("SELECT NOW() AS now");
    console.log("🗓️  Connected to Neon, server time is", result.rows[0].now);
  } catch (e) {
    console.error("❌  Failed to connect to Neon:", e);
    process.exit(1);
  }

  // 4) Register your routes and get the underlying HTTP server
  const server = await registerRoutes(app);

  // 5) Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const errorDetails = captureError(err);
    
    res.status(status).json({
      message,
      errorId: errorDetails.timestamp,
      path: _req.path,
      method: _req.method,
      ...(process.env.NODE_ENV !== "production" && { details: errorDetails }),
    });
  });

  // 6) Health-check endpoints
  app.get("/_health", (_req, res) => res.status(200).send("OK"));
  app.get("/", (req, res, next) => {
    if (req.method === "HEAD" || !req.accepts("html")) {
      return res.status(200).send("OK");
    }
    next();
  });

  // 7) Vite in dev, static in prod
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // 8) Listen on Replit’s PORT or default to 5000
  const port = Number(process.env.PORT) || 5000;
  server.listen(
    {
      host: "0.0.0.0",
      port,
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})(); // ← Close the IIFE
