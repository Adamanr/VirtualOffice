"""Downloads the Rocketbox avatars and clips convert.py needs (run in an empty folder)."""
import json, os, sys, urllib.request, urllib.parse
API = 'https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents/'
RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/'
def ls(p):
    with urllib.request.urlopen(API + urllib.parse.quote(p)) as r: return json.load(r)
def get(path, dest):
    if os.path.exists(dest): return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(RAW + urllib.parse.quote(path), dest + '.part'); os.rename(dest + '.part', dest)
    print('got', dest, os.path.getsize(dest) // 1024, 'K', flush=True)
avatars = [('Professions', f'Business_Male_0{i}') for i in (1,2,3,4)] + [('Professions', f'Business_Female_0{i}') for i in (1,2,3,4)] \
  + [('Adults', 'Male_Adult_01'), ('Adults', 'Male_Adult_03'), ('Adults', 'Female_Adult_01'), ('Adults', 'Female_Adult_03')]
ONLY_ANIMS = len(sys.argv) > 1 and sys.argv[1] == 'anims'
for group, name in ([] if ONLY_ANIMS else avatars):
    base = f'Assets/Avatars/{group}/{name}'
    get(f'{base}/Export/{name}.fbx', f'avatars/{name}/{name}.fbx')
    for t in ls(f'{base}/Textures'):
        if 'color' in t['name'] or 'opacity' in t['name']:
            get(t['path'], f"avatars/{name}/{t['name']}")
anims = {'static': ['idle_neutral_01', 'sit_chair_idle_neutral_01', 'wave_01', 'drink_drinking'], 'xy': ['walk_neutral', 'run_neutral']}
for folder, names in anims.items():
    for g in 'mf':
        for n in names:
            f = f'{g}_{n}.max.fbx'
            get(f'Assets/Animations/all_animations_max_motextr_{folder}/{f}', f'anims/{f}')
print('done')
