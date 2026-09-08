import sys
from pathlib import Path
sys.path.insert(0, 'D:/Policy PoC/tmp/font-tools')
from fontTools.ttLib import TTFont
root = Path('D:/Policy PoC/src/public/fonts')
for name in ['source-sans-3','source-serif-4','libre-caslon-text','ibm-plex-sans','ibm-plex-serif','inter']:
    source = root / (name + '-400.woff2')
    font = TTFont(source)
    font.flavor = None
    font.save(root / (name + '-400.ttf'))
    print(name)
