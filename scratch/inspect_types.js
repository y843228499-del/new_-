const fs = require('fs');
const path = require('path');

const dtsPath = path.join(__dirname, '../node_modules/docx/dist/index.d.ts');
if (!fs.existsSync(dtsPath)) {
    console.error("index.d.ts not found at:", dtsPath);
    process.exit(1);
}

const dts = fs.readFileSync(dtsPath, 'utf8');

function findDefinition(name) {
    console.log(`=== Searching for ${name} ===`);
    const classRegex = new RegExp(`(class|interface|type|const)\\s+${name}[\\s\\S]*?(\\n\\}|;\\n)`, 'g');
    const matches = dts.match(classRegex);
    if (matches) {
        matches.forEach(m => console.log(m));
    } else {
        const lines = dts.split('\n');
        const matchedLines = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(name)) {
                matchedLines.push(`${i+1}: ${lines[i]}`);
            }
        }
        console.log(`Lines containing "${name}":`);
        console.log(matchedLines.slice(0, 15).join('\n'));
    }
}

findDefinition('ISectionProperties');
findDefinition('IPageMargin');
findDefinition('IPageMarginAttributes');




