from pathlib import Path
from urllib.parse import urlsplit
import re,secrets,os
root=Path(__file__).resolve().parents[1];p=root/'.env'
assert p.is_file(),'先完成网站升级，确认本目录已有 .env'
u=input('独立 LiteAvatar HTTPS 地址（例如 https://avatar.example.com/ui/index.html）：').strip()
a=urlsplit(u);assert a.scheme=='https' and a.netloc and not a.username and not a.password and not a.query and not a.fragment,'必须是无凭证、无查询参数的 HTTPS 地址'
t=p.read_text();m=re.search(r'^OAC_BRIDGE_KEY=(.+)$',t,re.M);k=m.group(1).strip() if m and len(m.group(1).strip())>=32 else secrets.token_hex(32)
b=root/'backups';b.mkdir(exist_ok=True);old=b/'env-before-oac';
if not old.exists():old.write_text(t);old.chmod(0o600)
for name,value in {'OAC_ENABLED':'1','OAC_BRIDGE_KEY':k,'OAC_LITEAVATAR_URL':u}.items():
 t=re.sub(r'^'+name+r'=.*\n?', '',t,flags=re.M).rstrip()+'\n'+name+'='+value+'\n'
p.write_text(t);p.chmod(0o600);key=b/'oac-bridge-key.txt';key.write_text(k+'\n');key.chmod(0o600)
print('配置已写入。桥接密钥保存在：',key,'。仅复制到你的独立推理服务器，不要发到聊天或截图。重建 app 容器后生效。')
