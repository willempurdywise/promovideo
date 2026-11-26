#!/usr/bin/env python3
"""Local, editable review player. Run with storyboard.json --video demo.mp4."""
import argparse
import io
import json
import re
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from render import Movie, COLORS, PARTNERS


def serve(storyboard, video, port):
    movie = Movie(storyboard)
    lock = threading.Lock()
    token = secrets.token_urlsafe(32)
    review_file = storyboard.with_name('review.json')
    state = {'background': movie.cfg.get('background', '#9FE870'), 'comments': []}
    if review_file.exists():
        state.update(json.loads(review_file.read_text()))
    job = {'status': 'idle'}
    html = Path(__file__).with_name('review.html').read_text()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, data, kind='application/json', status=200):
            if isinstance(data, (dict, list)):
                data = json.dumps(data).encode()
            elif isinstance(data, str):
                data = data.encode()
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == '/':
                return self.reply(html.replace('__TOKEN__', token), 'text/html; charset=utf-8')
            if parsed.path == '/state':
                return self.reply({**state, 'duration': movie.duration, 'size': movie.size, 'palette': COLORS, 'job': job, 'photo': bool(movie.cfg.get('background_image'))})
            if parsed.path == '/video':
                # Range requests make scrubbing efficient for long MP4s.
                size = video.stat().st_size
                match = re.fullmatch(r'bytes=(\d+)-(\d*)', self.headers.get('Range', ''))
                start, end = (int(match[1]), int(match[2]) if match[2] else size-1) if match else (0, size-1)
                end = min(end, size-1)
                if start > end:
                    return self.reply('Invalid range', 'text/plain', 416)
                self.send_response(206 if match else 200)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Content-Length', str(end-start+1))
                if match:
                    self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.end_headers()
                with video.open('rb') as f:
                    f.seek(start)
                    remaining = end-start+1
                    while remaining:
                        chunk = f.read(min(1024*1024, remaining))
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                return
            if parsed.path == '/frame':
                query = parse_qs(parsed.query)
                color = query.get('color', [''])[0]
                if not re.fullmatch('#[0-9a-fA-F]{6}', color):
                    return self.reply({'error': 'Invalid colour'}, status=400)
                try:
                    t = max(0, min(movie.duration, float(query.get('t', ['0'])[0])))
                    with lock:
                        # Render from original layers, never colour-key the app pixels.
                        from PIL import Image
                        from render import PARTNERS
                        base, logo = movie.base, movie.logo
                        try:
                            movie.base = Image.new('RGB', movie.size, color)
                            if logo is not None:
                                tint = PARTNERS.get(color.upper(), '#163300' if sum(Image.new('RGB',(1,1),color).getpixel((0,0))) > 384 else '#9FE870')
                                movie.logo = Image.new('RGBA', logo.size, tint)
                                movie.logo.putalpha(logo.getchannel('A'))
                            frame = movie.frame(t)
                            frame.thumbnail((960,960))
                            output = io.BytesIO()
                            frame.save(output, 'JPEG', quality=88)
                        finally:
                            movie.base, movie.logo = base, logo
                    return self.reply(output.getvalue(), 'image/jpeg')
                except (ValueError, OverflowError):
                    return self.reply({'error': 'Invalid time'}, status=400)
            return self.reply({'error': 'Not found'}, status=404)

        def do_POST(self):
            if self.headers.get('X-Review-Token') != token:
                return self.reply({'error': 'Invalid token'}, status=403)
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 100000:
                    raise ValueError('Invalid request size')
                data = json.loads(self.rfile.read(length))
                if self.path == '/save':
                    if not re.fullmatch('#[0-9a-fA-F]{6}', data['background']):
                        raise ValueError('Invalid colour')
                    comments = data['comments']
                    if not isinstance(comments, list) or any(not isinstance(c.get('text'), str) or not 0 <= float(c['time']) <= movie.duration for c in comments):
                        raise ValueError('Invalid comments')
                    state.update(background=data['background'], comments=comments)
                    review_file.write_text(json.dumps(state, indent=2))
                    prompt = f'Use $promovideo to update the existing project at {storyboard}. Read {review_file}. Apply the timestamped comments, retain all other settings, and render a new version. Do not mark a comment resolved until its change is implemented and checked.'
                    storyboard.with_name('review-request.txt').write_text(prompt+'\n')
                    return self.reply({'prompt': prompt})
                if self.path == '/render':
                    if job['status'] == 'rendering':
                        return self.reply({'error':'An export is already running'}, status=409)
                    config = json.loads(storyboard.read_text())
                    config.pop('background_image', None)
                    config['background'] = state['background']
                    from PIL import Image
                    color = state['background']
                    config['logo_color'] = PARTNERS.get(color.upper(), '#163300' if sum(Image.new('RGB',(1,1),color).getpixel((0,0))) > 384 else '#9FE870')
                    revised = storyboard.with_name('storyboard-review.json')
                    revised.write_text(json.dumps(config, indent=2))
                    output = video.with_name(video.stem+'-review-'+secrets.token_hex(3)+'.mp4')
                    job.update(status='rendering', output=str(output))
                    def render():
                        try:
                            Movie(revised).render(output)
                            job.update(status='complete')
                        except Exception as error:
                            job.update(status='failed', error=str(error))
                    threading.Thread(target=render, daemon=True).start()
                    return self.reply(job)
                return self.reply({'error':'Not found'}, status=404)
            except (KeyError, ValueError, TypeError) as error:
                return self.reply({'error':str(error)}, status=400)

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'Review player: http://127.0.0.1:{server.server_port}/', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('storyboard', type=Path)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8768)
    args = parser.parse_args()
    serve(args.storyboard.resolve(), args.video.resolve(), args.port)
