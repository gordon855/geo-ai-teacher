#!/usr/bin/env python3
"""Run inside the existing OpenAvatarChat venv. Does not install dependencies or replace working config."""
import argparse,json,shutil,os
from pathlib import Path
from urllib.parse import urlsplit
import yaml
p=argparse.ArgumentParser();p.add_argument('--root',default=str(Path.home()/'OpenAvatarChat'));p.add_argument('--config',default='config/local_liteavatar_public.yaml');p.add_argument('--origin',default=os.environ.get('CLASSROOM_PUBLIC_ORIGIN','https://localhost'));a=p.parse_args()
root=Path(a.root).resolve();source=root/a.config;target=root/'config/local_liteavatar_classroom213.yaml'
u=urlsplit(a.origin);assert u.scheme=='https' and u.netloc and not u.username and not u.password and u.path in ('','/') and not u.query and not u.fragment,'origin必须是网站HTTPS源地址'
assert source.is_file(),'找不到原配置，请通过--config指定已运行成功的配置'
assert not target.exists(),'新配置已存在。保留现有文件，请检查后另行备份，不自动覆盖'
cfg=yaml.safe_load(source.read_text());section=cfg['default'];handlers=section['chat_engine']['handler_configs'];assert all(k in handlers for k in ('RtcClient','LiteAvatar','CosyVoice')),'当前配置不包含RtcClient/LiteAvatar/CosyVoice'
for k,v in handlers.items():
    if isinstance(v,dict):v['enabled']=k in ('RtcClient','LiteAvatar','CosyVoice','InterruptHandler')
handlers['Teacher213']={'enabled':True,'module':'llm/teacher213/teacher_echo'}
section['chat_engine']['concurrent_limit']=1;handlers['RtcClient']['concurrent_limit']=1;handlers['RtcClient']['connection_ttl']=3600
section['service']['host']='127.0.0.1'
module=root/'src/handlers/llm/teacher213';module.mkdir(parents=True,exist_ok=True)
assets=Path(__file__).resolve().parent;shutil.copy2(assets/'teacher_echo.py',module/'teacher_echo.py')
front=root/'src/service/frontend_service/frontend/dist';assert front.is_dir(),'找不到已经构建的WebUI dist目录'
html=(assets/'teacher213.html').read_text().replace('__TEACHER_ORIGIN__',json.dumps(a.origin.rstrip('/')))
(front/'teacher213.html').write_text(html)
fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:yaml.safe_dump(cfg,f,allow_unicode=True,sort_keys=False)
print('已生成课堂配置：',target)
print('原配置保留。停止原数字人进程后，使用新配置启动；SSH隧道/TURN/网关保持运行。')
print('python src/demo.py --config config/local_liteavatar_classroom213.yaml')
