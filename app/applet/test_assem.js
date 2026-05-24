const edsContent = `
[Assembly]
        Object_Name = "Assembly Object";
        Object_Class_Code = 0x04;
        Assem1 =
                "Input I/O Messages",
                ,
                ,
                0x0000,
                ,,
                16,Param100,
                16,Param101,
                16,Param102;
`;

const cleanContent = edsContent.replace(/\$.*$/gm, '');
const assemRegex = /Assem(\d+)\s*=\s*([^;]+);/gi;
let match;
while ((match = assemRegex.exec(cleanContent)) !== null) {
    const id = parseInt(match[1]);
    const parts = match[2].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.trim());
    console.log("Assem ID:", id);
    console.log("Parts:", parts);
    
    const members = [];
    for (let i = 6; i < parts.length; i += 2) {
        if (parts[i] && parts[i+1]) {
            members.push({
                bitSize: parseInt(parts[i]),
                paramId: parseInt(parts[i+1].replace(/Param/i, ''))
            });
        }
    }
    console.log("Members:", members);
}
