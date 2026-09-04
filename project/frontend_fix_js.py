with open('e:/SIH-171/frontend/app.js', 'r', encoding='utf8') as f:
    js = f.read()

js = js.replace('../lib/', './lib/')

with open('e:/SIH-171/frontend/app.js', 'w', encoding='utf8') as f:
    f.write(js)
