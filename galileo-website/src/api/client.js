// Authenticated TideWatch API client (E13).
// Attaches the Cognito JWT (from Amplify Auth) as a Bearer token so calls hit
// the authenticated /v1 surface. Mirrors product_loop/openapi.yaml.
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "https://api.galileo-space.com";

async function authHeaders() {
  try {
    const session = await fetchAuthSession();
    const token = session?.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (e) {
    console.warn("No auth session available:", e);
    return {};
  }
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

// Endpoint helpers (one per /v1 route in the OpenAPI spec).
export const getImages = () => apiGet("/v1/images");
export const listAois = () => apiGet("/v1/aois");
export const createAoi = (aoi) => apiPost("/v1/aois", aoi);
export const getAoiActivity = (aoiId) => apiGet(`/v1/aois/${aoiId}/activity`);
export const listReports = () => apiGet("/v1/reports");
export const createReport = (r) => apiPost("/v1/reports", r);
export const analyzeReport = (id) => apiPost(`/v1/reports/${id}/analyze`, {});
export const getUsage = () => apiGet("/v1/usage");
export const postTask = (payload) => apiPost("/task", payload);
