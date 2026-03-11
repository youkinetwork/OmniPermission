import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * Storage class for managing OmniPermission configuration and state files.
 */
export class Storage {
  /**
   * Resolves the file path for the OmniPersona UUID key.
   */
  static getKeyPath(api: OpenClawPluginApi): string {
    return path.join(api.runtime.state.resolveStateDir(), "omni_key.txt");
  }

  /**
   * Resolves the file path for the list of intercepted tools.
   */
  static getToolsPath(api: OpenClawPluginApi): string {
    return path.join(api.runtime.state.resolveStateDir(), "intercepted_tools.json");
  }

  /**
   * Resolves the file path for the environment mode flag (prod/dev).
   */
  static getModePath(api: OpenClawPluginApi): string {
    return path.join(api.runtime.state.resolveStateDir(), "omni_mode.json");
  }

  /**
   * Retrieves the saved OmniPersona UUID key.
   */
  static async getSavedKey(api: OpenClawPluginApi): Promise<string | null> {
    try {
      const key = await fs.readFile(this.getKeyPath(api), "utf-8");
      return key.trim();
    } catch {
      return null;
    }
  }

  /**
   * Saves the list of tools that require mobile approval.
   */
  static async saveInterceptedTools(api: OpenClawPluginApi, tools: string[]): Promise<void> {
    const toolsPath = this.getToolsPath(api);
    await fs.mkdir(path.dirname(toolsPath), { recursive: true });
    await fs.writeFile(toolsPath, JSON.stringify(tools, null, 2), "utf-8");
  }

  /**
   * Saves the OmniPersona UUID key.
   */
  static async saveKey(api: OpenClawPluginApi, key: string): Promise<void> {
    const keyPath = this.getKeyPath(api);
    await fs.mkdir(path.dirname(keyPath), { recursive: true });
    await fs.writeFile(keyPath, key, "utf-8");
  }

  /**
   * Retrieves the current list of intercepted tools.
   */
  static async getInterceptedTools(api: OpenClawPluginApi): Promise<string[]> {
    try {
      const data = await fs.readFile(this.getToolsPath(api), "utf-8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Saves the environment mode (prod or dev).
   */
  static async saveMode(api: OpenClawPluginApi, mode: "prod" | "dev"): Promise<void> {
    const modePath = this.getModePath(api);
    await fs.mkdir(path.dirname(modePath), { recursive: true });
    await fs.writeFile(modePath, JSON.stringify({ mode }), "utf-8");
  }

  /**
   * Retrieves the current mode, defaults to "prod".
   */
  static async getMode(api: OpenClawPluginApi): Promise<"prod" | "dev"> {
    try {
      const data = await fs.readFile(this.getModePath(api), "utf-8");
      return JSON.parse(data).mode;
    } catch {
      return "prod";
    }
  }
}
