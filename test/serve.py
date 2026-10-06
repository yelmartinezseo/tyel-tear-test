# Servidor local de pruebas: solo escucha en 127.0.0.1 y pide al navegador no guardar nada en caché.
#   python test/serve.py        ->  http://127.0.0.1:4500/
import http.server, os, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 4500
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
