#!/usr/bin/env python3
"""Add JSON access logs and trusted origin metadata to the existing HTTP/HTTPS config."""
import sys,re,pathlib
p=pathlib.Path(sys.argv[1]);s=p.read_text()
if '# V19 SECURITY LOGGING' in s:
    required=['map $time_iso8601 $v19_day', 'log_format v19 escape=json', 'access_log /var/log/v19/access-$v19_day.log v19;', 'X-V19-Source-IP', 'X-V19-Source-Port', 'X-V19-Target-IP', 'X-V19-Target-Port']
    if s.count('# V19 SECURITY LOGGING') != 1 or not all(x in s for x in required):
        raise SystemExit('已有日志标记但配置不完整，请核对配置。')
    if not re.search(r'proxy_pass\s+http://app:3000\s*;',s):
        raise SystemExit('已有配置upstream不符合预期。')
    print('已有安全日志配置完整，保留并继续。')
    raise SystemExit(0)
if not re.search(r'proxy_pass\s+http://app:3000\s*;',s): raise SystemExit('Nginx upstream不是预期app:3000，停止自动修改，请人工核对。')
header=r'''# V19 SECURITY LOGGING
root /usr/share/nginx/html;
map $time_iso8601 $v19_day { ~^([0-9]+-[0-9]+-[0-9]+) $1; default undated; }
log_format v19 escape=json '{"time":"$time_iso8601","ip":"$remote_addr","source_port":"$remote_port","target_ip":"$server_addr","target_port":"$server_port","method":"$request_method","path":"$uri","status":$status,"bytes":$body_bytes_sent,"duration":$request_time,"user_agent":"$http_user_agent","request_id":"$upstream_http_x_audit_request_id"}';
'''
s=re.sub(r'(server\s*\{)',r'\1\n  access_log /var/log/v19/access-$v19_day.log v19;',s)
s=re.sub(r'proxy_set_header\s+X-Forwarded-For\s+[^;]+;', 'proxy_set_header X-Forwarded-For $remote_addr;',s,flags=re.I)
metadata='\n'.join('    proxy_set_header '+name+' '+value+';' for name,value in [('X-V19-Source-IP','$remote_addr'),('X-V19-Source-Port','$remote_port'),('X-V19-Target-IP','$server_addr'),('X-V19-Target-Port','$server_port')])
s=re.sub(r'(proxy_pass\s+http://app:3000\s*;)',r'\1\n'+metadata,s)
p.write_text(header+s)
