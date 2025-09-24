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
    // --- Optional: documentation loading for IntelliSense (safe-guarded) ---
    const docsPath = path.join(context.extensionPath, "docs", "frapconDocs.json");
    let docs = [];
    try {
        if (fs.existsSync(docsPath)) {
            docs = JSON.parse(fs.readFileSync(docsPath, "utf-8"));
        }
    }
    catch (e) {
        console.warn("FRAPCON docs could not be loaded:", e);
    }
    function lookupVariable(name) {
        return docs.find(v => { var _a, _b; return ((_b = (_a = v === null || v === void 0 ? void 0 : v.name) === null || _a === void 0 ? void 0 : _a.toLowerCase) === null || _b === void 0 ? void 0 : _b.call(_a)) === name.toLowerCase(); });
    }
    // --- Completion Provider ---
    const completionProvider = vscode.languages.registerCompletionItemProvider({ language: "frapcon" }, {
        provideCompletionItems() {
            return (docs || []).map(entry => {
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
    }, ".");
    // --- Hover Provider ---
    const hoverProvider = vscode.languages.registerHoverProvider("frapcon", {
        provideHover(document, position) {
            var _a;
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
            if (!wordRange)
                return;
            const word = document.getText(wordRange);
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
        }
    });
    // --- Utilities ---
    // Parse a simple shell-like arg string into tokens (handles quotes)
    function parseArgString(argLine) {
        if (!argLine || !argLine.trim())
            return [];
        const args = [];
        let cur = "";
        let quote = null;
        for (let i = 0; i < argLine.length; i++) {
            const ch = argLine[i];
            if (quote) {
                if (ch === quote) {
                    quote = null;
                }
                else if (ch === "\\" && argLine[i + 1] === quote) {
                    cur += quote;
                    i++;
                }
                else {
                    cur += ch;
                }
            }
            else {
                if (ch === '"' || ch === "'") {
                    quote = ch;
                }
                else if (/\s/.test(ch)) {
                    if (cur) {
                        args.push(cur);
                        cur = "";
                    }
                }
                else {
                    cur += ch;
                }
            }
        }
        if (cur)
            args.push(cur);
        return args;
    }
    function normalizeExe(p) {
        // Keep as-is for POSIX; normalize backslashes for Windows convenience
        return process.platform === "win32" ? p.replace(/\//g, "\\") : p;
    }
    function ensureExecutableIfNeeded(exe, output) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (process.platform === "win32")
                return true; // Windows doesn't use X bit
            try {
                yield fs.promises.access(exe, fs.constants.X_OK);
                return true;
            }
            catch (_b) {
                // Try to chmod +x automatically
                try {
                    yield fs.promises.chmod(exe, 0o755);
                    output.appendLine(`Set executable bit on: ${exe}`);
                    return true;
                }
                catch (e) {
                    output.appendLine(`Could not set execute permission on: ${exe}\n${String((_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : e)}`);
                    vscode.window.showWarningMessage(`FRAPCON executable may not be runnable. Set execute permission manually:\n` +
                        `  chmod +x "${exe}"`);
                    return false;
                }
            }
        });
    }
    function computeCwd(mode, filePath, exePath) {
        var _a, _b;
        const ws = (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath;
        switch (mode) {
            case "executableFolder": return path.dirname(exePath);
            case "workspaceFolder": return ws;
            case "custom":
                return vscode.workspace.getConfiguration("frapcon").get("customWorkingDirectory") || path.dirname(filePath);
            case "inputFolder":
            default: return path.dirname(filePath);
        }
    }
    // --- Run FRAPCON Command ---
    const runCommand = vscode.commands.registerCommand("frapcon.run", () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
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
            const saved = yield document.save();
            if (!saved) {
                vscode.window.showWarningMessage("Please save the file before running FRAPCON.");
                return;
            }
        }
        // Read settings
        const cfg = vscode.workspace.getConfiguration("frapcon");
        let executablePath = cfg.executablePath;
        if (!executablePath) {
            const picked = yield vscode.window.showInputBox({
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
            yield vscode.workspace.getConfiguration("frapcon")
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
        const ok = yield ensureExecutableIfNeeded(exe, output);
        if (!ok && process.platform !== "win32") {
            // Still try to run, but warn user
            output.appendLine("Proceeding to run; if this fails, fix permissions as suggested above.");
        }
        // Build args
        const extraArgs = parseArgString(cfg.additionalArgs);
        const args = [...extraArgs, filePath];
        const cwd = computeCwd(cfg.workingDirectory, filePath, exe);
        output.appendLine(`   Working dir: ${cwd || "(VS Code default)"}`);
        if (extraArgs.length)
            output.appendLine(`   Additional args: ${extraArgs.join(" ")}`);
        output.appendLine("");
        try {
            // ❗ No shell: this avoids quoting issues on Windows/PowerShell/cmd
            const child = (0, child_process_1.spawn)(exe, args, {
                cwd,
                shell: false,
                windowsHide: true
            });
            (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on("data", d => output.append(d.toString()));
            (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on("data", d => output.append(`ERROR: ${d.toString()}`));
            child.on("error", (err) => {
                var _a, _b;
                output.appendLine(`\nProcess error: ${String((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err)}`);
                if (process.platform === "darwin") {
                    output.appendLine(`\nmacOS note: If the binary is blocked by Gatekeeper, you may need:\n` +
                        `  xattr -d com.apple.quarantine "${exe}"\n` +
                        `or allow it in System Settings > Privacy & Security.`);
                }
                vscode.window.showErrorMessage(`Failed to start FRAPCON: ${String((_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : err)}`);
            });
            child.on("close", (code) => {
                output.appendLine(`\nFRAPCON finished with exit code ${code}`);
                if (process.platform === "win32") {
                    output.appendLine(`\nTip (PowerShell): & "${exe}" "${filePath}"\n` +
                        `Tip (cmd.exe):    "${exe}" "${filePath}"`);
                }
            });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to run FRAPCON: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : err}`);
        }
    }));
    context.subscriptions.push(completionProvider, hoverProvider, runCommand);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map