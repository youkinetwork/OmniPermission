import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getKeyPath, saveInterceptedTools, getInterceptedTools } from "./storage.ts";

export const registerOmniCli = (api: OpenClawPluginApi) => {
  api.registerCli(
    ({ program }) => {
      const omni = program.command("omnipermission");

      // --- COMMAND: STATUS ---
      omni
        .command("status")
        .description("Show current Public Key and blacklisted skills")
        .action(async () => {
          const keyPath = getKeyPath(api);
          let keyContent = "❌ NO KEY SAVED";

          try {
            keyContent = await fs.readFile(keyPath, "utf-8");
          } catch (e) {
            // File doesn't exist yet
          }

          const blacklist = await getInterceptedTools(api);

          console.log("\n" + "=".repeat(50));
          console.log("📂 OMNIPERMISSION CONFIGURATION");
          console.log("-".repeat(50));
          console.log(`🔑 PUBLIC KEY:\n${keyContent.trim() || "Empty"}`);
          console.log("-".repeat(50));
          console.log(
            `🚫 BLACKLISTED SKILLS: ${blacklist.length > 0 ? blacklist.join(", ") : "None (Pass-through mode)"}`,
          );
          console.log("=".repeat(50) + "\n");
        });

      // --- COMMAND: SET KEY ---
      omni
        .command("set-key")
        .description("Paste and save your OmniPersona public key")
        .action(async () => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
          });

          console.log("Paste your Public Key below (End with -----END PUBLIC KEY-----):");

          const lines: string[] = [];
          rl.on("line", async (line) => {
            lines.push(line);
            if (line.includes("-----END PUBLIC KEY-----")) {
              const publicKey = lines.join("\n").trim();
              const keyPath = getKeyPath(api);
              await fs.mkdir(path.dirname(keyPath), { recursive: true });
              await fs.writeFile(keyPath, publicKey, "utf-8");
              console.log(`\n✅ Public Key successfully saved to: ${keyPath}`);
              rl.close();
            }
          });
        });

      // --- COMMAND: BLACKLIST TOOLS ---
      omni
        .command("blacklist-tools")
        .description("Set which skills require mobile approval (comma-separated)")
        .action(async () => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const currentTools = await getInterceptedTools(api);
          console.log(
            `\nCurrent Blacklist: ${currentTools.length > 0 ? currentTools.join(", ") : "None"}`,
          );

          console.log("\nType the skill names you want to intercept (e.g. slack, telegram).");
          console.log("Example: slack, telegram, github");

          const answer = await new Promise<string>((resolve) => {
            rl.question("\nNew Blacklist: ", resolve);
          });

          const newList = answer
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          if (newList.length === 0 && currentTools.length > 0) {
            console.log("⚠️ No skills provided. Blacklist remains unchanged.");
          } else {
            await saveInterceptedTools(api, newList);
            console.log(`\n✅ Success! The following skills now require approval:`);
            console.log(`👉 ${newList.join(", ") || "None (All cleared)"}`);
          }

          rl.close();
        });

      // --- COMMAND: CLEAR BLACKLIST ---
      omni
        .command("clear-blacklist")
        .description("Remove all skills from the mobile approval requirement")
        .action(async () => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const confirm = await new Promise<string>((resolve) => {
            rl.question("Are you sure you want to clear the entire blacklist? (y/N): ", resolve);
          });

          if (confirm.toLowerCase() === "y") {
            await saveInterceptedTools(api, []);
            console.log(
              "✅ Blacklist cleared. All skills will now proceed without mobile approval.",
            );
          } else {
            console.log("❌ Operation cancelled.");
          }

          rl.close();
        });
    },
    { commands: ["omni-permission"] },
  );
};
