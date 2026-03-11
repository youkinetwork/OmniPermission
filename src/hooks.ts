import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSavedKey, getInterceptedTools } from "./storage.ts";
import { formatKey, requestMobileApproval } from "./utils.ts";

export const registerOmniHooks = (api: OpenClawPluginApi) => {
  // HOOK A: Capture the "Why"
  api.on("llm_output", async (event) => {
    api.logger.warn(`[omnipermission] ${event.model}`);
    api.logger.warn(`[omnipermission] ${event.assistantTexts.join("\n")}`);
    api.logger.warn(`[omnipermission] ${event.lastAssistant}`);
    api.logger.warn(`[omnipermission] ${event.provider}`);
    api.logger.warn(`[omnipermission] ${event.runId}`);
    api.logger.warn(`[omnipermission] ${event.sessionId}`);
    api.logger.warn(`[omnipermission] ${event.usage?.cacheRead} ${event.usage?.cacheWrite} ${event.usage?.input} ${event.usage?.output}`);
  });

  api.on("before_message_write", (event) => {
    api.logger.warn(`[omnipermission: before_message_write: ${event.message.role}`);
  });

  // Manually defined since PluginHookName isn't exported
  const allHooks = [
    "before_model_resolve", "before_prompt_build", "before_agent_start",
    "llm_input", "llm_output", "agent_end", "before_compaction",
    "after_compaction", "before_reset", "message_received",
    "message_sending", "message_sent", "before_tool_call",
    "after_tool_call", "tool_result_persist", "before_message_write",
    "session_start", "session_end", "subagent_spawning",
    "subagent_delivery_target", "subagent_spawned", "subagent_ended",
    "gateway_start", "gateway_stop"
  ];

  allHooks.forEach((hookName) => {
    api.on(hookName as any, async (event: any) => {
      api.logger.info(`[omnipermission] 🛑 ⚡ ${hookName}`);
    });
  });


  api.on("before_tool_call", async (event) => {

    // 🔍 Binance Detection (runs for all exec calls)
    if (event.toolName === "exec") {
      const cmd = String(event.params?.command ?? "");
      if (cmd.includes("binance.com")) {
        const isTrade = cmd.includes("/api/v3/order");
        const isQuery = cmd.includes("/api/v3/account") || cmd.includes("/api/v3/ticker");
        api.logger.info(
          `[omnipermission] 🟡 Binance exec detected — ` +
          `type: ${isTrade ? "TRADE" : isQuery ? "QUERY" : "OTHER"} | ` +
          `cmd: ${cmd.slice(0, 120)}...`
        );
      }
    }

    // 🔍 Slack Detection (message tool-based)
    if (event.toolName === "message") {
      const params = event.params as Record<string, unknown>;
      const channel = String(params?.channel ?? "");
      const target = String(params?.target ?? "");

      if (channel === "slack" || target.startsWith("slack:")) {
        api.logger.info(
          `[omnipermission] 💬 Slack message detected — ` +
          `action: ${params?.action} | target: ${target} | ` +
          `msg: ${String(params?.message ?? "").slice(0, 80)}...`
        );
      }
    }

    // 1. Blacklist Check
    const interceptedTools = await getInterceptedTools(api);
    if (!interceptedTools.includes(event.toolName)) {
      api.logger.info(`[omnipermission] 🎯 ${event.toolName} is not blacklisted`);
      return;
    }

    // 2. Key Validation
    const rawKey = await getSavedKey(api);
    if (!rawKey) {
      api.logger.warn(`[omnipermission] 🛑 Action blocked: Public key is missing.`);
      return {
        block: true,
        blockReason: "Missing public key. Run: openclaw omnipermission set-key",
      };
    }

    const key = formatKey(rawKey);
    api.logger.info(`[omnipermission] 🎯 Intercepting tool: ${event.toolName}`);

    // 3. Hand off to Utils for API/Polling
    const result = await requestMobileApproval(api, event.toolName, key);

    if (!result.approved) {
      return {
        block: true,
        blockReason: result.reason || "Action rejected.",
      };
    }

    // If approved, we return nothing to let the tool execute
    return;
  });
};
