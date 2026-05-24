const fs = require('fs');
const path = require('path');
const jszip = require('jszip');

const docxPath = path.join(__dirname, '../集成平台_工业客户端套件用户与技术手册.docx');
if (!fs.existsSync(docxPath)) {
    console.error("Docx file not found!");
    process.exit(1);
}

fs.readFile(docxPath, function(err, data) {
    if (err) throw err;
    jszip.loadAsync(data).then(function(zip) {
        console.log("=== Zip files found ===");
        const fileNames = Object.keys(zip.files);
        fileNames.forEach(name => {
            console.log(`- ${name} (size: ${zip.files[name]._data.uncompressedSize})`);
        });

        // Let's inspect word/document.xml
        const docXmlFile = zip.file("word/document.xml");
        if (docXmlFile) {
            docXmlFile.async("string").then(function(xmlText) {
                console.log("\n=== word/document.xml length: ===", xmlText.length);
                
                // Let's check for basic XML well-formedness (matching tags)
                // We can write a simple tag stack validator
                const tagRegex = /<(\/)?([a-zA-Z0-9:]+)([^>]*?)(\/)?>/g;
                let match;
                const stack = [];
                let errorCount = 0;
                let pos = 0;

                while ((match = tagRegex.exec(xmlText)) !== null) {
                    const [fullTag, isClosing, tagName, attrs, isSelfClosing] = match;
                    if (isSelfClosing) {
                        continue;
                    }
                    if (isClosing) {
                        const top = stack.pop();
                        if (top !== tagName) {
                            console.error(`XML Error: Mismatched tag at pos ${match.index}. Expected closing for "${top}", but got "</${tagName}>". Context: ${xmlText.slice(Math.max(0, match.index-100), match.index+100)}`);
                            errorCount++;
                            if (errorCount > 10) break;
                        }
                    } else {
                        stack.push(tagName);
                    }
                }

                if (stack.length > 0 && errorCount <= 10) {
                    console.error("XML Error: Unclosed tags remaining on stack:", stack);
                } else if (errorCount === 0) {
                    console.log("[OK] XML Tag Stack is perfectly matched!");
                }
            });
        } else {
            console.error("word/document.xml NOT found inside docx zip!");
        }
    }).catch(err => {
        console.error("Failed to load jszip:", err);
    });
});
