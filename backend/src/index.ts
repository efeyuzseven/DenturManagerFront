import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { buildDashboardPayload } from "./dashboard.js";
import { resolveRange } from "./utils/date.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dentur-manager-backend",
    now: new Date().toISOString(),
  });
});

app.get("/api/dashboard/overview", async (req, res) => {
  try {
    const source =
      typeof req.query.source === "string" &&
      ["reservation", "evrak", "avrasya"].includes(req.query.source)
        ? (req.query.source as "reservation" | "evrak" | "avrasya")
        : undefined;
    const range = resolveRange(
      typeof req.query.range === "string" ? req.query.range : undefined,
      typeof req.query.start === "string" ? req.query.start : undefined,
      typeof req.query.end === "string" ? req.query.end : undefined,
      typeof req.query.label === "string" ? req.query.label : undefined,
      typeof req.query.mode === "string" ? req.query.mode : undefined
    );
    const payload = await buildDashboardPayload(range, {
      evrakSegment:
        typeof req.query.evrakSegment === "string" && req.query.evrakSegment.trim()
          ? req.query.evrakSegment.trim()
          : undefined,
    }, source);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen hata";
    res.status(500).json({
      message,
    });
  }
});

app.listen(config.port, () => {
  console.log(`Dentur Manager backend listening on http://localhost:${config.port}`);
});
