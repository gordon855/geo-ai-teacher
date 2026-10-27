import tempfile,pathlib,subprocess,sys,yaml,ast
root=pathlib.Path(__file__).resolve().parents[1];kit=root/'deploy/liteavatar214'
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d);(p/'config').mkdir();(p/'src/service/frontend_service/frontend/dist').mkdir(parents=True)
 original={'default':{'service':{'host':'127.0.0.1','port':8282},'chat_engine':{'handler_configs':{k:{'module':'original/'+k} for k in ['RtcClient','LiteAvatar','CosyVoice','InterruptHandler','SenseVoice','LLMOpenAICompatible']}}}}
 source=p/'config/local_liteavatar_public.yaml';source.write_text(yaml.safe_dump(original));before=source.read_bytes()
 cmd=[sys.executable,str(kit/'install.py'),'--root',str(p)]
 r=subprocess.run(cmd,capture_output=True,text=True);assert r.returncode==0,r.stderr
 generated=p/'config/local_liteavatar_classroom213.yaml';cfg=yaml.safe_load(generated.read_text());h=cfg['default']['chat_engine']['handler_configs']
 assert source.read_bytes()==before
 assert generated.stat().st_mode&0o777==0o600
 assert h['CosyVoice']['enabled'] and h['LiteAvatar']['enabled'] and h['Teacher213']['enabled']
 assert not h['SenseVoice']['enabled'] and not h['LLMOpenAICompatible']['enabled']
 assert cfg['default']['service']['port']==8282
 assert '__TEACHER_ORIGIN__' not in (p/'src/service/frontend_service/frontend/dist/teacher213.html').read_text()
 assert subprocess.run(cmd,capture_output=True).returncode!=0
 print('PASS installer preserves working config, credentials permission, host/port and refuses overwrite')
module=ast.parse((kit/'teacher_echo.py').read_text());subset=ast.Module(body=[n for n in module.body if isinstance(n,(ast.Assign,ast.FunctionDef))],type_ignores=[]);ns={};exec(compile(subset,'echo','exec'),ns)
assert ns['speech_text']('[[TEACHER213]]精度与准确度。')=='精度与准确度。'
for value in ['随意对话','[[TEACHER213]]','[[TEACHER213]]'+'x'*3001]:
 try:ns['speech_text'](value);raise AssertionError('invalid text accepted')
 except ValueError:pass
print('PASS exact speech text preserved and invalid/oversized input rejected')
