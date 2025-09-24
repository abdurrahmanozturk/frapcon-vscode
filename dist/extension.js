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
function activate(context) {
    console.log("FRAPCON extension activated");
    // Load documentation JSON
    const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
    const docsRaw = fs.readFileSync(docsPath, "utf-8");
    const docs = JSON.parse(docsRaw); // Expecting an array of variable objects
    // 🔍 Helper function to find variable info
    function lookupVariable(name) {
        return docs.find(v => v.name.toLowerCase() === name.toLowerCase());
    }
    // 🧠 Completion Provider
    const completionProvider = vscode.languages.registerCompletionItemProvider({ language: "frapcon" }, {
        provideCompletionItems() {
            return docs.map(entry => {
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
        }
    }, "." // Trigger completion after typing a dot or manually
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
        }
    });
    // 📤 Run FRAPCON Command
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
        // Ask for path if not set
        if (!executablePath) {
            const selected = yield vscode.window.showInputBox({
                placeHolder: "Enter the full path to FRAPCON executable",
                prompt: "Example: C:\\FRAPCON\\FRAPCON3_4a.exe or /usr/local/bin/frapcon",
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
            const child = (0, child_process_1.spawn)(executablePath, [inputFileName], {
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
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to run FRAPCON: ${err.message}`);
        }
    }));
    // 📦 Register providers and commands
    context.subscriptions.push(completionProvider, hoverProvider, runCommand);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map