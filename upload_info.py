import zipfile
import os
import base64
import json
import urllib.request
import urllib.error

BASE_DIR = r'C:\Users\Administrator\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a76944472f7ee9caa39cfe1'
OWNER = 'SHEN944'
REPO = '-'
BRANCH = 'main'

print(f'工作目录: {BASE_DIR}')
print(f'仓库: {OWNER}/{REPO}')

# 列出文件
files_to_upload = ['index.html', 'app.js', 'standalone.html', 'pack.py']
for fname in files_to_upload:
    fpath = os.path.join(BASE_DIR, fname)
    if os.path.exists(fpath):
        size = os.path.getsize(fpath)
        print(f'  {fname}: {size} bytes ({size//1024} KB)')
    else:
        print(f'  {fname}: 不存在')
