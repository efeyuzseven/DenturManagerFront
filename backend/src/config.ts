import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4301),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  disableTlsVerify: process.env.DISABLE_TLS_VERIFY === "true",
  reservation: {
    slug: "reservation",
    name: "Dentur Rezervasyon",
    apiBase: process.env.RESERVATION_API_BASE || "https://rezervasyon.denturgrup.com.tr/api",
    token: process.env.RESERVATION_API_TOKEN || "",
    authEmail: process.env.RESERVATION_AUTH_EMAIL || "",
    authPassword: process.env.RESERVATION_AUTH_PASSWORD || "",
  },
  evrak: {
    slug: "evrak",
    name: "Dentur Evrak Takip",
    apiBase: process.env.EVRAK_API_BASE || "http://37.148.212.71:4746/api",
    token: process.env.EVRAK_API_TOKEN || "",
    authEmail: process.env.EVRAK_AUTH_EMAIL || "",
    authPassword: process.env.EVRAK_AUTH_PASSWORD || "",
  },
  avrasya: {
    slug: "avrasya",
    name: "Dentur Avrasya",
    apiBase: process.env.AVRASYA_API_BASE || "https://denturavrasya.com:7284/api",
    token: process.env.AVRASYA_API_TOKEN || "",
  },
};
