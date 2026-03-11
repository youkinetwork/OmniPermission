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

  /**
   * Parses Python dict literal: {"symbol": "BTCUSDT", "side": "BUY", ...}
   * Handles string values "key": "val" and resolves str(var) by looking up var.
   */
  static parsePythonDict(cmd: string): URLSearchParams | null {
    // Find the dict that contains "symbol" — could be inside post({...}) or params = {...}
    const dictMatch = cmd.match(/\{([^{}]*"symbol"\s*:\s*"[^"]*"[^{}]*)\}/);
    if (!dictMatch) return null;

    const p = new URLSearchParams();
    const body = dictMatch[1];

    // "key": "literal_value"
    for (const [, key, val] of body.matchAll(/"(\w+)"\s*:\s*"([^"]+)"/g)) {
      p.set(key, val);
    }

    // "key": str(varName) — resolve the variable from the script
    for (const [, key, varName] of body.matchAll(/"(\w+)"\s*:\s*str\((\w+)\)/g)) {
      const resolved = this.resolvePyVar(cmd, varName);
      if (resolved) p.set(key, resolved);
    }

    // "key": varName (unquoted variable reference, e.g. quantity: qty)
    for (const [, key, varName] of body.matchAll(/"(\w+)"\s*:\s*([a-zA-Z_]\w*)(?=\s*[,}])/g)) {
      if (!p.has(key)) {
        const resolved = this.resolvePyVar(cmd, varName);
        if (resolved) p.set(key, resolved);
      }
    }

    return p.has("symbol") ? p : null;
  }

  /**
   * Resolves a Python variable's value from the script.
   * Handles: qty = "0.00069", spend = round(...), usdt_amount = round(200 * rate, 2)
   */
  static resolvePyVar(cmd: string, varName: string): string | null {
    // Simple string assignment: varName = "value"
    const strAssign = cmd.match(new RegExp(`${varName}\\s*=\\s*"([^"]+)"`, "m"));
    if (strAssign) return strAssign[1];

    // Simple numeric: varName = 123.45
    const numAssign = cmd.match(new RegExp(`${varName}\\s*=\\s*([0-9]+\\.?[0-9]*)(?:\\s|$|,)`, "m"));
    if (numAssign) return numAssign[1];

    // f-string floor: varName = f"{math.floor(raw/step)*step:.Xf}" — extract raw
    const fFloor = cmd.match(new RegExp(`${varName}\\s*=\\s*f".*math\\.floor\\(([0-9.]+)/([0-9.]+)\\)`, "m"));
    if (fFloor) {
      const raw = parseFloat(fFloor[1]);
      const step = parseFloat(fFloor[2]);
      const decimals = (fFloor[2].split(".")[1] ?? "").length;
      return (Math.floor(raw / step) * step).toFixed(decimals);
    }

    // round(total * pct, 2) — e.g. spend = round(9992.00 * 0.40, 2)
    const roundExpr = cmd.match(new RegExp(`${varName}\\s*=\\s*round\\(([0-9.]+)\\s*\\*\\s*([0-9.]+),\\s*\\d+\\)`, "m"));
    if (roundExpr) return String(Math.round(parseFloat(roundExpr[1]) * parseFloat(roundExpr[2]) * 100) / 100);

    return null;
  }

  static parseParams(cmd: string): URLSearchParams {
    // 1. Bash: BODY="symbol=...&side=...&..."
    const varMatch = cmd.match(/(?:BODY|QS|QUERY)="([^"]+)"/);
    if (varMatch && varMatch[1].includes("symbol=")) {
      const resolved = varMatch[1].replace(/\$([A-Z_]+)/g, (_, v) =>
        this.resolveShellVar(cmd, v) ?? ""
      );
      return new URLSearchParams(resolved);
    }

    // 2. Python dict: {"symbol": "BTCUSDT", "side": "BUY", ...}
    const pyDict = this.parsePythonDict(cmd);
    if (pyDict) return pyDict;

    // 3. Literal -d body
    const bodyMatch = cmd.match(/-d\s+"([^"]+)"/);
    if (bodyMatch && bodyMatch[1].includes("symbol=")) {
      return new URLSearchParams(bodyMatch[1]);
    }

    // 4. URL query string
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
    const price    = p.get("price");

    const amountLine = quantity
      ? `Amount: \`${quantity}\` ${symbol.replace("USDT", "")}`
      : `Spend: \`${quoteQty} USDT\``;

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
