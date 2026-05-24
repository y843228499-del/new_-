const fs = require('fs');
const path = require('path');
const jszip = require('jszip');

const docxPath = path.join(__dirname, '../集成平台_工业客户端套件用户与技术手册.docx');

fs.readFile(docxPath, function(err, data) {
    if (err) throw err;
    jszip.loadAsync(data).then(function(zip) {
        console.log("=== Dumping document.xml.rels ===");
        zip.file("word/_rels/document.xml.rels").async("string").then(function(text) {
            console.log(text);
        });

        console.log("\n=== Dumping [Content_Types].xml ===");
        zip.file("[Content_Types].xml").async("string").then(function(text) {
            console.log(text);
        });
    });
});
