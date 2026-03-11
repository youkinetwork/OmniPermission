export class BinanceHandler {
  static isEventForBinance(event: any): boolean {
    if (event.toolName !== "exec") return false;
    const cmd = String(event.params?.command ?? "");
    return cmd.includes("binance.com") && cmd.includes("/api/v3/order");
  }

  static resolveShellVar(cmd: string, varName: string): string | null {
    const simple = cmd.match(
      new RegExp(`(?:^|\\n)\\s*${varName}=([0-9]+\\.?[0-9]*)(?:\\s|\\n|$)`, "m")
    );
    if (simple) return simple[1];

    const pyFloor = cmd.match(
      new RegExp(`${varName}=\\$\\(python3[^\\n]*raw=([0-9.]+);\\s*step=([0-9.]+)`, "m")
    );
    if (pyFloor) {
      const raw = parseFloat(pyFloor[1]);
      const step = parseFloat(pyFloor[2]);
      const decimals = (pyFloor[2].split(".")[1] ?? "").length;
      return (Math.floor(raw / step) * step).toFixed(decimals);
    }

    return null;
  }

  static parseParams(cmd: string): URLSearchParams {
    const varMatch = cmd.match(/(?:BODY|QS|QUERY)="([^"]+)"/);
    if (varMatch && varMatch[1].includes("symbol=")) {
      const resolved = varMatch[1].replace(/\$([A-Z_]+)/g, (_, varName) => {
        return BinanceHandler.resolveShellVar(cmd, varName) ?? "";
      });
      return new URLSearchParams(resolved);
    }

    const bodyMatch = cmd.match(/-d\s+"([^"]+)"/);
    if (bodyMatch && bodyMatch[1].includes("symbol=")) {
      return new URLSearchParams(bodyMatch[1]);
    }

    const urlMatch = cmd.match(/"https?:\/\/[^"]+"/);
    if (urlMatch) {
      const url = new URL(urlMatch[0].replace(/"/g, ""));
      if (url.searchParams.has("symbol")) return url.searchParams;
    }

    return new URLSearchParams();
  }

  static async fetchMarketPrice(symbol: string): Promise<string | null> {
    try {
      const res = await fetch(
        `https://demo-api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
        { headers: { "User-Agent": "binance-spot/1.0.1 (Skill)" } }
      );
      const json = await res.json() as { price?: string };
      return json.price ?? null;
    } catch {
      return null;
    }
  }

  static async formatDetails(event: any): Promise<string> {
    const cmd = String(event.params?.command ?? "");
    const p = BinanceHandler.parseParams(cmd);

    const symbol   = p.get("symbol") ?? "?";
    const side     = p.get("side") ?? "?";
    const type     = p.get("type") ?? "?";
    const quantity = p.get("quantity");
    const quoteQty = p.get("quoteOrderQty");
    const price    = p.get("price"); // only on LIMIT orders

    const amountLine = quantity
      ? `Amount: \`${quantity}\` ${symbol.replace("USDT", "")}`
      : `Spend: \`${quoteQty} USDT\``;

    // For MARKET orders fetch live price; for LIMIT use the order's price
    let priceLine: string;
    if (price) {
      priceLine = `Price: \`${price}\``;
    } else {
      const marketPrice = await BinanceHandler.fetchMarketPrice(symbol);
      priceLine = marketPrice
        ? `Price: \`${marketPrice}\` _(live market)_`
        : `Price: \`MARKET\``;
    }

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
