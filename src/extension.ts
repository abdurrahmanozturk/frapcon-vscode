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
  let docs: any[] = [];
  try {
    const docsRaw = fs.readFileSync(docsPath, "utf-8");
    docs = JSON.parse(docsRaw);
  } catch (e) {
    console.warn("FRAPCON docs not found or invalid JSON:", e);
  }

  // 🔍 Lookup helpers
  function lookupVariable(name: string) {
    return docs.find((v: any) => v.name.toLowerCase() === name.toLowerCase());
  }
  function getRequiredParams(blockName: string) {
    return docs
      .filter((v: any) => v.inputBlock?.toLowerCase() === blockName.toLowerCase() && v.required)
      .map((v: any, i: number) => `${v.name} = \${${i + 1}:${v.default ?? ""}}`);
  }

  // -------------------------
  // Block definitions (no $end here)
  // -------------------------
  const blockDocs: { name: string; description: string }[] = [
    { name: "$frpcn", description: "Case control integers block." },
    { name: "$frpcon", description: "Case design and operation descriptors (real + integer variables)." },
    { name: "$emfpcn", description: "Evaluation model options block." },
    { name: "$frpmox", description: "Plutonium isotopic distributions block." }
  ];

  // -------------------------
  // Completion Provider (variables, blocks, header snippet)
  // -------------------------
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: "frapcon" },
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        try {
          const linePrefix = document.lineAt(position).text.substring(0, position.character);
          const tokenMatch = linePrefix.match(/[A-Za-z0-9_\$]+$/);

          const items: vscode.CompletionItem[] = [];

          // ===== HEADER SNIPPET =====
          const headerSnippet = new vscode.CompletionItem("header", vscode.CompletionItemKind.File);
          headerSnippet.insertText = new vscode.SnippetString(
            `*=====================================================================*\n` +
              `*            FRAPCON3.4 - Steady-State Fuel Rod Analysis Code         *\n` +
              `*=====================================================================*\n` +
              `*-----------------------------Input Files-----------------------------*\n` +
              `FILE05='nullfile',\n\tSTATUS='UNKNOWN',\n\tFORM='FORMATTED',\n\tCARRIAGE CONTROL='NONE'\n` +
              `*-----------------------------Output Files----------------------------*\n` +
              `FILE06='\${1:case}.out',\n\tSTATUS='UNKNOWN',\n\tCARRIAGE CONTROL='LIST'\n` +
              `FILE66='\${1:case}.plot',\n\tSTATUS='UNKNOWN',\n\tFORM='FORMATTED',\n\tCARRIAGE CONTROL='LIST'\n` +
              `*=====================================================================*\n` +
              `/************************ Case : \${2:Name (max 72 chars)} ************************/\n` +
              `*=====================================================================*\n` +
              `\n`
          );
          headerSnippet.detail = "FRAPCON input header (file setup + case description)";
          headerSnippet.documentation = new vscode.MarkdownString(
            "Inserts the required file setup lines (`FILE05`, `FILE06`, `FILE66`), the `/*********` separator, " +
              "and a placeholder for the case description. These lines must precede all `$frpcn`, `$frpcon`, `$emfpcn`, `$frpmox` blocks."
          );
          items.push(headerSnippet);

          // ===== BLOCKS =====
          if (tokenMatch) {
            const typed = tokenMatch[0].toLowerCase();
            const blockSuggestions = blockDocs
              .filter(b => b.name.toLowerCase().includes(typed))
              .map(b => {
                // Escape block name ONLY for snippet syntax
                const blockName = b.name.replace(/\$/g, "\\$");

                // Get required params
                const rawParams = docs
                  .filter((v: any) => v.inputBlock?.toLowerCase() === b.name.toLowerCase() && v.required)
                  .map((v: any, i: number) => ({
                    name: v.name,
                    snippet: `${v.name} = \${${i + 1}:${v.default ?? ""}}`
                  }));

                // Align "=" by padding names
                let paramsText = "";
                if (rawParams.length > 0) {
                  const maxLen = Math.max(...rawParams.map(p => p.name.length));
                  paramsText = rawParams
                    .map((p, i) => {
                      const pad = " ".repeat(maxLen - p.name.length);
                      const line =
                        `${p.name}${pad} = \${${i + 1}:${docs.find(v => v.name === p.name)?.default ?? ""}}` +
                        (i < rawParams.length - 1 ? "," : ",$0");
                      return line;
                    })
                    .join("\n\t");
                } else {
                  paramsText = "$0";
                }

                // ✅ Block name + aligned params + $end
                const snippetText = `${blockName}\n\t${paramsText}\n\\$end`;

                const hasRequired = rawParams.length > 0;

                const kind = hasRequired
                  ? vscode.CompletionItemKind.EnumMember
                  : vscode.CompletionItemKind.Module;

                const item = new vscode.CompletionItem(b.name, kind);

                (item as any).label = {
                  label: b.name,
                  description: hasRequired ? `Required Block 🔴` : `Optional Block`
                };

                item.detail = hasRequired
                  ? "Block contains required parameters"
                  : "Block contains only optional parameters";

                item.documentation = new vscode.MarkdownString(
                  `**${b.name}**\n\n${b.description}\n\n` +
                    `*This block ${hasRequired ? "**has required parameters 🔴**" : "has only optional parameters"}*`
                );

                item.insertText = new vscode.SnippetString(snippetText);

                const replaceRange = new vscode.Range(
                  position.line,
                  position.character - tokenMatch[0].length,
                  position.line,
                  position.character
                );
                (item as any).range = replaceRange;

                return item;
              });
            items.push(...blockSuggestions);
          }

          // ===== VARIABLES =====
          const variableItems: vscode.CompletionItem[] = docs.map((entry: any) => {
            const sortText = (entry.required ? "0" : "1") + (entry.name || "");
            const kind = entry.required
              ? vscode.CompletionItemKind.EnumMember
              : vscode.CompletionItemKind.Variable;

            const item = new vscode.CompletionItem(entry.name, kind);
            (item as any).label = {
              label: entry.name,
              description: entry.required ? `${entry.inputBlock} 🔴` : entry.inputBlock ?? ""
            };
            item.insertText = entry.name + "=";
            item.detail = entry.required ? "Required parameter" : "Optional parameter";
            item.sortText = sortText;
            item.documentation = new vscode.MarkdownString(
              `**${entry.name}**\n\n${entry.description}\n\n` +
                `**Units:** ${entry.units}\n\n` +
                `**Required:** ${entry.required ? "Yes 🔴" : "No"}\n\n` +
                `**Default:** ${entry.default ?? "None"}\n\n` +
                `**Block:** ${entry.inputBlock}\n\n` +
                `**Category:** ${entry.category}\n\n` +
                `**Limitations:** ${entry.limitations}`
            );
            return item;
          });
          items.push(...variableItems);

          return items;
        } catch (err) {
          console.error("FRAPCON completion error:", err);
          return [];
        }
      }
    },
    "$", ".", "f", "r", "p", "c", "n", "m", "o", "x", "e", "h"
  );

  // -------------------------
  // Hover Provider (includes FILE05/06/66 help)
  // -------------------------
  const hoverProvider = vscode.languages.registerHoverProvider("frapcon", {
    provideHover(document: vscode.TextDocument, position: vscode.Position) {
      const wordRange = document.getWordRangeAtPosition(position, /\$?[A-Za-z0-9_]+/);
      if (!wordRange) return;
      const word = document.getText(wordRange);

      // Special-case FILE05/06/66
      if (word.toUpperCase() === "FILE05") {
        return new vscode.Hover(
          new vscode.MarkdownString("**FILE05**: Creates the `nullfile`, required for FRAPCON-3.3/3.4.")
        );
      }
      if (word.toUpperCase() === "FILE06") {
        return new vscode.Hover(
          new vscode.MarkdownString("**FILE06**: Specifies the output file (default: `case.out`).")
        );
      }
      if (word.toUpperCase() === "FILE66") {
        return new vscode.Hover(
          new vscode.MarkdownString(
            "**FILE66**: Specifies the optional plot file (default: `case.plot`). Used if NPLOT is set."
          )
        );
      }

      const block = blockDocs.find(b => b.name.toLowerCase() === word.toLowerCase());
      if (block) {
        return new vscode.Hover(
          new vscode.MarkdownString(`### ${block.name}\n\n${block.description}\n\nEnds with \`$end\`.`)
        );
      }

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
      return null;
    }
  });

  // -------------------------
  // Run / Terminate / Status bar logic
  // -------------------------
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
        prompt: "Example: C:\\FRAPCON\\FRAPCON.exe or /usr/local/bin/frapcon",
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
    outputChannel.appendLine(`FRAPCON Executable: ${executablePath}`);
    outputChannel.appendLine(`Working Directory : ${filePath}`);
    outputChannel.appendLine(`Input File        : ${inputFileName}\n`);
    outputChannel.appendLine(`------------------------------------\n`);
    
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
        updateStatusBar();
      });

      updateStatusBar();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to run FRAPCON: ${err.message}`);
    }
  });

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

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "frapcon.run";
  context.subscriptions.push(statusBarItem);
  updateStatusBar();
  statusBarItem.show();

  context.subscriptions.push(completionProvider, hoverProvider, runCommand, terminateCommand);
}

export function deactivate() {
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
  }
}

function updateStatusBar() {
  if (currentProcess) {
    statusBarItem.text = "$(debug-stop) Terminate FRAPCON";
    statusBarItem.tooltip = "Click to terminate FRAPCON";
    statusBarItem.command = "frapcon.terminate";
    vscode.commands.executeCommand("setContext", "frapconRunning", true);
  } else {
    statusBarItem.text = "$(play) Run FRAPCON";
    statusBarItem.tooltip = "Click to run FRAPCON on the active file";
    statusBarItem.command = "frapcon.run";
    vscode.commands.executeCommand("setContext", "frapconRunning", false);
  }
}
