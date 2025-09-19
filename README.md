# FRAPCON Support for VS Code

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/aozturk.frapcon-vscode?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=aozturk.frapcon-vscode)
[![GitHub](https://img.shields.io/github/stars/abdurrahmanozturk/frapcon-vscode?style=social)](https://github.com/abdurrahmanozturk/frapcon-vscode)

FRAPCON Support is a Visual Studio Code extension that adds **syntax highlighting, snippets, and IntelliSense** for FRAPCON input files (`.inp`).

FRAPCON is a fuel performance analysis code developed by the U.S. NRC for steady-state fuel rod simulations.

---

## ✨ Features
- ✅ Syntax highlighting for `.inp` FRAPCON input files  
- ✅ Snippets for common input blocks  
- ✅ IntelliSense/autocomplete for FRAPCON parameters  
- ✅ Hover tooltips with documentation (from `frapconDocs.json`)  
- ✅ Sample input cases (standard UO₂, MOX) included  

---

## 📦 Installation
1. Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/).  
   *(Alternatively, clone this repo and build locally with `vsce package`)*

2. Open a `.inp` file — FRAPCON Support will activate automatically.

---

## 🚀 Usage
- Create or open a FRAPCON input file (`.inp`).  
- Type `frapcon` to trigger snippets.  
- Hover over keywords to see documentation.  
- Use IntelliSense (`Ctrl+Space`) to explore available parameters.

---

## 📂 Folder Structure

frapcon-vscode/
├─ src/ # Extension source (TypeScript)
├─ dist/ # Compiled JS
├─ syntaxes/ # TextMate grammar for syntax
├─ snippets/ # FRAPCON input snippets
├─ language-configuration.json
├─ frapconDocs.json # Parameter docs for IntelliSense
├─ package.json
├─ tsconfig.json
├─ README.md
└─ LICENSE.md