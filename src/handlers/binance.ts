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

  static parsePythonDict(cmd: string): URLSearchParams | null {
    const dictMatch = cmd.match(/\{([^{}]*"symbol"\s*:\s*"[^"]*"[^{}]*)\}/);
    if (!dictMatch) return null;

    const p = new URLSearchParams();
    const body = dictMatch[1];

    for (const [, key, val] of body.matchAll(/"(\w+)"\s*:\s*"([^"]+)"/g)) {
      p.set(key, val);
    }

    for (const [, key, varName] of body.matchAll(/"(\w+)"\s*:\s*str\((\w+)\)/g)) {
      const resolved = this.resolvePyVar(cmd, varName);
      if (resolved) p.set(key, resolved);
    }

    for (const [, key, varName] of body.matchAll(/"(\w+)"\s*:\s*([a-zA-Z_]\w*)(?=\s*[,}])/g)) {
      if (!p.has(key)) {
        const resolved = this.resolvePyVar(cmd, varName);
        if (resolved) p.set(key, resolved);
      }
    }

    return p.has("symbol") ? p : null;
  }

  static resolvePyVar(cmd: string, varName: string): string | null {
    const strAssign = cmd.match(new RegExp(`${varName}\\s*=\\s*"([^"]+)"`, "m"));
    if (strAssign) return strAssign[1];

    const numAssign = cmd.match(new RegExp(`${varName}\\s*=\\s*([0-9]+\\.?[0-9]*)(?:\\s|$|,)`, "m"));
    if (numAssign) return numAssign[1];

    const fFloor = cmd.match(new RegExp(`${varName}\\s*=\\s*f".*math\\.floor\\(([0-9.]+)/([0-9.]+)\\)`, "m"));
    if (fFloor) {
      const raw = parseFloat(fFloor[1]);
      const step = parseFloat(fFloor[2]);
      const decimals = (fFloor[2].split(".")[1] ?? "").length;
      return (Math.floor(raw / step) * step).toFixed(decimals);
    }

    const roundExpr = cmd.match(new RegExp(`${varName}\\s*=\\s*round\\(([0-9.]+)\\s*\\*\\s*([0-9.]+),\\s*\\d+\\)`, "m"));
    if (roundExpr) return String(Math.round(parseFloat(roundExpr[1]) * parseFloat(roundExpr[2]) * 100) / 100);

    return null;
  }

  static parseParams(cmd: string): URLSearchParams {
    // FIX 1: added PARAMS to the variable name alternatives
    const varMatch = cmd.match(/(?:BODY|QS|QUERY|PARAMS)="([^"]+)"/);
    if (varMatch && varMatch[1].includes("symbol=")) {
      // FIX 2: handle both $VAR and ${VAR} shell expansion styles
      const resolved = varMatch[1].replace(/\$\{?([A-Z_]+)\}?/g, (_, v) => {
        // FIX 3: skip TIMESTAMP — not useful for the confirmation UI
        if (v === "TIMESTAMP") return "";
        return this.resolveShellVar(cmd, v) ?? "";
      });
      const p = new URLSearchParams(resolved);
      // FIX 3 cont: clean up any dangling empty timestamp param
      p.delete("timestamp");
      return p;
    }

    const pyDict = this.parsePythonDict(cmd);
    if (pyDict) return pyDict;

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

    const symbol = p.get("symbol") ?? "?";
    const side = p.get("side") ?? "?";
    const type = p.get("type") ?? "?";
    const quantity = p.get("quantity");
    const quoteQty = p.get("quoteOrderQty");
    const price = p.get("price");

    const amountLine = quantity
      ? `\`${quantity}\` ${symbol.replace("USDT", "")}`
      : `\`${quoteQty} USDT\``;

    let priceLine: string;
    if (price) {
      priceLine = `\`${price}\``;
    } else {
      const marketPrice = await BinanceHandler.fetchMarketPrice(symbol);
      priceLine = marketPrice
        ? `\`${marketPrice}\` _(live market)_`
        : "`MARKET`";
    }

    const emoji = side === "BUY" ? "🟢" : "🔴";

    return [
      `### ${emoji} Binance Trade About to Execute`,
      `---`,
      `| Field | Value |`,
      `| :--- | :--- |`,
      `| **Side** | ${side} |`,
      `| **Symbol** | ${symbol} |`,
      `| **Amount** | ${amountLine} |`,
      `| **Price** | ${priceLine} |`,
      `| **Type** | \`${type}\` |`,
      `---`,
      `**Do you approve this action?**`,
    ].join("\n");
  }
}
