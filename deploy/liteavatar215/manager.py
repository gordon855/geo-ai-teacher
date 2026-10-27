#!/usr/bin/env python3
"""WSL foreground supervisor; no inbound port. Credentials arrive on stdin, never argv."""
import argparse,fcntl,json,logging,logging.handlers,os,re,signal,subprocess,sys,threading,time,urllib.request
from pathlib import Path

def state_dir():
    path=Path.home()/'.local/state/liteavatar215';path.mkdir(parents=True,exist_ok=True,mode=0o700);path.chmod(0o700);return path

def emit(event,message,**extra):
    try:print(json.dumps({'event':event,'message':message,**extra},ensure_ascii=False),flush=True)
    except BrokenPipeError:pass

def redact(text,key=''):
    if key:text=text.replace(key,'[KEY]')
    text=re.sub(r'sk-[A-Za-z0-9_.-]+','[KEY]',text)
    return re.sub(r'(?i)(Bearer\s+)[^\s\x22\x27,}]+',r'\1[KEY]',text)

def http_ready(port=8282):
    try:
        # Ignore inherited HTTP proxies for this localhost readiness probe.
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f'http://127.0.0.1:{port}/',timeout=2) as r:return 200 <= r.status < 400
    except Exception:return False

def terminate_owned(process):
    if process is None:return
    # Only process groups created by this manager. Never kill a port owner or arbitrary PID.
    try:os.killpg(process.pid,signal.SIGTERM)
    except ProcessLookupError:return
    try:process.wait(timeout=12)
    except subprocess.TimeoutExpired:
        try:os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        process.wait(timeout=5)

def run(args):
    state=state_dir();lock=(state/'manager.lock').open('a')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        emit('busy','一键启动器已在运行；请使用现有窗口，切换模式前先停止。');return 2
    stopfile=state/'stop.request';stopfile.unlink(missing_ok=True)
    project=Path(args.project).expanduser().resolve() if args.project else Path.home()/'OpenAvatarChat'
    python=project/'.venv/bin/python';tunnel=project/'start_teacher_tunnel.sh'
    config=project/('config/local_liteavatar_classroom213.yaml' if args.mode=='classroom' else 'config/local_liteavatar_public.yaml')
    if not python.is_file() or not tunnel.is_file():raise RuntimeError('找不到OpenAvatarChat虚拟环境或原SSH隧道脚本，请检查选择的Ubuntu用户。')
    if http_ready():raise RuntimeError('8282已有服务响应。请先在原运行窗口Ctrl+C停止原数字人，避免重复启动或模式冲突。')
    secret=json.loads(sys.stdin.readline()).get('api_key','').strip()
    if not secret:raise RuntimeError('未提供百炼密钥，请在Windows运行Setup.cmd。')
    logfile=state/'runtime.log';fd=os.open(logfile,os.O_CREAT|os.O_APPEND|os.O_WRONLY,0o600);os.close(fd);logfile.chmod(0o600)
    logger=logging.getLogger('liteavatar215');logger.setLevel(logging.INFO)
    handler=logging.handlers.RotatingFileHandler(logfile,maxBytes=5*1024*1024,backupCount=2,encoding='utf-8');logger.addHandler(handler)
    def log(label,line):logger.info('%s %s',label,redact(line.rstrip(),secret))
    env=dict(os.environ,DASHSCOPE_API_KEY=secret,PYTHONUNBUFFERED='1');env['PATH']=str(python.parent)+os.pathsep+env.get('PATH','')
    if not config.is_file() and args.mode=='classroom':
        emit('starting','首次创建课堂扩展配置，保留原独立问答配置。')
        result=subprocess.run([str(python),str(Path(__file__).with_name('install.py')),'--root',str(project)],cwd=project,env=env,capture_output=True,text=True,timeout=90)
        log('install',result.stdout+result.stderr)
        if result.returncode:raise RuntimeError('课堂扩展安装失败，请查看本机日志；原配置未自动覆盖。')
    if not config.is_file():raise RuntimeError('缺少原先已验证的数字人配置文件。')
    # Existing classroom YAML is preserved; require its matching webpage/handler to exist.
    if args.mode=='classroom' and not (project/'src/service/frontend_service/frontend/dist/teacher213.html').is_file():
        raise RuntimeError('课堂配置存在但teacher213.html缺失，请核对扩展安装，未自动覆盖配置。')
    stop=threading.Event()
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,lambda *_:stop.set())
    def input_watch():
        # If the Windows parent disappears, stdin EOF shuts down our owned services.
        for line in sys.stdin:
            if line.strip()=='STOP':break
        stop.set()
    threading.Thread(target=input_watch,daemon=True).start()
    readers=[]
    def spawn(argv,label):
        process=subprocess.Popen(argv,cwd=project,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',start_new_session=True)
        def drain():
            with process.stdout:
                for line in process.stdout:log(label,line)
        reader=threading.Thread(target=drain,daemon=True);readers.append(reader);reader.start();return process
    service=None;ssh=None
    try:
        emit('starting','正在启动LiteAvatar，首次载入模型需要等待。')
        service=spawn([str(python),'src/demo.py','--config',str(config)],'service')
        ssh=spawn(['bash',str(tunnel)],'tunnel');tunnel_started=time.monotonic();started=tunnel_started
        announced=False;failures=0
        while not stop.wait(1):
            if stopfile.exists():break
            if service.poll() is not None:raise RuntimeError(f'数字人进程退出（代码{service.returncode}），请查看日志中的ERROR。')
            if ssh.poll() is not None:
                failures+=1
                if failures>5:raise RuntimeError('隧道连续连接失败，请检查网络、SSH凭据或是否有旧隧道占用端口。')
                emit('reconnecting',f'隧道断开，正在第{failures}次重连。')
                if stop.wait(min(5*failures,30)):break
                terminate_owned(ssh);ssh=spawn(['bash',str(tunnel)],'tunnel');tunnel_started=time.monotonic();started=tunnel_started;announced=False
            if not announced and time.monotonic()-tunnel_started>=4 and http_ready():
                emit('ready','本机网页服务已响应，隧道进程运行中。请在教师网页连接人物并检查声音。',mode=args.mode)
                announced=True
            if announced and time.monotonic()-tunnel_started>=60:failures=0
            if not announced and time.monotonic()-started>300:raise RuntimeError('启动超过5分钟仍未就绪，请检查本机日志。')
    finally:
        terminate_owned(ssh);terminate_owned(service);stopfile.unlink(missing_ok=True)
        for reader in readers:reader.join(timeout=2)
        handler.close();logger.removeHandler(handler)
        emit('stopped','本启动器创建的服务和隧道已停止。')
    return 0

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['run','stop','logs']);p.add_argument('--mode',choices=['classroom','public'],default='classroom');p.add_argument('--project');a=p.parse_args()
    if a.action=='stop':(state_dir()/'stop.request').touch(mode=0o600);emit('stopping','已请求停止本启动器管理的进程。');return 0
    if a.action=='logs':
        path=state_dir()/'runtime.log';print(path.read_text(errors='replace')[-24000:] if path.exists() else '尚无日志。');return 0
    return run(a)
if __name__=='__main__':
    os.umask(0o077)
    try:sys.exit(main())
    except Exception as e:emit('error',str(e));sys.exit(1)
