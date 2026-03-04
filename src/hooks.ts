import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSavedKey, getInterceptedTools } from "./storage.ts";
import { getOmniBackendUrl, formatKey } from "./utils.ts";

export const registerOmniHooks = (api: OpenClawPluginApi) => {
  api.on("before_tool_call", async (event) => {
    // 1. Check if the tool is in the "Blacklist"
    const interceptedTools = await getInterceptedTools(api);

    if (!interceptedTools.includes(event.toolName)) {
      api.logger.info(`[omnipermission] ⏩ Skipping: ${event.toolName} is not blacklisted.`);
      return;
    }

    // 2. Fetch the Key
    const rawKey = await getSavedKey(api);

    if (!rawKey) {
      api.logger.warn(`[omnipermission] 🛑 Action blocked: Public key is missing.`);
      return {
        block: true,
        blockReason:
          "Please provide your public key before this action. Run: openclaw omnipermission set-key",
      };
    }

    // Use utility to format the key
    const key = formatKey(rawKey);
    
    // Use utility to get the correct URL (dev vs prod based on storage flag)
    const baseUrl = await getOmniBackendUrl(api);

    api.logger.info(`[omnipermission] 🎯 Intercepting tool: ${event.toolName}`);

    const requestBody = {
      contentToApprove: `OpenClaw wants to use this tool:${event.toolName}. Do you approve this?`,
      extraData: `UNKNOWN`,
      publicKey: key,
    };

    // LOG RAW REQUEST (Line by line for Dashboard visibility)
    const requestString = JSON.stringify(requestBody, null, 2);
    requestString
      .split("\n")
      .forEach((line) => api.logger.info(`[omnipermission] 📤 REQ: ${line}`));

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 201) {
        const responseData = await response.json();
        const poaId = responseData.id;
        api.logger.info(
          `[omnipermission] ✅ POA created (ID: ${poaId}). Waiting for mobile approval...`,
        );

        // 4. Polling Loop
        let approved = false;
        while (!approved) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          // Poll using the dynamic baseUrl
          const pollResponse = await fetch(`${baseUrl}/${poaId}`);
          const pollData = await pollResponse.json();

          if (pollData.status === "APPROVED") {
            api.logger.info(`[omnipermission] 👍 Approved. Executing ${event.toolName}.`);
            approved = true;
          } else if (pollData.status === "REJECTED") {
            api.logger.warn(`[omnipermission] 🛑 Rejected by user via OmniPersona.`);
            return {
              block: true,
              blockReason: "User rejected the action on the mobile app.",
            };
          }
        }
        return;
      } else {
        const errorData = await response.text();
        api.logger.error(`[omnipermission] ❌ API Error (${response.status}) at ${baseUrl}`);
        errorData
          .split("\n")
          .forEach((line) => api.logger.error(`[omnipermission] ❌ DATA: ${line}`));

        return {
          block: true,
          blockReason: `POA failed with status ${response.status}.`,
        };
      }
    } catch (error) {
      api.logger.error(`[omnipermission] ❌ Network/Fetch error: ${error}`);
      return {
        block: true,
        blockReason: "OmniPermission backend unreachable.",
      };
    }
  });
};
