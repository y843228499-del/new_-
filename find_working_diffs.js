const fs = require('fs');
const lines = fs.readFileSync('C:/Users/84322/.gemini/antigravity/brain/1b83c754-69c2-417c-a241-8fc5d77cf87e/.system_generated/logs/transcript.jsonl', 'utf8').split('\n');
let output = '';
lines.forEach(l => {
    if (!l) return;
    const obj = JSON.parse(l);
    if (obj.type === 'CODE_ACTION' && obj.content.includes('eip-class1') && obj.created_at >= '2026-05-24T06:20:00Z' && obj.created_at <= '2026-05-24T06:55:00Z') {
        output += "Time: " + obj.created_at + "\n";
        output += obj.content + "\n";
        output += "-----------------\n";
    }
});
fs.writeFileSync('d:/soft_kaifa/集成平台/1/eip_class1_diffs_working.txt', output, 'utf8');
