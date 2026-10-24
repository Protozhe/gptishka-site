"""Install the reviewed empty-stock adapter without altering activation routes.
Run as root after deploying this exact repository commit. Fails if anchors drift.
"""
from pathlib import Path
import hashlib,os,shutil,tempfile,datetime
ROOT=Path('/opt/pulse-web');HERE=Path(__file__).parent

def patched(text,old,new):
    if text.count(old)!=1:raise RuntimeError('adapter_anchor_changed')
    return text.replace(old,new)

def candidates(files):
    s=files['site_aiee_fallback.py']
    s=patched(s,'def reserve(a,job):\n','''def reserve(a,job,module=None):
    if module is not None:
        from aisou_stock import codex
        try:codex(a,job,module)
        except Exception as error:
            reason=str(error) if str(error).startswith('supplier_') and str(error).replace('_','').isalnum() else 'supplier_requires_review'
            notice(a,'supplier:'+str(job['id'])+':'+reason,f"⚠️ Закупка ключа AISOU\\n\\nЗаказ: {job['order_id']}\\nСтатус: требуется проверка\\nПричина: {reason}\\n\\nПовторная покупка при неподтверждённом результате заблокирована.")
            return
''')
    s=patched(s,'if eligible(j,cfg,len(logs),logs[0][\'detail\'] if logs else \'\',time.time()):reserve(a,j)',
        'if eligible(j,cfg,len(logs),logs[0][\'detail\'] if logs else \'\',time.time()):reserve(a,j,module)')
    result={'site_aiee_fallback.py':s}
    s=files['subscription_reserve_auto.py']
    s=patched(s,"if not available(a,j,pool):notice(a,j,'empty','⚠️ Нет резервного ключа нужного тарифа и типа аккаунта. Другой ключ не подставляли.');continue",
        "from aisou_stock import enabled as supply_enabled\n            if not available(a,j,pool) and not supply_enabled(j):notice(a,j,'empty','⚠️ Нет резервного ключа нужного тарифа и типа аккаунта. Другой ключ не подставляли.');continue")
    s=patched(s,"if not bind(a,j,r):notice(a,j,'empty','⚠️ В резерве нет ключа нужного тарифа и типа аккаунта. Повторная оплата остановлена.');return",
        "if not bind(a,j,r):\n            from aisou_stock import subscription\n            if subscription(a,j,r):return\n            notice(a,j,'empty','⚠️ В резерве нет ключа нужного тарифа и типа аккаунта. Повторная оплата остановлена.');return")
    s=patched(s,"total=Decimal(v['cost_bound_rub'])+extra", "key_cost=Decimal(str(proof.get('aisou_key_cost_rub',v['cost_bound_rub'])))\n    if not key_cost.is_finite() or key_cost<=0:raise ValueError('reserve_acquisition_cost_invalid')\n    total=key_cost+extra")
    s=patched(s,"if Decimal(v['profit_bound_rub'])-extra<Decimal(str(policy.get('minimum_profit_rub',0))):", "if Decimal(v['profit_bound_rub'])+Decimal(v['cost_bound_rub'])-total<Decimal(str(policy.get('minimum_profit_rub',0))):")
    s=patched(s,"value=decrypted(a,r['encrypted_key']);url=a._provider_url(r['provider'])", "if json.loads(r['proof']).get('aisou_key_id') and str(json.loads(r['proof'])['aisou_key_id'])!=str(r['key_id']):raise ValueError('reserve_acquisition_key_mismatch')\n    value=decrypted(a,r['encrypted_key']);url=a._provider_url(r['provider'])")
    # Error messages contain only guarded machine codes, never provider bodies.
    s=s.replace("str(e).startswith('reserve_')", "str(e).startswith(('reserve_','supplier_'))")
    result['subscription_reserve_auto.py']=s
    for name,text in result.items():compile(text,name,'exec')
    return result

def install():
    files={name:(ROOT/name).read_text() for name in ('site_aiee_fallback.py','subscription_reserve_auto.py')}
    if all('from aisou_stock import' in value for value in files.values()):return {'already_installed':True}
    output=candidates(files)
    backup=ROOT/'data'/('aisou-code-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700)
    for name in files:shutil.copy2(ROOT/name,backup/name)
    output['aisou_stock.py']=(HERE/'pulse-stock.py').read_text()
    for name,text in output.items():
        target=ROOT/name;st=target.stat() if target.exists() else (ROOT/'site_aiee_fallback.py').stat()
        fd,tmp=tempfile.mkstemp(dir=ROOT,prefix='.aisou-stage-')
        with os.fdopen(fd,'w') as f:f.write(text);f.flush();os.fsync(f.fileno())
        os.chown(tmp,st.st_uid,st.st_gid);os.chmod(tmp,st.st_mode&0o777);os.replace(tmp,target)
    return {'installed':sorted(output),'backup':str(backup),'hashes':{n:hashlib.sha256(t.encode()).hexdigest() for n,t in output.items()}}

if __name__=='__main__':
    import json
    print(json.dumps(install()))
