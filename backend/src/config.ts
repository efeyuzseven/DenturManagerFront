import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4301),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  disableTlsVerify: process.env.DISABLE_TLS_VERIFY === "true",
  reservation: {
    slug: "reservation",
    name: "Dentur Rezervasyon",
    apiBase: process.env.RESERVATION_API_BASE || "http://localhost:7058/api",
    token: process.env.RESERVATION_API_TOKEN || "",
  },
  evrak: {
    slug: "evrak",
    name: "Dentur Evrak Takip",
    apiBase: process.env.EVRAK_API_BASE || "https://localhost:44368/api",
    token: process.env.EVRAK_API_TOKEN || "",
  },
  avrasya: {
    slug: "avrasya",
    name: "Dentur Avrasya",
    apiBase: process.env.AVRASYA_API_BASE || "https://denturavrasya.com:7284/api",
    token: process.env.AVRASYA_API_TOKEN || "",
  },
};
