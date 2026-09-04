import sys

with open('e:/SIH-171/frontend/index.html', 'r', encoding='utf8') as f:
    html = f.read()

html = html.replace('popup.css', 'style.css')
html = html.replace('popup.js', 'app.js')

with open('e:/SIH-171/frontend/index.html', 'w', encoding='utf8') as f:
    f.write(html)
