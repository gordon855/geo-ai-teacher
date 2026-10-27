"""Real child-process lifecycle tests, without GPUs, WSL or live SSH. No user's HOME modified."""
import importlib.util,unittest,tempfile,pathlib,sys,subprocess,json,time,os,signal
ROOT=pathlib.Path(__file__).resolve().parents[1];FILE=ROOT/'deploy/liteavatar216/manager.py'
spec=importlib.util.spec_from_file_location('manager216',FILE);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ManagerTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.project=self.root/'project';self.state=self.root/'state';self.state.mkdir();self.children=[]
  for d in ['.venv/bin','src/service/frontend_service/frontend/dist','config']:(self.project/d).mkdir(parents=True,exist_ok=True)
  (self.project/'.venv/bin/python').symlink_to(sys.executable)
  (self.project/'config/local_liteavatar_classroom213.yaml').write_text('test')
  (self.project/'config/local_liteavatar_public.yaml').write_text('test')
  (self.project/'src/service/frontend_service/frontend/dist/teacher213.html').write_text('test')
  (self.project/'src/demo.py').write_text("import os,time,pathlib\npathlib.Path('service.pid').write_text(str(os.getpid()))\nprint('token='+os.environ['DASHSCOPE_API_KEY'],flush=True)\nwhile True:time.sleep(.1)\n")
  (self.project/'start_teacher_tunnel.sh').write_text('echo $$ > tunnel.pid\nexec sleep 300\n')
  self.harness=self.root/'harness.py';self.harness.write_text(f"import importlib.util,sys,pathlib\ns=importlib.util.spec_from_file_location('m',{str(FILE)!r});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nm.state_dir=lambda:pathlib.Path({str(self.state)!r})\nm.http_ready=lambda:(pathlib.Path({str(self.project)!r})/'service.pid').exists()\nsys.exit(m.main())\n")
 def tearDown(self):
  for p in self.children:
   if p.poll() is None:p.stdin.write('STOP\n');p.stdin.flush();p.wait(timeout=20)
   for stream in [p.stdin,p.stdout,p.stderr]:
    if stream and not stream.closed:stream.close()
  self.temp.cleanup()
 def start(self,mode='classroom'):
  p=subprocess.Popen([sys.executable,str(self.harness),'run','--mode',mode,'--project',str(self.project)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);self.children.append(p);p.stdin.write(json.dumps({'api_key':'sk-test-secret-215'})+'\n');p.stdin.flush();return p
 def ready(self,p):
  import select
  until=time.monotonic()+15
  while time.monotonic()<until:
   if select.select([p.stdout],[],[],1)[0]:
    e=json.loads(p.stdout.readline())
    if e['event']=='ready':return
  self.fail('manager did not reach ready')
 def assert_stopped(self):
  for name in ['service.pid','tunnel.pid']:
   pid=int((self.project/name).read_text())
   with self.assertRaises(ProcessLookupError):os.kill(pid,0)
 def test_eof_stops_owned_service_and_tunnel_redacts_log(self):
  p=self.start();self.ready(p);p.stdin.close();self.assertEqual(p.wait(timeout=20),0);self.assert_stopped();log=(self.state/'runtime.log').read_text();self.assertNotIn('sk-test-secret-215',log);self.assertIn('[KEY]',log)
 def test_stop_file_and_duplicate_guard(self):
  p=self.start();self.ready(p);q=self.start();self.assertEqual(q.wait(timeout=10),0);self.assertEqual(json.loads(q.stdout.readline())['event'],'ready');(self.state/'stop.request').touch();self.assertEqual(p.wait(timeout=20),0);self.assert_stopped()
 def test_tunnel_reconnects_and_service_failure_cleans_up(self):
  p=self.start();self.ready(p);first=int((self.project/'tunnel.pid').read_text());os.kill(first,signal.SIGTERM);self.ready(p);second=int((self.project/'tunnel.pid').read_text());self.assertNotEqual(first,second);os.kill(int((self.project/'service.pid').read_text()),signal.SIGTERM);self.assertNotEqual(p.wait(timeout=20),0);self.assert_stopped()
 def test_mode_switch(self):
  p=self.start();self.ready(p);old=int((self.project/'service.pid').read_text());(self.project/'service.pid').unlink()
  q=self.start('public');self.ready(q);self.assertEqual(p.wait(timeout=20),0);self.assertNotEqual(old,int((self.project/'service.pid').read_text()))
  with self.assertRaises(ProcessLookupError):os.kill(old,0)
  self.assertEqual(json.loads((self.state/'status216.json').read_text())['mode'],'public')
 def test_redact_bearer(self):self.assertEqual(module.redact('Bearer abcdef sk-123'),'Bearer [KEY] [KEY]')
if __name__=='__main__':unittest.main()
