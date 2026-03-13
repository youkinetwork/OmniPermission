# How to Extend

This guide is for adding the tools that you desire to OmniPermission plugin. Please fork the repo and apply the following changes. We would be happy to receive your pull requests containing new tools as well. 
Feel free to make a pull request and we'll review it and add it to our later version. In case you want us to support a tool you desire, please create an issue so that we can address your needs promptly. 

---

# Step 1

In order to extend the list of supported tools, create a new typescript file in `src/handlers` to handle the tool. The following is the handler we built for Slack.

```typescript
export class SlackHandler {
  /**
   * Checks if the given tool call event is intended for Slack.
   * @param event The event object from the before_tool_call hook.
   * @returns boolean
   */
  static isEventForSlack(event: any): boolean {
    if (event.toolName !== "message") return false;

    const params = (event.params as Record<string, unknown>) || {};
    const channel = String(params.channel ?? "");
    const target = String(params.target ?? "");

    return channel === "slack" || target.startsWith("slack:");
  }

  /**
   * Formats Slack-related event parameters into a Markdown string.
   * @param event The event object containing tool call parameters.
   * @returns A formatted Markdown string for logs or UI.
   */
  static formatDetails(event: any): string {
    const params = (event.params as Record<string, unknown>) || {};
    const action = String(params.action ?? "unknown");
    const target = String(params.target ?? "unknown");
    const message = String(params.message ?? "");
    const timestamp = new Date().toLocaleString();

    return [
      `### 💬 Slack Action Detected`,
      `---`,
      `**Time:** ${timestamp}`,
      `**Action:** \`${action}\``,
      `**Target Channel:** \`${target}\``,
      `**Message:**`,
      `> ${message}`,
      `---`,
      `**Do you approve this action?**`
    ].join("\n");
  }
}
```

---

# Step 2

After creating the handler file, add the name of your tool to `src/models/supported-tools.ts` enum. 

```typescript
/**
 * Enum for categorized tool support.
 */
export enum SupportedTools {
  slack = "slack",
  binance = "binance",
  unsupported = "unsupported"
}
```
---

# Step 3

The next step is to modify `src/utils.ts` so that the hooks intercept your tool properly. In order to do that, modify this method in the `Utils` class.

```typescript
  /**
   * Identifies the specific tool category from an event.
   * @returns SupportedTools enum value
   */
  static getToolType(event: any): SupportedTools {
    if (SlackHandler.isEventForSlack(event)) {
      return SupportedTools.slack;
    } else if (BinanceHandler.isEventForBinance(event)) {
      return SupportedTools.binance;
    }
    
    return SupportedTools.unsupported;
  }
```

In case you want to provide proper content to the POAs for your tool, modify this method as well.

```typescript
  /**
   * Identifies the tool type and returns formatted details for the mobile approval screen.
   * If the event is Slack-related, it returns the detailed Markdown.
   * Otherwise, returns "unknown".
   */
  static async getEventApprovalContent(event: any): Promise<string> {
    if (this.getToolType(event) === SupportedTools.slack) {
      return SlackHandler.formatDetails(event);
    } else if (this.getToolType(event) === SupportedTools.binance) {
      return await BinanceHandler.formatDetails(event);
    }
    
    return "unknown";
  }
```

---

# Step 4

The final step is to blacklist the tool you just added support for. Do it with the following command. And make sure to restart the gateway before testing.

```shell
openclaw omnipermission blacklist-tools
```
