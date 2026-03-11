import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Storage } from "./storage.ts";
import { SupportedTools } from "./models/supported-tools.ts";

export const registerOmniCli = (api: OpenClawPluginApi) => {
  api.registerCli(
    ({ program }) => {
      const omni = program.command("omnipermission");

      // --- COMMAND: STATUS ---
      omni
        .command("status")
        .description("Show current Secret Key and blacklisted skills")
        .action(async () => {
          const keyPath = Storage.getKeyPath(api);
          let keyContent = "❌ NO SECRET KEY SAVED";

          try {
            keyContent = await fs.readFile(keyPath, "utf-8");
          } catch (e) {
            // File doesn't exist yet
          }

          const blacklist = await Storage.getInterceptedTools(api);

          console.log("\n" + "=".repeat(50));
          console.log("📂 OMNIPERMISSION CONFIGURATION");
          console.log("-".repeat(50));
          console.log(`🔑 SECRET KEY:\n${keyContent.trim() || "Empty"}`);
          console.log("-".repeat(50));
          console.log(
            `🚫 BLACKLISTED SKILLS: ${blacklist.length > 0 ? blacklist.join(", ") : "None (Pass-through mode)"}`,
          );
          console.log("=".repeat(50) + "\n");
        });

      // --- COMMAND: SET KEY ---
      omni
        .command("set-key")
        .description("Paste and save your OmniPersona secret key")
        .action(async () => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          // Standard one-line input
          const uuid = await new Promise<string>((resolve) => {
            rl.question("Paste your secret key: ", (answer) => {
              resolve(answer.trim());
            });
          });

          if (!uuid) {
            console.log("❌ Error: No secret key provided.");
            rl.close();
            return;
          }

          // Use your storage utility instead of direct fs calls
          await Storage.saveKey(api, uuid);

          console.log(`\n✅ secret key successfully saved`);
          rl.close();
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

          // 1. Define available options and the wiki link
          const availableOptions = Object.values(SupportedTools).filter(
            (t) => t !== SupportedTools.unsupported
          );
          const wikiLink = "https://github.com/your-repo/omni-permission/wiki/Supported-Tools";

          // 2. Print initial guidance
          console.log(`\n--- 🛠️  OmniPermission Configuration ---`);
          console.log(`Supported tools: ${availableOptions.join(", ")}`);
          console.log(`Learn more at: ${wikiLink}`);
          console.log(`----------------------------------------`);

          const currentTools = await Storage.getInterceptedTools(api);
          console.log(`\nCurrent Blacklist: ${currentTools.length > 0 ? currentTools.join(", ") : "None"}`);

          const answer = await new Promise<string>((resolve) => {
            rl.question("\nEnter new blacklist (comma-separated): ", resolve);
          });

          // 3. Parse and validate against the SupportedTools enum
          const rawList = answer.split(",").map((t) => t.trim().toLowerCase());
          
          const validatedList = rawList
            .filter((t) => Object.values(SupportedTools).includes(t as SupportedTools))
            .filter((t) => t !== SupportedTools.unsupported) as SupportedTools[];

          const rejected = rawList.filter(
            (t) => t && !Object.values(SupportedTools).includes(t as SupportedTools)
          );

          // 4. Feedback and Persistence
          if (rejected.length > 0) {
            console.log(`⚠️  Ignoring unsupported items: ${rejected.join(", ")}`);
          }

          if (validatedList.length === 0 && rawList.some(t => t !== "")) {
            console.log("❌ No valid supported tools were provided. Blacklist unchanged.");
          } else {
            await Storage.saveInterceptedTools(api, validatedList);
            console.log(`\n✅ Success! The following skills now require approval:`);
            console.log(`👉 ${validatedList.join(", ") || "None (All cleared)"}`);
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
            await Storage.saveInterceptedTools(api, []);
            console.log(
              "✅ Blacklist cleared. All skills will now proceed without mobile approval.",
            );
          } else {
            console.log("❌ Operation cancelled.");
          }

          rl.close();
        });

      // --- COMMAND: ENABLE DEV MODE ---
      omni
        .command("enable-dev-mode")
        .description("Switch OmniPermission to use the DEV backend")
        .action(async () => {
          await Storage.saveMode(api, "dev");
          console.log("🛠️  OmniPermission: DEV mode enabled.");
        });

      // --- COMMAND: DISABLE DEV MODE ---
      omni
        .command("disable-dev-mode")
        .description("Switch OmniPermission to use the PROD backend")
        .action(async () => {
          await Storage.saveMode(api, "prod");
          console.log("🚀 OmniPermission: PROD mode enabled.");
        });
    },
    { commands: ["omnipermission"] },
  );
};
