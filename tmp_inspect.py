import urllib.request,re
html=urllib.request.urlopen('https://daricomma.com/create-exam/exam-paper/190656').read().decode('utf-8','ignore')
print('idx',html.find('190656'),html.find('exam-paper'),html.find('api'))
urls=re.findall(r'https?://[^"\']+',html)
print('urls',urls[:20])
for s in re.findall(r'/_next/static/[^"\']+',html):
    print(s)
