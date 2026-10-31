"""Reviewed Grok deployment from a clean, verified website release. No payments."""
import base64,datetime,grp,json,os,pathlib,pwd,shutil,subprocess,tempfile,sys
HERE=pathlib.Path(__file__).resolve().parent;RELEASE=HERE.parent.parent
SLUGS=['grok-'+tier+'-1' for tier in ('plus','premium','super','ultra')]
SSH=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/root/.ssh/pulse_zovocard_known_hosts','-o','ConnectTimeout=10','-i','/root/.ssh/playerok_de_ed25519','root@91.108.242.137','/opt/pulse-zovocard/venv/bin/python -']

def run(args,**kw):
    p=subprocess.run(args,capture_output=True,timeout=75,**kw)
    if p.returncode:raise ValueError('install_command_failed')
    return p.stdout

def web_catalog(existing_order_id=None):
    apps=json.loads(run(['pm2','jlist']).decode());api=next(x for x in apps if x['name']=='gptishka-admin-api');env={}
    for part in pathlib.Path('/proc/'+str(api['pid'])+'/environ').read_bytes().split(b'\0'):
        if b'=' in part:
            k,v=part.split(b'=',1);env[k.decode()]=v.decode()
    for k in ('NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'):env.pop(k,None)
    who=pwd.getpwnam('gptishka-web')
    def demote():os.setgroups([]);os.setgid(who.pw_gid);os.setuid(who.pw_uid)
    js="const {prisma}=require('./apps/admin-backend/dist/config/prisma.js'),{activationStore}=require('./apps/admin-backend/dist/modules/orders/activation.store.js');const existing="+json.dumps(existing_order_id)+";(async()=>{const rows=await prisma.product.findMany({where:{slug:{in:"+json.dumps(SLUGS)+"}},select:{id:true,slug:true,isActive:true,isArchived:true,tags:true}});if(rows.length!==4||rows.some(p=>!p.isActive||p.isArchived||!p.tags.includes('month:1')))throw Error('catalog');if(existing){const o=await prisma.order.findUnique({where:{id:existing},include:{items:{include:{product:true}},payments:true,licenseKeys:true}}),a=activationStore.findByOrderId(existing);if(!o||o.status!=='PAID'||!['site','telegram'].includes(o.source)||o.items.length!==1||o.items[0].quantity!==1||!rows.some(p=>p.id===o.items[0].product.id)||o.payments.filter(p=>p.status==='SUCCESS').length!==1||o.licenseKeys.length||(a?.externalFulfillmentOwner!=='website-grok-zovo-v1'&&(a?.cdk||a?.taskId||a?.attempts||a?.status==='success')))throw Error('existing_order');}console.log(JSON.stringify(Object.fromEntries(rows.map(p=>[p.slug,p.id]))))})().finally(()=>prisma.$disconnect());"
    return json.loads(run(['/usr/bin/node','-'],input=js.encode(),env=env,cwd=RELEASE,preexec_fn=demote).decode())

def worker(payload):
    raw='PAYLOAD='+repr(payload)+'\n'+(HERE/'install-grok-worker.py').read_text()
    return json.loads(run(SSH,input=raw.encode()).decode())

def atomic(path,data,mode=0o644,gid=0):
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.grok-')
    with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    os.chmod(tmp,mode);os.chown(tmp,0,gid);os.replace(tmp,path)

