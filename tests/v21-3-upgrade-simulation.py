import tempfile, pathlib, shutil, os, subprocess, json
root=pathlib.Path(__file__).resolve().parents[1]
mock=r'''#!/usr/bin/env python3
import sys,os,json,pathlib
args=sys.argv[1:];state=pathlib.Path(os.environ['MOCK_STATE']);case=os.environ['MOCK_CASE'];old=os.environ['MOCK_OLD'];new=os.environ['MOCK_NEW']
with (state/'calls').open('a') as f:f.write(' '.join(args)+'\n')
if args[0]=='compose':
 if args[1]=='version':print('Docker Compose version v2');sys.exit()
 if 'config' in args:
  print(json.dumps({'services':{'app':{'environment':{'DATABASE_URL':'postgres://same','APP_ENCRYPTION_KEY':'test-key'},'volumes':[{'target':'/app/.data/storage','source':'local_storage'}]},'postgres':{'volumes':[{'target':'/var/lib/postgresql/data','source':'postgres_data'}]}},'volumes':{'local_storage':{'name':'bad' if case=='volume_mismatch' else 'sxie_local'},'postgres_data':{'name':'sxie_pg'}}}));sys.exit()
 if 'ps' in args:print({'app':'app','postgres':'db','nginx':'nginx'}[args[-1]]);sys.exit()
 if 'build' in args:sys.exit(1 if case=='build_failure' else 0)
 if 'stop' in args:(state/'stopped').touch();sys.exit()
 if 'up' in args:
  (state/'version').write_text(os.environ.get('MOCK_START_VERSION','21.2.0') if any('rollback-compose.yml' in a for a in args) else '21.3.0');sys.exit()
if args[0]=='ps':print('nginx');sys.exit()
if args[0]=='inspect':
 if '-f' in args:
  fmt=args[args.index('-f')+1];print(old if 'working_dir' in fmt else 'old-image');sys.exit()
 print(json.dumps([{'Config':{'Env':['DATABASE_URL=postgres://same','APP_ENCRYPTION_KEY=test-key']},'Mounts':[{'Destination':'/app/.data/storage','Type':'volume','Name':'sxie_local'}]},{'Mounts':[{'Destination':'/var/lib/postgresql/data','Type':'volume','Name':'sxie_pg'}]}]));sys.exit()
if args[0]=='exec':
 if '-p' in args and 'node' in args:print(os.environ.get('MOCK_START_VERSION','21.2.0'));sys.exit()
 if any('psql ' in a for a in args):
  count=state/'count-called';after=count.exists();count.touch();print('users|'+('4' if after and case=='count_decrease' else '5'));print('assignments|8');sys.exit()
 if any('pg_dump ' in a for a in args):
  if case=='backup_failure':sys.exit(1)
  print('MOCK database dump');sys.exit()
 if 'pg_restore' in args:print('MOCK valid archive');sys.exit()
 sys.exit()
if args[0]=='run':print('MOCK tar bytes');sys.exit()
sys.exit()
'''
curl=r'''#!/usr/bin/env python3
import os,sys,json,pathlib
state=pathlib.Path(os.environ['MOCK_STATE']);p=state/'version';version=p.read_text() if p.exists() else os.environ.get('MOCK_START_VERSION','21.2.0')
if '-w' in sys.argv:print('200',end='')
else:print(json.dumps({'ok':True,'package_version':version,'builtin_knowledge_chunks':813,'uploaded_knowledge_chunks':123,'uploaded_knowledge_sources':4,'security':{'schema_version':19},'assessment_schema_version':20,'remediation_schema_version':202,'retention_schema_version':203,'workstation_schema_version':21,'avatar_trial_schema_version':211,'attendance_schema_version':213}))
'''
for case in ['success','volume_mismatch','build_failure','backup_failure','count_decrease','db_gate_failure','logging_failure']:
 with tempfile.TemporaryDirectory() as td:
  t=pathlib.Path(td);old=t/'old';new=t/'new';bin=t/'bin';state=t/'state'
  for p in [old,new/'scripts',bin,state]:p.mkdir(parents=True)
  (old/'.env').write_text('COMPOSE_PROJECT_NAME=geoai_demo_legacy\n');(old/'docker-compose.yml').write_text('services: {}')
  (new/'docker-compose.yml').write_text('services: {}')
  for pattern in ['v19-*','v20-3-*','v21-3-*']:
   for p in (root/'scripts').glob(pattern):shutil.copy(p,new/'scripts'/p.name)
  (new/'scripts/v20-3-enable-reconcile.sh').write_text('#!/bin/bash\nexit 0\n')
  (new/'scripts/v21-3-test-database.sh').write_text("#!/bin/bash\n[[ $MOCK_CASE != db_gate_failure ]]\n")
  (new/'scripts/v19-enable-logs.sh').write_text("#!/bin/bash\n[[ $MOCK_CASE != logging_failure ]]\n")
  for name,code in [('docker',mock),('curl',curl),('crontab','#!/bin/sh\nexit 0\n')]:p=bin/name;p.write_text(code);p.chmod(0o755)
  env=dict(os.environ,PATH=str(bin)+':'+os.environ['PATH'],MOCK_STATE=str(state),MOCK_CASE=case,MOCK_OLD=str(old),MOCK_NEW=str(new))
  r=subprocess.run(['bash',str(new/'scripts/v21-3-upgrade.sh'),str(old)],env=env,capture_output=True,text=True,timeout=25)
  if case=='success':assert r.returncode==0 and (new/'UPGRADE_SUCCESS').exists() and (new/'V213_UPGRADE_SUCCESS').exists(),r.stdout+r.stderr
  else:
   assert r.returncode!=0 and not(new/'UPGRADE_SUCCESS').exists(),r.stdout+r.stderr
   if case in ['volume_mismatch','build_failure','db_gate_failure']:assert not(state/'stopped').exists()
   else:assert (state/'version').read_text()==os.environ.get('MOCK_START_VERSION','21.2.0'),r.stdout+r.stderr
  print('PASS',case)
