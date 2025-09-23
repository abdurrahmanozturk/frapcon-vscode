import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export function activate(context: vscode.ExtensionContext) {
  console.log("FRAPCON extension activated");

  // 🔹 Output Channel for FRAPCON
  const outputChannel = vscode.window.createOutputChannel("FRAPCON");

  // 📌 Load documentation JSON
  const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
  const docsRaw = fs.readFileSync(docsPath, "utf-8");
  const docs: any[] = JSON.parse(docsRaw);

  // 🔍 Helper function to find variable info
  function lookupVariable(name: string) {
    return docs.find((v) => v.name.toLowerCase() === name.toLowerCase());
  }

  // 🧠 Completion Provider
  const completionProvider =
    vscode.languages.registerCompletionItemProvider(
      { language: "frapcon" },
      {
        provideCompletionItems() {
          return docs.map((entry) => {
            const item = new vscode.CompletionItem(
              entry.name,
              vscode.CompletionItemKind.Variable
            );
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
        },
      },
      "." // Trigger completion
    );

  // 🖱️ Hover Provider
  const hoverProvider = vscode.languages.registerHoverProvider("frapcon", {
    provideHover(document, position) {
      const wordRange = document.getWordRangeAtPosition(
        position,
        /[A-Za-z0-9_]+/
      );
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
    },
  });

  // ▶️ Run FRAPCON Command
  const runCommand = vscode.commands.registerCommand("frapcon.run", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No FRAPCON input file open.");
      return;
    }

    const document = editor.document;
    const filePath = document.fileName;

    // 🔹 Get FRAPCON executable path from settings
    let exePath = vscode.workspace
      .getConfiguration("frapcon")
      .get<string>("executablePath");

    if (!exePath) {
      // Ask user the first time
      exePath = await vscode.window.showInputBox({
        prompt: "Enter the full path to the FRAPCON executable",
        placeHolder:
          "C:\\FRAPCON\\frapcon.exe  or  /usr/local/bin/frapcon",
      });

      if (!exePath) {
        vscode.window.showErrorMessage(
          "FRAPCON executable path is required to run."
        );
        return;
      }

      // Save path to user settings
      await vscode.workspace
        .getConfiguration("frapcon")
        .update("executablePath", exePath, vscode.ConfigurationTarget.Global);
    }

    // 🔹 Output logs
    outputChannel.clear();
    outputChannel.appendLine("=== Running FRAPCON ===");
    outputChannel.appendLine(`Executable: ${exePath}`);
    outputChannel.appendLine(`Input file: ${filePath}`);
    outputChannel.show(true);

    // 🔹 Run in a new Terminal
    const terminal = vscode.window.createTerminal("FRAPCON");
    terminal.show();
    terminal.sendText(`"${exePath}" "${filePath}"`);

    vscode.window.showInformationMessage(
      "FRAPCON started. Check Output panel and Terminal for progress."
    );
  });

  // 📦 Register everything
  context.subscriptions.push(completionProvider, hoverProvider, runCommand);
}

export function deactivate() {}
