#!/usr/bin/env python3
"""Local read-only bridge; Unix permissions admit only the two legacy bots."""
import json, os, pathlib, socketserver
from http.server import BaseHTTPRequestHandler

SOCKET = '/run/gptishka-activation-reader/reader.sock'
STATE = pathlib.Path('/var/lib/gptishka-runtime/website/order-activations.json')

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/activations':
            self.send_error(404); return
        try:
            data = STATE.read_bytes()
            if len(data) > 32 * 1024 * 1024: raise ValueError('size')
            parsed = json.loads(data)
            if not isinstance(parsed.get('items'), list): raise ValueError('schema')
        except Exception:
            self.send_error(503); return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)

    def address_string(self): return 'local'
    def log_message(self, *_): pass

class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

if __name__ == '__main__':
    os.umask(0o007)
    pathlib.Path(SOCKET).unlink(missing_ok=True)
    with Server(SOCKET, Handler) as server:
        os.chmod(SOCKET, 0o660)
        server.serve_forever()
