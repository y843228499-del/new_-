const edsContent = `
[Connection Manager]
Object_Name = "Connection Manager Object";
Object_Class_Code = 0x06;
Connection1 =
    0x04010002,
    0x44640405,
    Param1,24,Assem2,    $ O->T RPI, size, format
    Param1,24,Assem1,    $ T->O RPI, size, format
    ,,                   $ proxy config size, format
    48,Assem3,           $ target config size, format
    "Exclusive Owner",   $ connection name
    "",                  $ help string
    "20 04 24 66 2C 64 2C 65"; $ path
`;

const cleanContent = edsContent.replace(/\$.*$/gm, '');
const connRegex = /Connection\d+\s*=\s*([^;]+);/gi;
let match;
while ((match = connRegex.exec(cleanContent)) !== null) {
    const parts = match[1].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.trim());
    console.log("Parts length:", parts.length);
    parts.forEach((p, i) => console.log(`[${i}]: ${p}`));
}
