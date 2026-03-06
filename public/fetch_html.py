import urllib.request
try:
    req = urllib.request.Request("https://www.porikkhok.com/exam/YHl1HiOoNG?teacher=true", headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    with open('html_dump.txt', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Done")
except Exception as e:
    print(e)
