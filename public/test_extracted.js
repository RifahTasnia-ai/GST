const fs = require('fs');
try {
    const p = "C:/Users/Sadik_AI/.gemini/antigravity/brain/6f31571c-9c7b-40c6-b69f-81009b6794aa/browser/extracted.json";
    let buf = fs.readFileSync(p);
    let str = buf.toString('utf16le');
    if (!str.startsWith('[')) str = buf.toString('utf8');

    const data = JSON.parse(str);
    console.log(JSON.stringify(data[0], null, 2));
} catch (e) {
    console.error(e);
}
