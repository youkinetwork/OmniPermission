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
  static formatSlackDetails(event: any): string {
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
