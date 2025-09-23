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
function activate(context) {
    console.log("FRAPCON extension activated");
    // 🔹 Output Channel for FRAPCON
    const outputChannel = vscode.window.createOutputChannel("FRAPCON");
    // 📌 Load documentation JSON
    const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
    const docsRaw = fs.readFileSync(docsPath, "utf-8");
    const docs = JSON.parse(docsRaw);
    // 🔍 Helper function to find variable info
    function lookupVariable(name) {
        return docs.find((v) => v.name.toLowerCase() === name.toLowerCase());
    }
    // 🧠 Completion Provider
    const completionProvider = vscode.languages.registerCompletionItemProvider({ language: "frapcon" }, {
        provideCompletionItems() {
            return docs.map((entry) => {
                var _a;
                const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Variable);
                item.insertText = entry.name + "=";
                item.documentation = new vscode.MarkdownString(`**${entry.name}**\n\n${entry.description}\n\n` +
                    `**Units:** ${entry.units}\n` +
                    `**Required:** ${entry.required ? "Yes" : "No"}\n` +
                    `**Default:** ${(_a = entry.default) !== null && _a !== void 0 ? _a : "None"}\n` +
                    `**Block:** ${entry.inputBlock}\n` +
                    `**Category:** ${entry.category}\n` +
                    `**Limitations:** ${entry.limitations}`);
                return item;
            });
        },
    }, "." // Trigger completion
    );
    // 🖱️ Hover Provider
    const hoverProvider = vscode.languages.registerHoverProvider("frapcon", {
        provideHover(document, position) {
            var _a;
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
            if (!wordRange)
                return;
            const word = document.getText(wordRange);
            const entry = lookupVariable(word);
            if (entry) {
                const markdown = new vscode.MarkdownString(`### ${entry.name}\n\n` +
                    `*${entry.description}*\n\n` +
                    `**Units:** ${entry.units}\n\n` +
                    `**Required:** ${entry.required ? "Yes" : "No"}\n\n` +
                    `**Default:** ${(_a = entry.default) !== null && _a !== void 0 ? _a : "None"}\n\n` +
                    `**Block:** ${entry.inputBlock}\n\n` +
                    `**Category:** ${entry.category}\n\n` +
                    `**Limitations:** ${entry.limitations}`);
                markdown.isTrusted = true;
                return new vscode.Hover(markdown);
            }
        },
    });
    // ▶️ Run FRAPCON Command
    const runCommand = vscode.commands.registerCommand("frapcon.run", () => __awaiter(this, void 0, void 0, function* () {
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
            .get("executablePath");
        if (!exePath) {
            // Ask user the first time
            exePath = yield vscode.window.showInputBox({
                prompt: "Enter the full path to the FRAPCON executable",
                placeHolder: "C:\\FRAPCON\\frapcon.exe  or  /usr/local/bin/frapcon",
            });
            if (!exePath) {
                vscode.window.showErrorMessage("FRAPCON executable path is required to run.");
                return;
            }
            // Save path to user settings
            yield vscode.workspace
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
        vscode.window.showInformationMessage("FRAPCON started. Check Output panel and Terminal for progress.");
    }));
    // 📦 Register everything
    context.subscriptions.push(completionProvider, hoverProvider, runCommand);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map