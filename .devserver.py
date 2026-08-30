import http.server
import os
import socketserver

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
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
