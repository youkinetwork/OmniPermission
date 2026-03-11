export class BinanceHandler {
  static isEventForBinance(event: any): boolean {
    if (event.toolName !== "exec") return false;
    const cmd = String(event.params?.command ?? "");
    return cmd.includes("binance.com") && cmd.includes("/api/v3/order");
  }

  static parseParams(cmd: string): URLSearchParams {
    // Params are always in the -d body, NOT in the URL query string
    // Matches: -d "key=val&..." or -d 'key=val&...'
    const bodyMatch = cmd.match(/-d\s+["']([^"']+)["']/);
    if (bodyMatch) return new URLSearchParams(bodyMatch[1]);

    // Fallback: try URL query string (in case command style changes)
    const urlMatch = cmd.match(/["']https?:\/\/[^"']+["']/);
    if (urlMatch) {
      const url = new URL(urlMatch[0].replace(/["']/g, ""));
      if (url.searchParams.has("symbol")) return url.searchParams;
    }

    return new URLSearchParams();
  }

  static formatDetails(event: any): string {
    const cmd = String(event.params?.command ?? "");
    const p = BinanceHandler.parseParams(cmd);

    const symbol   = p.get("symbol") ?? "?";
    const side     = p.get("side") ?? "?";
    const type     = p.get("type") ?? "?";
    const quantity = p.get("quantity");
    const quoteQty = p.get("quoteOrderQty");
    const price    = p.get("price");

    const amountLine = quantity
      ? `Amount: \`${quantity}\` ${symbol.replace("USDT", "")}`
      : `Spend: \`${quoteQty} USDT\``;

    const priceLine = price
      ? `Price: \`${price}\``
      : `Price: \`MARKET\``;

    const emoji = side === "BUY" ? "🟢" : "🔴";
    return [
      `### ${emoji} Binance Trade About to Execute`,
      `**${side}** **${symbol}**`,
      amountLine,
      priceLine,
      `Order Type: \`${type}\``,
    ].join("\n");
  }
}
