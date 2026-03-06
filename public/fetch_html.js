const fs = require('fs');

async function go() {
    try {
        const res = await fetch("https://www.porikkhok.com/exam/YHl1HiOoNG?teacher=true", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
            }
        });
        const text = await res.text();
        fs.writeFileSync("html_dump.txt", text);
        console.log("Done, saved to html_dump.txt (length: " + text.length + ")");
    } catch (e) {
        console.error(e);
    }
}
go();
