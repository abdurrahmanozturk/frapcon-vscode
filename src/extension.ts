import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";

export function activate(context: vscode.ExtensionContext) {
  console.log("FRAPCON extension activated");

  // Load documentation JSON
  const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
  const docsRaw = fs.readFileSync(docsPath, "utf-8");
  const docs: any[] = JSON.parse(docsRaw); // Expecting an array of variable objects

  // 🔍 Helper function to find variable info
  function lookupVariable(name: string) {
    return docs.find(v => v.name.toLowerCase() === name.toLowerCase());
  }

  // 🧠 Completion Provider
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: "frapcon" },
    {
      provideCompletionItems() {
        return docs.map(entry => {
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
    "." // Trigger completion after typing a dot or manually
  );

  // 🖱️ Hover Provider
  const hoverProvider = vscode.languages.registerHoverProvider("frapcon", {
    provideHover(document, position) {
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (!wordRange) return;
      const word = document.getText(wordRange);
      const entry = lookupVariable(word);
      if (entry) {
        const markdown = new vscode.MarkdownString(
          `### ${entry.name}\n\n` +
          `*${entry.description}*\n\n` +
          `**Units:** ${entry.units}\n\n` +
          `**Required:** ${entry.required ? "Yes" : "No"}\n\n` +
          `**Default:** ${entry.default ?? "None"}\n\n` +
          `**Block:** ${entry.inputBlock}\n\n` +
          `**Category:** ${entry.category}\n\n` +
          `**Limitations:** ${entry.limitations}`
        );
        markdown.isTrusted = true;
        return new vscode.Hover(markdown);
      }
    }
  });

  // 📤 Run FRAPCON Command
  const runCommand = vscode.commands.registerCommand("frapcon.run", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found to run FRAPCON.");
      return;
    }

    const document = editor.document;
    if (document.languageId !== "frapcon") {
      vscode.window.showErrorMessage("FRAPCON can only run on .inp (FRAPCON) files.");
      return;
    }

    const config = vscode.workspace.getConfiguration("frapcon");
    let executablePath: string | undefined = config.get("executablePath");

    // Ask for path if not set
    if (!executablePath) {
      const selected = await vscode.window.showInputBox({
        placeHolder: "Enter the full path to FRAPCON executable",
        prompt: "Example: C:\\FRAPCON\\FRAPCON3_4a.exe or /usr/local/bin/frapcon",
        ignoreFocusOut: true
      });

      if (!selected) {
        vscode.window.showErrorMessage("FRAPCON executable path is required.");
        return;
      }

      executablePath = selected;
      await config.update("executablePath", executablePath, vscode.ConfigurationTarget.Global);
    }

    const filePath = document.fileName;
    const workingDir = path.dirname(filePath);
    const inputFileName = path.basename(filePath);

    // Output channel
    const outputChannel = vscode.window.createOutputChannel("FRAPCON");
    outputChannel.show(true);
    outputChannel.appendLine(`▶ Executable: ${executablePath}\n`);
    outputChannel.appendLine(`▶ Working directory: ${workingDir}`);
    outputChannel.appendLine(`▶ Input file: ${inputFileName}`);

    try {
      // ✅ Run with cwd set, only filename passed
      const child = spawn(executablePath, [inputFileName], {
        cwd: workingDir,
        shell: process.platform === "win32" ? "cmd.exe" : true
      });

      if (child.stdout) {
        child.stdout.on("data", data => {
          outputChannel.append(data.toString());
        });
      }

      if (child.stderr) {
        child.stderr.on("data", data => {
          outputChannel.append(`ERROR: ${data.toString()}`);
        });
      }

      child.on("close", code => {
        outputChannel.appendLine(`\nFRAPCON finished with exit code ${code}`);
        // outputChannel.appendLine(`Output files should be in: ${workingDir}`);
      });

    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to run FRAPCON: ${err.message}`);
    }
  });

  // 📦 Register providers and commands
  context.subscriptions.push(completionProvider, hoverProvider, runCommand);
}

export function deactivate() {}
