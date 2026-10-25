"""Owner-only unpaid top-up invoices. Separate notifier-only peer socket.

No customer session, product key, activation, card or funds-transfer endpoint.
"""
import importlib.util,json,os,pathlib,re,socket,struct,subprocess
HERE=pathlib.Path(__file__).resolve().parent
SOCKET='/run/gptishka-aibuy-topup/rpc.sock'

def module(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
b=module('topup_broker','aibuy-broker.py')
topup=module('topup_creator','aibuy-topup.py')

def authorized(telegram_id):
 import pwd
 c=b.protected(b.SECRET/'aibuy-topup-owner.json')
 if telegram_id!=c['telegramId']:return False
 apps=json.loads(subprocess.check_output(['pm2','jlist']));app=next(x for x in apps if x['name']=='gptishka-admin-api');env={}
 for e in pathlib.Path('/proc/'+str(app['pid'])+'/environ').read_bytes().split(b'\0'):
  if b'=' in e:
   k,v=e.split(b'=',1);env[k.decode()]=v.decode()
 for k in ('NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'):env.pop(k,None)
 who=pwd.getpwnam('gptishka-web')
 def demote():os.setgroups([]);os.setgid(who.pw_gid);os.setuid(who.pw_uid)
 p=subprocess.run(['/usr/bin/node',str(HERE/'aibuy-owner.cjs')],input=json.dumps({'user_id':c['userId']}),text=True,capture_output=True,env=env,preexec_fn=demote,cwd=HERE.parents[1],timeout=30)
 try:return p.returncode==0 and json.loads(p.stdout).get('allowed') is True
 except Exception:return False

def dispatch(req,uid,notifier_uid,*,authorize=authorized,create=topup.create_invoice,browser=b.child):
 if uid!=notifier_uid:raise ValueError('supplier_peer_refused')
 if req=={'action':'health'}:return {'state':'alive','purpose':'unpaid_topup_invoices'}
 if not isinstance(req,dict) or not re.fullmatch(r'[1-9][0-9]{0,19}',str(req.get('telegram_id',''))):raise ValueError('supplier_owner_required')
 if not authorize(req['telegram_id']):raise ValueError('supplier_owner_required')
 if req.get('action')=='balance' and set(req)=={'action','telegram_id'}:
  import fcntl
  with open(b.STATE/'account.lock','a') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX);r=browser({'mode':'balance','credits':250})
  if r.get('owner_verified') is not True or type(r.get('balance_minor')) is not int or r['balance_minor']<0:raise ValueError('supplier_balance_unconfirmed')
  return {'balance_minor':r['balance_minor']}
 if set(req)!={'action','telegram_id','reference','amount_minor','network'} or req['action']!='create_invoice':raise ValueError('supplier_request_invalid')
 if not re.fullmatch(r'tg-[a-f0-9]{32}',req['reference']) or req['network'] not in ('TRC20','BEP20'):raise ValueError('supplier_request_invalid')
 if type(req['amount_minor']) is not int or not 1000<=req['amount_minor']<=1000000:raise ValueError('supplier_topup_amount')
 r=create(req['reference'],req['amount_minor'],req['network'])
 if r.get('paid') is not False or r.get('amount_minor')!=req['amount_minor'] or r.get('network')!=req['network'] or not re.fullmatch(r'https://pay\.ai-buy\.vip/pay/checkout-counter/[A-Za-z0-9_-]{8,80}',r.get('invoice_url','')):raise ValueError('supplier_topup_unconfirmed')
 return {k:r[k] for k in ('invoice_url','amount_minor','network','paid')}

def serve():
 import fcntl,pwd
 who=pwd.getpwnam('gptishka-notifiers');directory=pathlib.Path(SOCKET).parent
 directory.mkdir(mode=0o750,exist_ok=True);os.chown(directory,0,who.pw_gid);os.chmod(directory,0o750)
 lock=open(b.STATE/'topup-server.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 if os.path.lexists(SOCKET):os.unlink(SOCKET)
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as server:
  server.bind(SOCKET);os.chown(SOCKET,who.pw_uid,who.pw_gid);os.chmod(SOCKET,0o600);server.listen(8)
  while True:
   conn,_=server.accept()
   with conn:
    try:
     conn.settimeout(210);_,uid,_=struct.unpack('3i',conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
     if uid!=who.pw_uid:raise ValueError('supplier_peer_refused')
     raw=b''
     while True:
      part=conn.recv(2048)
      if not part:break
      raw+=part
      if len(raw)>2048:raise ValueError('supplier_request_invalid')
     out=dispatch(json.loads(raw),uid,who.pw_uid)
    except Exception as e:
     code=str(e);out={'error':code if re.fullmatch(r'supplier_[a-z_]{1,70}',code) else 'supplier_topup_unconfirmed'}
    try:conn.sendall(json.dumps(out).encode())
    except OSError:pass

if __name__=='__main__':
 if os.geteuid()!=0:raise SystemExit('owner runtime required')
 serve()
