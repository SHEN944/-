import zipfile
import os

base = r'C:\Users\Administrator\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a76944472f7ee9caa39cfe1'
zip_path = os.path.join(base, '旅途手账-旅行攻略生成器.zip')

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for fname in ['standalone.html', 'index.html', 'app.js', 'styles.css']:
        fpath = os.path.join(base, fname)
        if os.path.exists(fpath):
            zf.write(fpath, fname)
            print(f'Added: {fname} ({os.path.getsize(fpath)} bytes)')

size = os.path.getsize(zip_path)
print(f'\n打包完成: {zip_path}')
print(f'文件大小: {size} bytes ({size // 1024} KB)')
