const fs = require('fs');
const lines = fs.readFileSync('C:/Users/84322/.gemini/antigravity/brain/1b83c754-69c2-417c-a241-8fc5d77cf87e/.system_generated/logs/transcript.jsonl', 'utf8').split('\n');
lines.forEach(l => {
    if (!l) return;
    const obj = JSON.parse(l);
    if (obj.type === 'CODE_ACTION' && obj.content.includes('eip-class1.js') && obj.created_at >= '2026-05-24T06:56:00Z' && obj.created_at <= '2026-05-24T07:40:00Z') {
        console.log("Time:", obj.created_at);
        console.log(obj.content);
        console.log("-----------------");
    }
});
