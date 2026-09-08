from pathlib import Path
import json,zipfile,hashlib
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'manifest.json').read_text())['version']
dest=root/'dist';dest.mkdir(exist_ok=True)
archive=dest/f'fomo-monitor-v{version}.zip'
paths=[root/'manifest.json',root/'README.md',root/'RELEASE_NOTES.md',root/'CHANGELOG.md',root/'接口说明.md']
for folder in ['src','icons']:paths.extend(p for p in (root/folder).rglob('*') if p.is_file() and not p.name.startswith('.'))
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(paths):
  info=zipfile.ZipInfo('fomo-monitor/'+p.relative_to(root).as_posix(),date_time=(2026,1,1,0,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,p.read_bytes())
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.with_suffix('.zip.sha256')).write_text(checksum+'  '+archive.name+'\n')
print(archive.name,checksum)
