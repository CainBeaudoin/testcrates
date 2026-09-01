import http.server
import json
import os
import socketserver
import urllib.error
import urllib.parse
import urllib.request

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Local stand-in for the Vercel function in api/stockx.mjs, so /api/stockx
# behaves the same in development. Reads the same env var; without it the
# route 503s and the page falls back to its simulated series, exactly as the
# deployed site does when the key isn't configured.
UPSTREAM = "https://api.kicks.dev"
ROUTES = {
    "search": lambda p: "/v3/stockx/products",
    "product": lambda p: f"/v3/stockx/products/{urllib.parse.quote(p.get('id',''))}",
    "sales": lambda p: f"/v3/stockx/products/{urllib.parse.quote(p.get('id',''))}/sales/daily",
}


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] == "/api/stockx":
            return self.proxy_stockx()
        return super().do_GET()

    def proxy_stockx(self):
        key = os.environ.get("KICKSDB_API_KEY")
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        flat = {k: v[0] for k, v in qs.items()}
        if not key:
            return self.send_json(503, b'{"error":"not_configured"}')
        build = ROUTES.get(flat.get("route"))
        if not build:
            return self.send_json(400, b'{"error":"unknown_route"}')

        params = {}
        if flat.get("query"):
            params["query"] = flat["query"]
        if flat.get("route") in ("search", "product"):
            params["display[prices]"] = "true"
            params["display[variants]"] = "true"
        url = UPSTREAM + build(flat)
        if params:
            url += "?" + urllib.parse.urlencode(params)

        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return self.send_json(200, r.read())
        except urllib.error.HTTPError as e:
            return self.send_json(e.code, e.read() or b'{"error":"upstream_error"}')
        except Exception as e:
            return self.send_json(502, json.dumps({"error": "fetch_failed", "detail": str(e)}).encode())

    def send_json(self, status, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # keep stdout quiet; errors still surface via exceptions

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    # Handles many simultaneous requests (this page loads dozens of images at
    # once) instead of the plain HTTPServer's one-request-at-a-time, which
    # was causing ERR_CONNECTION_REFUSED under load.
    request_queue_size = 128

if __name__ == "__main__":
    port = 8123
    with ThreadingHTTPServer(("", port), NoCacheHandler) as httpd:
        print(f"Serving on http://localhost:{port}")
        httpd.serve_forever()
