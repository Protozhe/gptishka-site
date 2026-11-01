"""Explicit owner CDK imports through the existing notifier peer socket."""
import contextlib,hashlib,json,os,pathlib,re,sqlite3,subprocess
HERE=pathlib.Path(__file__).resolve().parent
STATE=pathlib.Path('/var/lib/gptishka-runtime/owner-cdk-private/receipts.sqlite')
OWNER=pathlib.Path('/var/lib/gptishka-runtime/supplier-secrets/aibuy-topup-owner.json')

def invoke(payload):
 import pwd
 apps=json.loads(subprocess.check_output(['pm2','jlist']));app=next(x for x in apps if x['name']=='gptishka-admin-api');env={}
 for part in pathlib.Path('/proc/'+str(app['pid'])+'/environ').read_bytes().split(b'\0'):
  if b'=' in part:
   k,v=part.split(b'=',1);env[k.decode()]=v.decode()
 for k in ('NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'):env.pop(k,None)
 who=pwd.getpwnam('gptishka-web')
 def demote():os.setgroups([]);os.setgid(who.pw_gid);os.setuid(who.pw_uid)
 p=subprocess.run(['/usr/bin/node',str(HERE/'import.cjs')],input=json.dumps(payload),text=True,capture_output=True,env=env,preexec_fn=demote,cwd=HERE.parents[1],timeout=45)
 try:out=json.loads(p.stdout)
 except Exception:raise ValueError('supplier_cdk_import_unconfirmed') from None
 if p.returncode or out.get('error'):raise ValueError(out.get('error') if re.fullmatch(r'supplier_[a-z_]{1,70}',str(out.get('error',''))) else 'supplier_cdk_import_unconfirmed')
 return out

def dispatch(req,run=invoke):
 if set(req)!={'action','telegram_id','reference','pool','codes'} or req['action']!='cdk_import':raise ValueError('supplier_cdk_request_invalid')
 owner=json.loads(OWNER.read_text())
 if str(req['telegram_id'])!=str(owner['telegramId']):raise ValueError('supplier_owner_required')
 if not re.fullmatch(r'tgcdk-[a-f0-9]{32}',str(req['reference'])) or not re.fullmatch(r'[a-z0-9]{2,10}',str(req['pool'])):raise ValueError('supplier_cdk_request_invalid')
 codes=req['codes']
 if not isinstance(codes,list) or not 1<=len(codes)<=20 or any(not isinstance(x,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{7,63}',x) for x in codes):raise ValueError('supplier_cdk_request_invalid')
 digest=hashlib.sha256(json.dumps({'pool':req['pool'],'codes':sorted(set(codes))},sort_keys=True).encode()).hexdigest()
 STATE.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 fd=os.open(STATE,os.O_CREAT|os.O_RDWR,0o600);os.close(fd);os.chmod(STATE,0o600)
 with contextlib.closing(sqlite3.connect(STATE,timeout=50)) as db,db as c:
  c.execute('CREATE TABLE IF NOT EXISTS receipts(reference TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT)')
  c.execute('BEGIN IMMEDIATE')
  old=c.execute('SELECT digest,result FROM receipts WHERE reference=?',(req['reference'],)).fetchone()
  if old:
   if old[0]!=digest:raise ValueError('supplier_cdk_reference_conflict')
   if old[1]:return json.loads(old[1])
  else:c.execute('INSERT INTO receipts VALUES(?,?,NULL)',(req['reference'],digest))
  result=run({'reference':req['reference'],'pool':req['pool'],'codes':codes,'userId':owner['userId']})
  if result.get('pool')!=req['pool'] or result.get('activationSiteUrl') not in ('https://aiee.fun','https://aichongzhi.fun') or any(type(result.get(k)) is not int or result[k]<0 for k in ('received','inserted','skipped','conflicts')):raise ValueError('supplier_cdk_import_unconfirmed')
  c.execute('UPDATE receipts SET result=? WHERE reference=?',(json.dumps(result),req['reference']))
 return result
