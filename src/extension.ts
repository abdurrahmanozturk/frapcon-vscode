import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";

let currentProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log("FRAPCON extension activated");

  // Load documentation JSON
  const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
  const docsRaw = fs.readFileSync(docsPath, "utf-8");
  const docs: any[] = JSON.parse(docsRaw);

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
    "." // Trigger completion after typing a dot
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

  // ▶ Run FRAPCON Command
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
    const inputFileName = path.basename(filePath);
    if (!fs.existsSync(executablePath)) {
      vscode.window.showErrorMessage(`FRAPCON executable not found at: ${executablePath}`);
      return;
    }

    const outputChannel = vscode.window.createOutputChannel("FRAPCON");
    outputChannel.show(true);
    outputChannel.appendLine(`▶ Running FRAPCON on: ${filePath}`);
    outputChannel.appendLine(`▶ Input file: ${inputFileName}`);
    outputChannel.appendLine(`▶ Executable: ${executablePath}\n`);
    outputChannel.appendLine("----- FRAPCON OUTPUT -----\n");

    try {
      if (currentProcess) {
        currentProcess.kill();
        currentProcess = null;
      }

      currentProcess = spawn(executablePath, [filePath], {
        cwd: path.dirname(filePath),
        shell: true
      });

      if (currentProcess.stdout) {
        currentProcess.stdout.on("data", data => {
          outputChannel.append(data.toString());
        });
      }

      if (currentProcess.stderr) {
        currentProcess.stderr.on("data", data => {
          outputChannel.append(`ERROR: ${data.toString()}`);
        });
      }

      currentProcess.on("close", code => {
        outputChannel.appendLine(`\nFRAPCON finished with exit code ${code}`);
        currentProcess = null;
        updateStatusBar(); // Reset to Run
      });

      updateStatusBar(); // Switch to Stop

    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to run FRAPCON: ${err.message}`);
    }
  });

  // ⏹ Terminate FRAPCON Command
  const terminateCommand = vscode.commands.registerCommand("frapcon.terminate", () => {
    if (currentProcess) {
      currentProcess.kill();
      vscode.window.showInformationMessage("FRAPCON terminated.");
      currentProcess = null;
    } else {
      vscode.window.showWarningMessage("FRAPCON is not running.");
    }
    updateStatusBar();
  });

  // ⚡ Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "frapcon.run"; // default
  context.subscriptions.push(statusBarItem);
  updateStatusBar();
  statusBarItem.show();

  // 📦 Register providers and commands
  context.subscriptions.push(completionProvider, hoverProvider, runCommand, terminateCommand);
}

export function deactivate() {
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
  }
}

// 🔄 Update status bar text & command

function updateStatusBar() {
  if (currentProcess) {
    // Update status bar
    statusBarItem.text = "$(debug-stop) Terminate FRAPCON";
    statusBarItem.tooltip = "Click to terminate FRAPCON";
    statusBarItem.command = "frapcon.terminate";

    // Set VS Code context → used by package.json "when"
    vscode.commands.executeCommand("setContext", "frapconRunning", true);
  } else {
    statusBarItem.text = "$(play) Run FRAPCON";
    statusBarItem.tooltip = "Click to run FRAPCON on the active file";
    statusBarItem.command = "frapcon.run";

    vscode.commands.executeCommand("setContext", "frapconRunning", false);
  }
}

