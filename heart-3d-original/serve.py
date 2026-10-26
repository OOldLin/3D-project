"""仅在本机提供专业版独立资源网页，按 Ctrl+C 结束服务。"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

root = Path(__file__).resolve().parent / "web"
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"心脏解剖工作台：{url}", flush=True)
    print("仅本机可以访问。按 Ctrl+C 结束服务；启动后暂时无新输出属于正常情况。", flush=True)
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("本地服务已结束。")
