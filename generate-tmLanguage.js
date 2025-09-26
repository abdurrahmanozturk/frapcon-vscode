const fs = require('fs');
const path = require('path');

// Paths
const docsPath = path.join(__dirname, 'docs', 'frapconDocs.json');
const tmLanguagePath = path.join(__dirname, 'syntaxes', 'frapcon.tmLanguage.json');

// Load docs
const docs = JSON.parse(fs.readFileSync(docsPath, 'utf-8'));

// Extract variable names
const variableNames = docs.map(v => v.name).join('|');

// Create tmLanguage JSON
const tmLanguage = {
  scopeName: "source.frapcon",
  patterns: [
    {
      name: "comment.line.asterisk.frapcon",
      match: "^\\s*\\*.*$"
    },
    {
      name: "keyword.control.frapcon",
      match: "\\${1,2}(frpcon|frpmox|frpcn|emfpcn|end)\\b"
    },
    {
      name: "variable.parameter.frapcon",
      match: `\\b(${variableNames})\\b`
    },
    {
      name: "constant.numeric.frapcon",
      match: "\\b\\d+(\\.\\d+)?([eE][+-]?\\d+)?\\b"
    },
    {
      name: "keyword.operator.assignment.frapcon",
      match: "="
    },
    {
      name: "punctuation.separator.frapcon",
      match: ","
    }
  ]
};

// Write JSON to file
fs.writeFileSync(tmLanguagePath, JSON.stringify(tmLanguage, null, 2));
console.log(`✅ FRAPCON tmLanguage.json generated with ${docs.length} variables.`);
