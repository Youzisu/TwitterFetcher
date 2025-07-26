import http.server
import socketserver
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        # 如果请求路径是根目录，则返回index.html
        if self.path == '/':
            self.path = '/index.html'
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

handler = MyHTTPRequestHandler

with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"服务器运行在 http://localhost:{PORT}/")
    print("按 Ctrl+C 停止服务器")
    httpd.serve_forever()