import hashlib, json, sys, urllib.request, urllib.error
# Match browser requests to the lab gateway. smoke-public-access.py separately
# verifies public discovery using Python's unmodified default user agent.
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'Mozilla/5.0 (Pulse site smoke test)')]
urllib.request.install_opener(opener)
base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:4173'
def get(path):
    with urllib.request.urlopen(base+path,timeout=20) as r:
        assert r.status==200
        return r.read()
def call(body,header=True):
    headers={'Content-Type':'application/json'}
    if header: headers['X-Pulse-Playground']='1'
    req=urllib.request.Request(base+'/api/call',data=json.dumps(body).encode(),headers=headers)
    with urllib.request.urlopen(req,timeout=25) as r: return json.load(r)
paths=['/', '/projects', '/projects/', '/app.js', '/projects.js', '/agent.js', '/styles.css', '/favicon.svg', '/robots.txt', '/projects.json', '/docs/agent-index.json', '/docs/agent-prompt.txt', '/docs/pulse.md', '/docs/playground.md']
pages={path:get(path) for path in paths}
assert all(pages.values())
index=json.loads(pages['/docs/agent-index.json'])
assert index['schema']=='pulse.public-knowledge-index/v1'
assert index['answerPolicy']['forbidStateChanges']
for entry in index['documents']+index['projectContext']:
    if entry['url'].startswith('/'):
        assert hashlib.sha256(pages[entry['url']]).hexdigest()==entry['sha256']
for path in ['/docs/agent-index.json', '/docs/agent-prompt.txt', '/docs/pulse.md', '/docs/playground.md']:
    with urllib.request.urlopen(urllib.request.Request(base+path,method='HEAD'),timeout=20) as r:
        assert r.status==200 and r.read()==b''
status=json.loads(get('/api/status'));assert status['verified'] and status['chainId']==11155111
config={'k':'600','genesisPrice':'1000','genesisFloor':'900','pts':'1'}
initial=call({'function':'initialize','config':config,'startTime':'1000'})['state']
assert initial==dict(epochIndex='0',openTime='1000',curveStartTime='1000',anchorTime='994',floorPrice='900')
assert call({'function':'quote','config':config,'state':initial,'timestamp':'1010'})['ask']=='937'
next=call({'function':'advance','config':config,'state':initial,'timestamp':'1000'})
assert next['ask']=='1000' and next['nextState']['floorPrice']=='1000'
assert call({'function':'quote','config':config,'state':next['nextState'],'timestamp':'1000'})['ask']=='1001'
for body,header,expected in [({},False,403),({'function':'initialize','config':{**config,'k':'-1'},'startTime':'1000'},True,400),({'function':'sendTransaction','config':config},True,400)]:
    try: call(body,header);raise AssertionError('Unexpected acceptance')
    except urllib.error.HTTPError as e:
        assert e.code==expected
        text=e.read().decode();assert 'https://' not in text
print(f'PASS: {len(paths)} site routes; agent document digests and HEAD; verified Sepolia identity; initialize/quote/advance/next quote; 3 invalid-request checks.')
