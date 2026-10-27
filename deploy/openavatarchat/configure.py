import os,re
from pathlib import Path
from urllib.parse import urlsplit
import yaml
origin=os.environ.get('COURSE_ORIGIN','').rstrip('/');u=urlsplit(origin)
assert u.scheme=='https' and u.netloc and u.path=='' and not u.query and not u.fragment and not u.username,'COURSE_ORIGIN 必须是 HTTPS 网站根域名'
key=os.environ.get('OAC_BRIDGE_KEY','');assert len(key)>=32 and 'REPLACE' not in key,'请填写网站生成的桥接密钥'
assert os.environ.get('DASHSCOPE_API_KEY') and 'REPLACE' not in os.environ['DASHSCOPE_API_KEY'],'请填写独立语音服务的百炼密钥'
p=Path('config/chat_with_openai_compatible_bailian_cosyvoice.yaml');d=yaml.safe_load(p.read_text());v=d['default'];v['logger']['log_level']='WARNING'
v['service'].update(host='127.0.0.1',port=8282,cert_file=None,cert_key=None)
e=v['chat_engine'];e['concurrent_limit']=1;h=e['handler_configs'];h['RtcClient'].update(connection_ttl=300,output_video_fps=25)
turn=os.environ.get('TURN_URLS','')
if turn:
 assert os.environ.get('TURN_USERNAME') and os.environ.get('TURN_PASSWORD'),'TURN 用户名密码不完整'
 h['RtcClient']['turn_config']={'turn_provider':'turn_server','urls':turn.split(','),'username':os.environ['TURN_USERNAME'],'credential':os.environ['TURN_PASSWORD']}
h['LiteAvatar'].update(avatar_name=os.environ.get('LITEAVATAR_NAME','20250408/sample_data'),fps=25,use_gpu=True,enable_fast_mode=False)
h['LLMOpenAICompatible'].update(api_url=origin+'/api/avatar/trial/model/v1',api_key=key,model_name='surveying-course',enable_video_input=False,history_length=6)
h['CosyVoice'].update(voice=os.environ.get('OAC_VOICE','longxiaochun'),model_name=os.environ.get('OAC_TTS_MODEL','cosyvoice-v1'))
out=Path('config/surveying-v211.yaml');out.write_text(yaml.safe_dump(d,allow_unicode=True,sort_keys=False));out.chmod(0o600)
f=Path('src/handlers/llm/openai_compatible/llm_handler_openai_compatible.py');s=f.read_text();s=s.replace('timeout=5.0','timeout=60.0')
# Initialize cancellation flag before the request, including upstream failures.
old='        try:\n            completion = context.client.chat.completions.create('
new='        cancelled = False\n        try:\n            completion = context.client.chat.completions.create('
if new not in s:
 assert old in s,'上游请求结构变化，停止以免错误修改'
 s=s.replace(old,new,1)
f.write_text(s)
print('已生成 config/surveying-v211.yaml；包含密钥，请勿上传或截图。')
