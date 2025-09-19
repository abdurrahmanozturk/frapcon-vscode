import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

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

  // 📦 Register providers
  context.subscriptions.push(completionProvider, hoverProvider);
}

export function deactivate() {}