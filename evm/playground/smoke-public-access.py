"""Download Pulse documents, then verify and read saved files with networking disabled."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import socket
import tempfile
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', nargs='?', default='https://pulse.inshell.art')
parser.add_argument('--ids', nargs='+', help='download selected IDs only (default: all indexed static sources)')
parser.add_argument('--save-dir', type=Path, help='authorized directory for downloads; defaults to a temporary workspace')
parser.add_argument('--offline-dir', type=Path, help='read a previous download workspace without any network access')
args = parser.parse_args()


def entries(index):
    result = index['documents'] + index['releases'] + index['projectContext']
    ids = set()
    for entry in result:
        assert re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', entry['id']), 'Unsafe document ID'
        assert entry['id'] not in ids, 'Duplicate document ID'
        ids.add(entry['id'])
        assert entry['download']['url'] == '/docs/documents/' + entry['id'] + '.json'
    return result


def download(directory):
    base = args.base.rstrip('/')
    assert urllib.parse.urlparse(base).scheme in {'http', 'https'}
    opener = urllib.request.build_opener()  # Ordinary HTTP, Python's default User-Agent.
    def get(url, media_type):
        with opener.open(url, timeout=25) as response:
            assert response.status == 200, url
            assert response.headers.get_content_type() == media_type, url
            assert response.headers['X-Content-Type-Options'] == 'nosniff', url
            content = response.read()
        with opener.open(urllib.request.Request(url, method='HEAD'), timeout=25) as response:
            assert response.status == 200 and response.read() == b'', url
            assert response.headers.get_content_type() == media_type, url
        return content
    directory.mkdir(parents=True, exist_ok=True)
    index_url = base + '/docs/agent-index.json'
    (directory / 'agent-index.json').write_bytes(get(index_url, 'application/json'))
    index = json.loads((directory / 'agent-index.json').read_bytes())
    sources = entries(index)
    selected = set(args.ids) if args.ids else {e['id'] for e in sources}
    assert selected <= {e['id'] for e in sources}, 'Unknown selected document ID'
    for entry in sources:
        if entry['id'] not in selected:
            continue
        url = urllib.parse.urljoin(index_url, entry['download']['url'])
        raw = get(url, entry['download']['mediaType'])
        (directory / (entry['id'] + '.download.json')).write_bytes(raw)
    (directory / 'download-session.json').write_text(json.dumps({'indexUrl': index_url, 'ids': sorted(selected)}))


def disable_network():
    def denied(*args, **kwargs):
        raise RuntimeError('Network disabled during local document analysis')
    socket.socket = denied
    socket.create_connection = denied
    socket.getaddrinfo = denied
    urllib.request.urlopen = denied
    # Prove the network guard is active without sending a request.
    try:
        socket.create_connection(('example.invalid', 443))
    except RuntimeError as error:
        assert str(error).startswith('Network disabled')
    else:
        raise AssertionError('Offline network guard failed')


def analyze_local(directory):
    index = json.loads((directory / 'agent-index.json').read_bytes())
    assert index['schema'] == 'pulse.public-knowledge-index/v1'
    session = json.loads((directory / 'download-session.json').read_bytes())
    selected = set(session['ids'])
    sources = entries(index)
    assert selected <= {e['id'] for e in sources}
    count = 0
    for entry in sources:
        if entry['id'] not in selected:
            continue
        descriptor = entry['download']
        raw = (directory / (entry['id'] + '.download.json')).read_bytes()
        assert len(raw) == descriptor['byteLength'], entry['id']
        assert hashlib.sha256(raw).hexdigest() == descriptor['sha256'], entry['id']
        doc = json.loads(raw)
        assert doc['schema'] == descriptor['schema'] == 'pulse.public-document/v1'
        assert doc['id'] == entry['id'] and doc['source']['url'] == entry['url']
        assert doc['source'].get('commit') == entry.get('sourceCommit')
        assert doc['contentFormat'] in {'markdown', 'json'}
        content = doc['content'].encode('utf-8')
        assert hashlib.sha256(content).hexdigest() == doc['source']['sha256'] == entry['sha256'], entry['id']
        assert doc['revision'] == 'sha256:' + entry['sha256']
        assert not doc['assets'], 'This client covers the current ten text-only sources; companion media needs a reviewed extension'
        suffix = '.md' if doc['contentFormat'] == 'markdown' else '.json'
        extracted = directory / (entry['id'] + suffix)
        extracted.write_bytes(content)
        # Read and search local source text. Do not execute examples or pricing code.
        text = extracted.read_bytes().decode('utf-8')
        if entry['id'] == 'core-api':
            assert all(term in text for term in ['initialize', 'quote', 'advance', 'floorPrice'])
        if entry['id'] == 'core-abi':
            assert any(item.get('name') == 'advance' for item in json.loads(text))
        count += 1
    assert count == len(selected)
    print(f'PASS: {count} complete downloads verified and analyzed from local files; '
          'source and file hashes match; all network access disabled during analysis; no website runtime or RPC required.')


if args.offline_dir:
    assert not args.save_dir and not args.ids, '--offline-dir uses the recorded selection'
    disable_network()
    analyze_local(args.offline_dir)
elif args.save_dir:
    download(args.save_dir)
    disable_network()
    analyze_local(args.save_dir)
else:
    with tempfile.TemporaryDirectory(prefix='pulse-documents-') as workspace:
        directory = Path(workspace)
        download(directory)
        disable_network()
        analyze_local(directory)
