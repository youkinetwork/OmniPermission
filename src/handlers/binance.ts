export class BinanceHandler {
  static isEventForBinance(event: any): boolean {
    if (event.toolName !== "exec") return false;
    const cmd = String(event.params?.command ?? "");
    return cmd.includes("binance.com") && cmd.includes("/api/v3/order");
  }

  static parseParams(cmd: string): URLSearchParams {
    // The exec command is a shell script. Params live in a variable assignment:
    // BODY="symbol=DOGEUSDT&side=BUY&type=MARKET&quoteOrderQty=100&timestamp=$TS"
    // QS="symbol=PEPEUSDT&side=SELL&type=MARKET&quantity=15228658&timestamp=$TS"
    // The -d "$FULL_BODY" / -d "$QS&signature=$SIG" ref is never expanded.
    const varMatch = cmd.match(/(?:BODY|QS|QUERY)="([^"]+)"/);
    if (varMatch && varMatch[1].includes("symbol=")) {
      // $TS is unexpanded but irrelevant — we only need symbol/side/type/qty
      return new URLSearchParams(varMatch[1].replace(/\$\w+/g, ""));
    }

    // Fallback: -d with literal value (if command style ever changes)
    const bodyMatch = cmd.match(/-d\s+"([^"]+)"/);
    if (bodyMatch && bodyMatch[1].includes("symbol=")) {
      return new URLSearchParams(bodyMatch[1]);
    }

    // Fallback: URL query string
    const urlMatch = cmd.match(/"https?:\/\/[^"]+"/);
    if (urlMatch) {
      const url = new URL(urlMatch[0].replace(/"/g, ""));
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
