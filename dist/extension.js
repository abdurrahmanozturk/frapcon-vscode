"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
let currentProcess = null;
let statusBarItem;
function activate(context) {
    console.log("FRAPCON extension activated");
    // Load documentation JSON
    const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
    let docs = [];
    try {
        const docsRaw = fs.readFileSync(docsPath, "utf-8");
        docs = JSON.parse(docsRaw);
    }
    catch (e) {
        console.warn("FRAPCON docs not found or invalid JSON:", e);
    }
    // 🔍 Lookup helpers
    function lookupVariable(name) {
        return docs.find((v) => v.name.toLowerCase() === name.toLowerCase());
    }
    function getRequiredParams(blockName) {
        return docs
            .filter((v) => { var _a; return ((_a = v.inputBlock) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === blockName.toLowerCase() && v.required; })
            .map((v, i) => { var _a; return `${v.name} = \${${i + 1}:${(_a = v.default) !== null && _a !== void 0 ? _a : ""}}`; });
    }
    // -------------------------
    // Block definitions (no $end here)
    // -------------------------
    const blockDocs = [
        { name: "$frpcn", description: "Case control integers block." },
        { name: "$frpcon", description: "Case design and operation descriptors (real + integer variables)." },
        { name: "$emfpcn", description: "Evaluation model options block." },
        { name: "$frpmox", description: "Plutonium isotopic distributions block." }
    ];
    // -------------------------
    // Completion Provider
    // -------------------------
    const completionProvider = vscode.languages.registerCompletionItemProvider({ language: "frapcon" }, {
        provideCompletionItems(document, position) {
            try {
                const linePrefix = document.lineAt(position).text.substring(0, position.character);
                const tokenMatch = linePrefix.match(/[A-Za-z0-9_\$]+$/);
                if (tokenMatch) {
                    const typed = tokenMatch[0].toLowerCase();
                    // ✅ Block suggestions (match includes typed fragment)
                    const blockSuggestions = blockDocs
                        .filter(b => b.name.toLowerCase().includes(typed))
                        .map(b => {
                        const escapedName = b.name.replace(/\$/g, "\\$");
                        const requiredParams = getRequiredParams(b.name).join(",\n\t");
                        const snippetText = requiredParams.length > 0
                            ? `${escapedName}\n\t${requiredParams}\n$0\n\\$end`
                            : `${escapedName}\n\t$0\n\\$end`;
                        // Check if block has required params → mark it as "required block"
                        const hasRequired = docs.some((v) => { var _a; return ((_a = v.inputBlock) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === b.name.toLowerCase() && v.required; });
                        const kind = hasRequired ? vscode.CompletionItemKind.EnumMember : vscode.CompletionItemKind.Module;
                        const item = new vscode.CompletionItem(b.name, kind);
                        item.label = {
                            label: b.name,
                            description: hasRequired ? `Required Block 🔴` : `Optional Block`
                        };
                        item.detail = hasRequired
                            ? "Block contains required parameters"
                            : "Block contains only optional parameters";
                        item.documentation = new vscode.MarkdownString(`**${b.name}**\n\n${b.description}\n\n` +
                            `*This block ${hasRequired ? "**has required parameters 🔴**" : "has only optional parameters"}*`);
                        item.insertText = new vscode.SnippetString(snippetText);
                        const replaceRange = new vscode.Range(position.line, position.character - tokenMatch[0].length, position.line, position.character);
                        item.range = replaceRange;
                        return item;
                    });
                    if (blockSuggestions.length > 0) {
                        return blockSuggestions;
                    }
                }
                // ✅ Variable suggestions (unchanged)
                const items = docs.map((entry) => {
                    var _a, _b;
                    const sortText = (entry.required ? "0" : "1") + (entry.name || "");
                    const kind = entry.required
                        ? vscode.CompletionItemKind.EnumMember
                        : vscode.CompletionItemKind.Variable;
                    const item = new vscode.CompletionItem(entry.name, kind);
                    item.label = {
                        label: entry.name,
                        description: entry.required ? `${entry.inputBlock} 🔴` : (_a = entry.inputBlock) !== null && _a !== void 0 ? _a : ""
                    };
                    item.insertText = entry.name + "=";
                    item.detail = entry.required ? "Required parameter" : "Optional parameter";
                    item.sortText = sortText;
                    item.documentation = new vscode.MarkdownString(`**${entry.name}**\n\n${entry.description}\n\n` +
                        `**Units:** ${entry.units}\n\n` +
                        `**Required:** ${entry.required ? "Yes 🔴" : "No"}\n\n` +
                        `**Default:** ${(_b = entry.default) !== null && _b !== void 0 ? _b : "None"}\n\n` +
                        `**Block:** ${entry.inputBlock}\n\n` +
                        `**Category:** ${entry.category}\n\n` +
                        `**Limitations:** ${entry.limitations}`);
                    return item;
                });
                return items;
            }
            catch (err) {
                console.error("FRAPCON completion error:", err);
                return [];
            }
        }
    }, "$", ".", "f", "r", "p", "c", "n", "m", "o", "x", "e");
    // -------------------------
    // Hover Provider (unchanged)
    // -------------------------
    const hoverProvider = vscode.languages.registerHoverProvider("frapcon", {
        provideHover(document, position) {
            var _a;
            const wordRange = document.getWordRangeAtPosition(position, /\$?[A-Za-z0-9_]+/);
            if (!wordRange)
                return;
            const word = document.getText(wordRange);
            const block = blockDocs.find(b => b.name.toLowerCase() === word.toLowerCase());
            if (block) {
                return new vscode.Hover(new vscode.MarkdownString(`### ${block.name}\n\n${block.description}\n\nEnds with \`$end\`.`));
            }
            const entry = lookupVariable(word);
            if (entry) {
                const md = new vscode.MarkdownString(`### ${entry.name}\n\n` +
                    `*${entry.description}*\n\n` +
                    `**Units:** ${entry.units}\n\n` +
                    `**Required:** ${entry.required ? "Yes" : "No"}\n\n` +
                    `**Default:** ${(_a = entry.default) !== null && _a !== void 0 ? _a : "None"}\n\n` +
                    `**Block:** ${entry.inputBlock}\n\n` +
                    `**Category:** ${entry.category}\n\n` +
                    `**Limitations:** ${entry.limitations}`);
                md.isTrusted = true;
                return new vscode.Hover(md);
            }
            return null;
        }
    });
    // -------------------------
    // Run / Terminate / Status bar logic
    // -------------------------
    const runCommand = vscode.commands.registerCommand("frapcon.run", () => __awaiter(this, void 0, void 0, function* () {
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
        let executablePath = config.get("executablePath");
        if (!executablePath) {
            const selected = yield vscode.window.showInputBox({
                placeHolder: "Enter the full path to FRAPCON executable",
                prompt: "Example: C:\\FRAPCON\\FRAPCON.exe or /usr/local/bin/frapcon",
                ignoreFocusOut: true
            });
            if (!selected) {
                vscode.window.showErrorMessage("FRAPCON executable path is required.");
                return;
            }
            executablePath = selected;
            yield config.update("executablePath", executablePath, vscode.ConfigurationTarget.Global);
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
            currentProcess = (0, child_process_1.spawn)(executablePath, [filePath], {
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
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to run FRAPCON: ${err.message}`);
        }
    }));
    const terminateCommand = vscode.commands.registerCommand("frapcon.terminate", () => {
        if (currentProcess) {
            currentProcess.kill();
            vscode.window.showInformationMessage("FRAPCON terminated.");
            currentProcess = null;
        }
        else {
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
function deactivate() {
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
    }
    else {
        statusBarItem.text = "$(play) Run FRAPCON";
        statusBarItem.tooltip = "Click to run FRAPCON on the active file";
        statusBarItem.command = "frapcon.run";
        vscode.commands.executeCommand("setContext", "frapconRunning", false);
    }
}
//# sourceMappingURL=extension.js.map