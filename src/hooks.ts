import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { SupportedTools } from "./models/supported-tools.ts";
import { Storage } from "./storage.ts";
import { Utils } from "./utils.ts";

export const registerOmniHooks = (api: OpenClawPluginApi) => {
  api.on("llm_output", async (event) => {
    api.logger.warn(`[omnipermission] ${event.model}`);
    api.logger.warn(`[omnipermission] ${event.assistantTexts.join("\n")}`);
    api.logger.warn(`[omnipermission] ${event.lastAssistant}`);
    api.logger.warn(`[omnipermission] ${event.provider}`);
    api.logger.warn(`[omnipermission] ${event.runId}`);
    api.logger.warn(`[omnipermission] ${event.sessionId}`);
    api.logger.warn(
      `[omnipermission] ${event.usage?.cacheRead} ${event.usage?.cacheWrite} ${event.usage?.input} ${event.usage?.output}`,
    );
  });

  api.on("before_message_write", (event) => {
    api.logger.warn(`[omnipermission: before_message_write: ${event.message.role}`);
  });


  const allHooks = [
    "before_model_resolve",
    "before_prompt_build",
    "before_agent_start",
    "llm_input",
    "llm_output",
    "agent_end",
    "before_compaction",
    "after_compaction",
    "before_reset",
    "message_received",
    "message_sending",
    "message_sent",
    "before_tool_call",
    "after_tool_call",
    "tool_result_persist",
    "before_message_write",
    "session_start",
    "session_end",
    "subagent_spawning",
    "subagent_delivery_target",
    "subagent_spawned",
    "subagent_ended",
    "gateway_start",
    "gateway_stop",
  ];

  allHooks.forEach((hookName) => {
    api.on(hookName as any, async (event: any) => {
      api.logger.info(`[omnipermission] 🛑 ⚡ ${hookName}`);
    });
  });

  api.on("before_tool_call", async (event) => {
    const eventToolName: SupportedTools = Utils.getToolType(event);

    // 1. Blacklist Check
    const interceptedTools = await Storage.getInterceptedTools(api);
    if (!interceptedTools.includes(eventToolName)) {
      api.logger.info(`[omnipermission] 🎯 ${eventToolName} is not blacklisted`);
      return;
    }

    // 2. Key Validation
    const rawKey = await Storage.getSavedKey(api);
    if (!rawKey) {
      api.logger.warn(`[omnipermission] 🛑 Action blocked: Public key is missing.`);
      return {
        block: true,
        blockReason: "Missing public key. Run: openclaw omnipermission set-key",
      };
    }

    const key = Utils.formatKey(rawKey);
    api.logger.info(`[omnipermission] 🎯 Intercepting tool: ${eventToolName}`);

    // 3. Hand off to Utils for API/Polling
    const result = await Utils.requestMobileApproval(
      api,
      eventToolName,
      await Utils.getEventApprovalContent(event),
      key,
    );

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
