import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";

type WorkingDirMode = "inputFolder" | "executableFolder" | "workspaceFolder" | "custom";

interface FrapconSettings {
  executablePath?: string;
  additionalArgs?: string;        // e.g. --flag1 --flag2="value with space"
  workingDirectory?: WorkingDirMode;
  customWorkingDirectory?: string;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("FRAPCON extension activated");

  // --- Optional: documentation loading for IntelliSense (safe-guarded) ---
  const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
  let docs: any[] = [];
  try {
    if (fs.existsSync(docsPath)) {
      docs = JSON.parse(fs.readFileSync(docsPath, "utf-8"));
    }
  } catch (e) {
    console.warn("FRAPCON docs could not be loaded:", e);
  }

  function lookupVariable(name: string) {
    return docs.find(v => v?.name?.toLowerCase?.() === name.toLowerCase());
  }

  // --- Completion Provider ---
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: "frapcon" },
    {
      provideCompletionItems() {
        return (docs || []).map(entry => {
          const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Variable);
          item.insertText = entry.name + "=";
          item.documentation = new vscode.MarkdownString(
            `**${entry.name}**\n\n${entry.description}\n\n` +
              `**Units:** ${entry.units}\n` +
              `**Required:** ${entry.required ? "Yes" : "No"}\n` +
              `**Default:** ${entry.default ?? "None"}\n` +
              `**Block:** ${entry.inputBlock}\n` +
              `**Category:** ${entry.category}\n` +
              `**Limitations:** ${entry.limitations}`
          );
          return item;
        });
      }
    },
    "."
  );

  // --- Hover Provider ---
  const hoverProvider = vscode.languages.registerHoverProvider("frapcon", {
    provideHover(document, position) {
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (!wordRange) return;
      const word = document.getText(wordRange);
      const entry = lookupVariable(word);
      if (entry) {
        const md = new vscode.MarkdownString(
          `### ${entry.name}\n\n` +
            `*${entry.description}*\n\n` +
            `**Units:** ${entry.units}\n\n` +
            `**Required:** ${entry.required ? "Yes" : "No"}\n\n` +
            `**Default:** ${entry.default ?? "None"}\n\n` +
            `**Block:** ${entry.inputBlock}\n\n` +
            `**Category:** ${entry.category}\n\n` +
            `**Limitations:** ${entry.limitations}`
        );
        md.isTrusted = true;
        return new vscode.Hover(md);
      }
    }
  });

  // --- Utilities ---

  // Parse a simple shell-like arg string into tokens (handles quotes)
  function parseArgString(argLine: string | undefined): string[] {
    if (!argLine || !argLine.trim()) return [];
    const args: string[] = [];
    let cur = "";
    let quote: '"' | "'" | null = null;

    for (let i = 0; i < argLine.length; i++) {
      const ch = argLine[i];
      if (quote) {
        if (ch === quote) {
          quote = null;
        } else if (ch === "\\" && argLine[i + 1] === quote) {
          cur += quote; i++;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (/\s/.test(ch)) {
          if (cur) { args.push(cur); cur = ""; }
        } else {
          cur += ch;
        }
      }
    }
    if (cur) args.push(cur);
    return args;
  }

  function normalizeExe(p: string) {
    // Keep as-is for POSIX; normalize backslashes for Windows convenience
    return process.platform === "win32" ? p.replace(/\//g, "\\") : p;
  }

  async function ensureExecutableIfNeeded(exe: string, output: vscode.OutputChannel) {
    if (process.platform === "win32") return true; // Windows doesn't use X bit

    try {
      await fs.promises.access(exe, fs.constants.X_OK);
      return true;
    } catch {
      // Try to chmod +x automatically
      try {
        await fs.promises.chmod(exe, 0o755);
        output.appendLine(`Set executable bit on: ${exe}`);
        return true;
      } catch (e: any) {
        output.appendLine(`Could not set execute permission on: ${exe}\n${String(e?.message ?? e)}`);
        vscode.window.showWarningMessage(
          `FRAPCON executable may not be runnable. Set execute permission manually:\n` +
          `  chmod +x "${exe}"`
        );
        return false;
      }
    }
  }

  function computeCwd(
    mode: WorkingDirMode | undefined,
    filePath: string,
    exePath: string
  ): string | undefined {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    switch (mode) {
      case "executableFolder": return path.dirname(exePath);
      case "workspaceFolder":  return ws;
      case "custom":
        return vscode.workspace.getConfiguration("frapcon").get<string>("customWorkingDirectory") || path.dirname(filePath);
      case "inputFolder":
      default: return path.dirname(filePath);
    }
  }

  // --- Run FRAPCON Command ---
  const runCommand = vscode.commands.registerCommand("frapcon.run", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found to run FRAPCON.");
      return;
    }

    const document = editor.document;
    const filePath = document.uri.fsPath;

    // Accept by languageId OR by .inp extension
    const isFrapconLang = document.languageId === "frapcon";
    const isInp = filePath.toLowerCase().endsWith(".inp");
    if (!isFrapconLang && !isInp) {
      vscode.window.showErrorMessage("FRAPCON can only run on FRAPCON input files (e.g., .inp).");
      return;
    }

    // Save unsaved changes
    if (document.isDirty) {
      const saved = await document.save();
      if (!saved) {
        vscode.window.showWarningMessage("Please save the file before running FRAPCON.");
        return;
      }
    }

    // Read settings
    const cfg = vscode.workspace.getConfiguration("frapcon") as unknown as FrapconSettings;
    let executablePath = cfg.executablePath;

    if (!executablePath) {
      const picked = await vscode.window.showInputBox({
        placeHolder: process.platform === "win32"
          ? "C:\\FRAPCON\\FRAPCON3_4a.exe"
          : "/usr/local/bin/frapcon",
        prompt: "Enter the full path to the FRAPCON executable",
        ignoreFocusOut: true
      });
      if (!picked) {
        vscode.window.showErrorMessage("FRAPCON executable path is required.");
        return;
      }
      executablePath = picked;
      await vscode.workspace.getConfiguration("frapcon")
        .update("executablePath", executablePath, vscode.ConfigurationTarget.Global);
    }

    const exe = normalizeExe(executablePath);
    if (!fs.existsSync(exe)) {
      vscode.window.showErrorMessage(`FRAPCON executable not found:\n${exe}`);
      return;
    }
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`Input file not found:\n${filePath}`);
      return;
    }

    const output = vscode.window.createOutputChannel("FRAPCON");
    output.clear();
    output.show(true);
    output.appendLine("▶ Running FRAPCON (cross‑platform)");
    output.appendLine(`   Executable: ${exe}`);
    output.appendLine(`   Input file: ${filePath}`);

    // Ensure executable bit on POSIX
    const ok = await ensureExecutableIfNeeded(exe, output);
    if (!ok && process.platform !== "win32") {
      // Still try to run, but warn user
      output.appendLine("Proceeding to run; if this fails, fix permissions as suggested above.");
    }

    // Build args
    const extraArgs = parseArgString(cfg.additionalArgs);
    const args = [...extraArgs, filePath];

    const cwd = computeCwd(cfg.workingDirectory, filePath, exe);
    output.appendLine(`   Working dir: ${cwd || "(VS Code default)"}`);
    if (extraArgs.length) output.appendLine(`   Additional args: ${extraArgs.join(" ")}`);
    output.appendLine("");

    try {
      // ❗ No shell: this avoids quoting issues on Windows/PowerShell/cmd
      const child = spawn(exe, args, {
        cwd,
        shell: false,
        windowsHide: true
      });

      child.stdout?.on("data", d => output.append(d.toString()));
      child.stderr?.on("data", d => output.append(`ERROR: ${d.toString()}`));

      child.on("error", (err) => {
        output.appendLine(`\nProcess error: ${String(err?.message ?? err)}`);
        if (process.platform === "darwin") {
          output.appendLine(
            `\nmacOS note: If the binary is blocked by Gatekeeper, you may need:\n` +
            `  xattr -d com.apple.quarantine "${exe}"\n` +
            `or allow it in System Settings > Privacy & Security.`
          );
        }
        vscode.window.showErrorMessage(`Failed to start FRAPCON: ${String(err?.message ?? err)}`);
      });

      child.on("close", (code) => {
        output.appendLine(`\nFRAPCON finished with exit code ${code}`);
        if (process.platform === "win32") {
          output.appendLine(
            `\nTip (PowerShell): & "${exe}" "${filePath}"\n` +
            `Tip (cmd.exe):    "${exe}" "${filePath}"`
          );
        }
      });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to run FRAPCON: ${err?.message ?? err}`);
    }
  });

  context.subscriptions.push(completionProvider, hoverProvider, runCommand);
}

export function deactivate() {}
