const fs = require('fs');
const srcPath = 'C:/Users/Sadik_AI/.gemini/antigravity/brain/6f31571c-9c7b-40c6-b69f-81009b6794aa/browser/extracted.json';
let buf = fs.readFileSync(srcPath);
let str = buf.toString('utf8');
if (str.includes('\0')) {
    str = buf.toString('utf16le');
}
str = str.trim();
if (str.startsWith("```json")) {
    str = str.replace(/^```json/, '').replace(/```$/, '').trim();
}
const data = JSON.parse(str);
console.log(JSON.stringify(data[0], null, 2));
