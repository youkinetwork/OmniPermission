export class BinanceHandler {
  static isEventForBinance(event: any): boolean {
    if (event.toolName !== "exec") return false;
    const cmd = String(event.params?.command ?? "");
    return cmd.includes("binance.com") && cmd.includes("/api/v3/order");
  }

  /**
   * Tries to resolve a shell variable's value from the script text.
   * Handles:
   *   1. Simple assignment:      BTC=0.00069
   *   2. Python floor pattern:   BTC=$(python3 -c "... raw=0.00069930; step=0.00001 ...")
   */
  static resolveShellVar(cmd: string, varName: string): string | null {
    // 1. Simple numeric assignment: VARNAME=0.00069 or VARNAME=1079
    const simple = cmd.match(
      new RegExp(`(?:^|\\n)\\s*${varName}=([0-9]+\\.?[0-9]*)(?:\\s|\\n|$)`, "m")
    );
    if (simple) return simple[1];

    // 2. Python floor: VARNAME=$(python3 -c "... raw=X; step=Y ...")
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
      // Resolve any $VARNAME references before parsing
      const resolved = varMatch[1].replace(/\$([A-Z_]+)/g, (_, varName) => {
        return BinanceHandler.resolveShellVar(cmd, varName) ?? "";
      });
      return new URLSearchParams(resolved);
    }

    // Fallback: -d with literal value
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
