import urllib.request, re, json
u='https://daricomma.com/create-exam/exam-paper/190656'
html=urllib.request.urlopen(u,timeout=30).read().decode('utf-8','ignore')
print('len',len(html),'next', '__NEXT_DATA__' in html)
m=re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',html,re.S)
print('has_next_data',bool(m))
if m:
    data=m.group(1)
    print(data[:300])
