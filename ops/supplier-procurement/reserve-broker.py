"""Peer-authenticated website bridge; supplier credentials stay website-side."""
import json,os,pathlib,pwd,socket,struct,subprocess
ALLOWED={'watch','evidence','available','reserve','complete','procure'}
SOCKET='/run/gptishka-reserve-site/rpc.sock'
HELPER='/opt/gptishka-reserve-site/helper.cjs'
SUPPLIER='/var/www/gptishka-new/ops/supplier-procurement/website-rpc.cjs'

def allowed(peer_uid,request):
    if peer_uid!=pwd.getpwnam('gptishka-pulse').pw_uid:return False
    if not isinstance(request,dict) or request.get('action') not in ALLOWED:return False
    if request['action']=='watch':return isinstance(request.get('since'),str) and len(request['since'])<=40
    oid=request.get('order_id','')
    return isinstance(oid,str) and 20<=len(oid)<=40 and oid.isascii() and oid.isalnum() and oid==oid.lower() and isinstance(request.get('context'),dict)

def serve():
    path=pathlib.Path(SOCKET);path.unlink(missing_ok=True)
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as listener:
        listener.bind(SOCKET);os.chmod(SOCKET,0o660);listener.listen(5)
        while True:
            conn,_=listener.accept()
            with conn:
                try:
                    conn.settimeout(8)
                    _,uid,_=struct.unpack('3i',conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
                    body=b''
                    while True:
                        part=conn.recv(4096)
                        if not part:break
                        body+=part
                        if len(body)>16384:raise ValueError()
                    req=json.loads(body)
                    if not allowed(uid,req):raise ValueError()
                    supplier=req['action']=='procure'
                    p=subprocess.run(['/usr/bin/node',SUPPLIER if supplier else HELPER],input=body,capture_output=True,timeout=110 if supplier else 58)
                    if len(p.stdout)>6*1024*1024:raise ValueError()
                    result=json.loads(p.stdout)
                    if not isinstance(result,dict):raise ValueError()
                    conn.sendall(json.dumps(result).encode())
                except Exception:
                    try:conn.sendall(b'{"error":"reserve_access_unavailable"}')
                    except OSError:pass

if __name__=='__main__':serve()