def main(apply,sha,existing_order_id=None):
    if os.geteuid()!=0 or pathlib.Path('/var/www/gptishka-new').resolve()!=RELEASE:raise ValueError('live_root_release_required')
    if run(['git','-C',str(RELEASE),'rev-parse','HEAD']).decode().strip()!=sha or run(['git','-C',str(RELEASE),'status','--porcelain','--untracked-files=no']).strip():raise ValueError('clean_verified_release_required')
    import re
    if existing_order_id is not None and not re.fullmatch(r'[a-z0-9]{20,40}',existing_order_id):raise ValueError('existing_order_invalid')
    products=web_catalog(existing_order_id);native=pathlib.Path('/var/lib/gptishka-runtime/subscription-routes.json');cfg=json.loads(native.read_text()) if native.exists() else {}
    existing=cfg.get('grok');cutoff=existing['enabledAfter'] if existing else datetime.datetime.now(datetime.timezone.utc).isoformat()
    existing_ids=[existing_order_id] if existing_order_id else existing.get('existingOrderIds',[]) if existing else []
    native_policy={'enabled':True,'enabledAfter':cutoff,'existingOrderIds':existing_ids}
    if existing and existing!=native_policy:raise ValueError('native_grok_policy_conflict')
    worker_policy={'enabled':True,'enabled_after':cutoff,'existing_order_ids':existing_ids,'product_ids':products}
    sources={'zovocard_grok.py':'grok-worker.py','zovocard_grok_gateway.py':'grok-gateway.py','zovocard_claude.py':'claude-worker.py','zovocard_card_pool.py':'card-pool.py','zovocard_settled_cost.py':'settled-cost.py'}
    payload={'apply':False,'policy':worker_policy,'files':{name:base64.b64encode((HERE/source).read_bytes()).decode() for name,source in sources.items()}}
    inspected=worker(payload)
    if not apply:return {'dryRun':True,'release':sha,'products':products,'existingOrderIds':existing_ids,'worker':inspected}
    root=pathlib.Path('/var/lib/gptishka-runtime');backup=root/('grok-install-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700)
    targets=[native,pathlib.Path('/opt/pulse-web/grok_zovo_broker.py'),pathlib.Path('/etc/systemd/system/gptishka-grok-zovo.service')]
    originals={}
    for i,path in enumerate(targets):
        saved=backup/str(i)
        if path.exists():shutil.copy2(path,saved);os.chmod(saved,0o600);st=path.stat();originals[str(path)]={'saved':str(saved),'mode':st.st_mode&0o777,'gid':st.st_gid}
        else:originals[str(path)]=None
    gw=None
    try:
        gw=worker({**payload,'apply':True})
        atomic(targets[1],(HERE/'grok-broker.py').read_bytes())
        atomic(targets[2],(HERE/'grok-zovo.service').read_bytes())
        run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','gptishka-grok-zovo.service']);run(['systemctl','is-active','--quiet','gptishka-grok-zovo.service'])
        cfg['grok']=native_policy
        atomic(native,(json.dumps(cfg,indent=2)+'\n').encode(),0o640,grp.getgrnam('gptishka-web').gr_gid)
        (backup/'manifest.json').write_text(json.dumps({'release':sha,'originals':originals,'gateway':gw}))
    except Exception:
        run(['systemctl','stop','gptishka-grok-zovo.service'])
        for target,old in originals.items():
            if old:atomic(pathlib.Path(target),pathlib.Path(old['saved']).read_bytes(),old['mode'],old['gid'])
            else:pathlib.Path(target).unlink(missing_ok=True)
        if gw:worker({'rollback':gw['backup']})
        run(['systemctl','daemon-reload']);raise
    return {'installed':True,'release':sha,'backup':str(backup),'gatewayBackup':gw['backup'],'walletLimitUnchanged':gw['walletLimitUnchanged'],'products':products,'existingOrderIds':existing_ids,'paymentsStarted':0}

if __name__=='__main__':
    try:print(json.dumps(main('--apply' in sys.argv,sys.argv[sys.argv.index('--sha')+1],sys.argv[sys.argv.index('--existing-order-id')+1] if '--existing-order-id' in sys.argv else None)))
    except Exception as e:
        reason=str(e);print(json.dumps({'error':reason if reason.replace('_','').isalnum() and len(reason)<100 else 'grok_install_unconfirmed'}));raise SystemExit(1)
