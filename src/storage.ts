import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export const getKeyPath = (api: OpenClawPluginApi) =>
  path.join(api.runtime.state.resolveStateDir(), "omni_key.txt");

// Path for the intercepted tools list
export const getToolsPath = (api: OpenClawPluginApi) =>
  path.join(api.runtime.state.resolveStateDir(), "intercepted_tools.json");

export const getSavedKey = async (api: OpenClawPluginApi) => {
  try {
    const key = await fs.readFile(getKeyPath(api), "utf-8");
    return key.trim();
  } catch {
    return null; // Return null instead of a string to trigger your !rawKey check
  }
};

/**
 * Saves the list of tools to a JSON file
 */
export const saveInterceptedTools = async (api: OpenClawPluginApi, tools: string[]) => {
  const toolsPath = getToolsPath(api);
  await fs.mkdir(path.dirname(toolsPath), { recursive: true });
  await fs.writeFile(toolsPath, JSON.stringify(tools, null, 2), "utf-8");
};

/**
 * Retrieves the list of tools to intercept
 */
export const getInterceptedTools = async (api: OpenClawPluginApi): Promise<string[]> => {
  try {
    const data = await fs.readFile(getToolsPath(api), "utf-8");
    return JSON.parse(data);
  } catch {
    return []; // Return empty array if file doesn't exist yet
  }
};
