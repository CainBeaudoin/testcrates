"""Serves the site plus this folder at /__<path>, and saves POSTs to /save?name=... into assets/prizes/chosen-cards."""
import http.server
import os
import socketserver
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.realpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(SITE, "assets", "prizes", "chosen-cards")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE, **kw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/__"):
            f = os.path.realpath(os.path.join(HERE, urllib.parse.unquote(path[3:])))
            if not f.startswith(HERE + os.sep):
                self.send_error(403)
                return
            self.path = "/" + os.path.relpath(f, SITE)
        return super().do_GET()

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = os.path.basename(q.get("name", ["shot.webp"])[0])
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", 8133), Handler) as s:
        print("serving on http://127.0.0.1:8133/__generate.html", flush=True)
        s.serve_forever()
