import axios from "axios";
import https from "https";
import { config } from "../config.js";

const httpsAgent = new https.Agent({
  rejectUnauthorized: !config.disableTlsVerify,
});

export async function httpGet<T>(
  baseUrl: string,
  path: string,
  token?: string
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const response = await axios.get<T>(url, {
    httpsAgent,
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  return response.data;
}

export async function httpPost<TRequest, TResponse>(
  baseUrl: string,
  path: string,
  body: TRequest,
  token?: string
): Promise<TResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const response = await axios.post<TResponse>(url, body, {
    httpsAgent,
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  return response.data;
}

export function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
