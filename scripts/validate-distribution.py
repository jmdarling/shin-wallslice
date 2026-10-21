"""Structural distribution checks; CA Validate/Scan and live URL checks are separate."""
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

root = Path(__file__).resolve().parent.parent
image = 'ghcr.io/jmdarling/shin-wallslice'
template = ET.parse(root / 'templates/shin-wallslice.xml').getroot()
assert template.tag == 'Container' and template.attrib['version'] == '2'
expected = {'Name': 'shin-wallslice', 'Repository': image + ':1',
            'Network': 'bridge', 'Privileged': 'false', 'WebUI': 'http://[IP]:[PORT:3000]/'}
for tag, value in expected.items():
    assert template.findtext(tag) == value, tag
for tag in ['Support', 'Project', 'TemplateURL', 'Icon']:
    assert template.findtext(tag).startswith('https://'), tag
configs = {c.attrib['Target']: c for c in template.findall('Config')}
assert configs['3000'].attrib['Type'] == 'Port'
assert configs['/data'].attrib['Mode'] == 'rw'
assert configs['SHIN_WALLSLICE_AI_ENABLED'].text == 'false'
assert not any('PUID' in c or 'PGID' in c for c in configs)
assert '--user=0:0' in template.findtext('ExtraParams')
profile = ET.parse(root / 'ca_profile.xml').getroot()
assert profile.tag == 'CommunityApplications' and profile.findtext('Profile').strip()
assert profile.findtext('Icon') == template.findtext('Icon')
ET.parse(root / 'docs/assets/icon.svg')
assert 'MIT License' in (root / 'LICENSE').read_text()
for file in ['package.json', 'packages/client/package.json', 'packages/server/package.json']:
    assert json.loads((root / file).read_text())['version'] == '1.0.0', file
assert image + ':1.0.0' in (root / 'compose.yaml').read_text()
assert 'build:' not in (root / 'compose.yaml').read_text()
for file in (root / '.github/workflows').glob('*.yml'):
    for use in re.findall(r'uses:\s*([^\s#]+)', file.read_text()):
        assert use.startswith('./') or re.fullmatch(r'[^@]+@[a-f0-9]{40}', use), (file, use)
# Check repository-relative Markdown links; external links need anonymous verification.
for file in [root / 'README.md', root / 'CONTRIBUTING.md', * (root / 'docs/maintainers').glob('*.md'), root / 'docs/unraid.md']:
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
        target = target.split('#')[0]
        if not target or re.match(r'[a-z]+:', target):
            continue
        assert (file.parent / target).exists(), (file, target)
print('Distribution XML, profile, icon, versions, pinned actions, Compose, and local documentation links passed.')
