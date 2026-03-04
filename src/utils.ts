import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getMode } from "./storage.ts";

/**
 * Returns the backend URL based on the mode stored in the plugin's state.
 */
export async function getOmniBackendUrl(api: OpenClawPluginApi): Promise<string> {
  const mode = await getMode(api);

  if (mode === "dev") {
    return "https://backend.dev.ecrop.de/ecrop-command/omnipermission/poas";
  }

  return "https://backend.ecrop.de/ecrop-command/omnipermission/poas";
}

/**
 * Formats the public key by replacing newlines with literal '\n' 
 * characters to ensure valid JSON transmission.
 */
export function formatKey(rawKey: string): string {
  return rawKey.replace(/\r?\n/g, "\\n");
}
