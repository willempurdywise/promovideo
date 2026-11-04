#!/usr/bin/env python3
"""Render screenshot storyboards. All project asset paths are relative to the JSON file."""
import argparse
import bisect
import json
import math
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageSequence, ImageOps

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
RESAMPLE = Image.Resampling.LANCZOS


FORMATS = {"1:1": (1080,1080), "16:9": (1920,1080), "9:16": (1080,1920)}
PAIRS = [("Bright Green", "#9FE870", "Forest Green", "#163300"), ("Bright Blue", "#A0E1E1", "Dark Charcoal", "#21231D"), ("Bright Yellow", "#FFEB69", "Dark Gold", "#3A341C"), ("Bright Orange", "#FFC091", "Dark Purple", "#260A2F"), ("Bright Pink", "#FFD7EF", "Dark Maroon", "#320707")]
COLORS = {name.lower(): color for a,b,c,d in PAIRS for name,color in ((a,b),(c,d))}
PARTNERS = {a:b for _,b,_,d in PAIRS for a,b in ((b,d),(d,b))}

def motion(x, curve=(.32,.72,0,1)):
    x = max(0, min(1, x))
    if x in (0, 1):
        return x
    lo, hi = 0., 1.
    for _ in range(18):
        u = (lo + hi) / 2
        if 3 * (1-u)**2 * u * curve[0] + 3*(1-u)*u*u*curve[2] + u**3 < x:
            lo = u
        else:
            hi = u
    u = (lo + hi) / 2
    return 3*(1-u)**2*u*curve[1] + 3*(1-u)*u*u*curve[3] + u**3


def rounded(size, radius, top_only=False):
    w, h = size
    mask = Image.new('L', (w*3, h*3))
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, w*3-1, h*3-1), radius=radius*3, fill=255)
    if top_only:
        d.rectangle((0, min(h, radius)*3, w*3, h*3), fill=255)
    return mask.resize(size, RESAMPLE)


class Movie:
    def __init__(self, config, overrides=None):
        self.root = config.parent
        self.cfg = json.loads(config.read_text())
        c = self.cfg
        c.update(overrides or {})
        bundled = ASSETS.parent/'vendor/base-surfaces'
        source = self.path(c['base_surfaces']) if c.get('base_surfaces') else None
        if source is None and not c.get('motion_profile') and (bundled/'base-surfaces-mobile').is_dir():
            source = bundled
        if source is not None:
            import importlib.util
            spec = importlib.util.spec_from_file_location('wise_sync_motion', Path(__file__).with_name('sync_motion.py'))
            extractor = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(extractor)
            self.motion = extractor.extract(source)
            self.motion_origin = f'base-surfaces checkout: {source}'
        else:
            profile = self.path(c['motion_profile']) if c.get('motion_profile') else ASSETS/'motion.json'
            self.motion = json.loads(profile.read_text())
            self.motion_origin = f'explicit profile: {profile}' if c.get('motion_profile') else 'bundled snapshot (base-surfaces submodule is not initialized)'
        self.size = FORMATS[c['format']] if 'format' in c else tuple(c.get('canvas', [1080, 1080]))
        self.fps = c.get('fps', 60)
        self.x, self.y, self.w, self.h = c.get('phone', [(self.size[0]-390)//2, (self.size[1]-844)//2, 390, 844])
        if c.get('device') == 'desktop':
            sw, sh = c['viewport']
            margin = round(min(self.size)*.08)
            scale = min((self.size[0]-2*margin)/sw, (self.size[1]-2*margin-48)/sh)
            self.w, self.h = round(sw*scale), round(sh*scale)
            self.x, self.y = (self.size[0]-self.w)//2, (self.size[1]-self.h)//2
        if self.fps <= 0 or min(*self.size, self.w, self.h) <= 0 or any(v % 2 for v in self.size):
            raise ValueError('Use positive dimensions/fps and even canvas dimensions for H.264.')
        # One fixed outer mask keeps all uploaded screens and moving layers consistent.
        self.mask = rounded((self.w, self.h), 16 if c.get('device') == 'desktop' else 40)
        background = c.get('background', '#9FE870')
        background = COLORS.get(background.lower(), background).upper()
        self.base = Image.new('RGB', self.size, background)
        if c.get('background_image'):
            self.base = ImageOps.fit(ImageOps.exif_transpose(Image.open(self.path(c['background_image']))).convert('RGB'), self.size, method=RESAMPLE, centering=tuple(c.get('background_position', [.5,.5])))
        self.logo = None
        if c.get('logo', True):
            self.logo = Image.open(self.path(c['logo'] if isinstance(c.get('logo'), str) else '@wise-logo.png')).convert('RGBA')
            if c.get('background_image'):
                center = np.array(self.base.crop((self.size[0]//2-120,self.size[1]//2-115,self.size[0]//2+120,self.size[1]//2+115)))
                color = c.get('logo_color', '#163300' if center.mean() > 128 else '#9FE870')
            else:
                color = PARTNERS.get(background, c.get('logo_color', '#163300'))
            self.logo.thumbnail(tuple(c.get('logo_size', [240, 230])), RESAMPLE)
            tinted = Image.new('RGBA', self.logo.size, color)
            tinted.putalpha(self.logo.getchannel('A'))
            self.logo = tinted
        self.screens = {}
        for name, spec in c['screens'].items():
            im = Image.open(self.path(spec['file'])).convert('RGB')
            if 'crop' in spec:
                im = im.crop(tuple(spec['crop']))
            im = im.resize((self.w, self.h), RESAMPLE)
            # Photograph corners must never travel inside the phone as background slivers.
            r = spec.get('flatten_radius', 0 if c.get('device') == 'desktop' else 42)
            if r:
                outside = rounded(im.size, r).point(lambda v: 255 if v < 255 else 0)
                fill = Image.new('RGB', im.size, spec.get('top_fill', im.getpixel((self.w//2, 8))))
                ImageDraw.Draw(fill).rectangle((0, self.h//2, self.w, self.h), fill=spec.get('bottom_fill', im.getpixel((self.w//2, self.h-5))))
                im.paste(fill, (0, 0), outside)
            self.screens[name] = im
        self.scenes = c['scenes']
        if not self.scenes:
            raise ValueError('At least one scene is required.')
        self.starts, self.lengths = [], []
        elapsed = 0
        self.media = {}
        self.scroll_images = {}
        for i, scene in enumerate(self.scenes):
            if scene['screen'] not in self.screens:
                raise ValueError('Unknown screen: ' + scene['screen'])
            trans = scene.get('transition', {})
            kind = trans.get('type', 'cut')
            if kind not in ('cut', 'push', 'pop', 'rise', 'fade', 'modal-in', 'modal-out'):
                raise ValueError('Unknown transition: ' + kind)
            preset = trans.get('preset', 'sheet')
            if preset not in ('sheet', 'spring_sheet'):
                raise ValueError('Unknown modal preset: ' + preset)
            sheet_profile = self.motion[preset]
            default_duration = sheet_profile['duration']+sheet_profile['delay'] if kind.startswith('modal-') else self.motion['page']['duration']
            duration = trans.get('duration', default_duration) if i and kind != 'cut' else 0
            hold = scene.get('hold', 2.)
            if duration < 0 or hold <= 0:
                raise ValueError('Transition duration must be nonnegative; hold must be positive.')
            scene['_transition'] = duration
            self.starts.append(elapsed)
            self.lengths.append(duration + hold)
            elapsed += duration + hold
            if 'scroll' in scene:
                scroll = scene['scroll']
                x,y,w,h = scroll['viewport']
                if min(x,y) < 0 or min(w,h) <= 0 or x+w > self.w or y+h > self.h:
                    raise ValueError('Scroll viewport must fit inside the phone.')
                content = Image.open(self.path(scroll['file'])).convert('RGB')
                content = content.resize((w, round(content.height*w/content.width)), RESAMPLE)
                limit = content.height-h
                if limit < 0 or not 0 <= scroll.get('initial',0) <= limit:
                    raise ValueError('Scroll content must fill viewport; initial offset must be in bounds.')
                end = 0
                for step in scroll['steps']:
                    if step['at'] < end or step['duration'] <= 0 or not 0 <= step['to'] <= limit:
                        raise ValueError('Scroll steps must be ordered, non-overlapping and in bounds.')
                    end = step['at']+step['duration']
                if end > duration+hold:
                    raise ValueError('Scroll steps must finish before the scene ends.')
                self.scroll_images[i] = content
            for overlay in scene.get('overlays', []):
                self.load_media(overlay)
        self.intro = c.get('intro', .8)
        self.outro = c.get('outro', 1.5)
        if min(self.intro, self.outro) < 0:
            raise ValueError('Intro/outro must be nonnegative.')
        self.content_duration = elapsed
        self.duration = self.intro + elapsed + self.outro

    def path(self, value):
        return ASSETS / value[1:] if value.startswith('@') else self.root / value

    def load_media(self, spec):
        key = json.dumps(spec, sort_keys=True)
        if key in self.media:
            return
        file = self.path(spec['file'])
        _, _, w, h = spec['box']
        frames, ends = [], []
        if file.suffix.lower() in ('.mp4', '.mov', '.webm'):
            # Normalize frame rate and decode only the requested segment into memory.
            fps = spec.get('fps', 30)
            seconds = spec.get('max_duration', 10)
            result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-ss', str(spec.get('trim_start', 0)), '-i', str(file), '-t', str(seconds), '-vf', f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True)
            for n, pixels in enumerate(np.frombuffer(result.stdout, np.uint8).reshape(-1, h, w, 3)):
                frames.append(Image.fromarray(pixels).convert('RGBA'))
                ends.append((n+1)/fps)
        else:
            with Image.open(file) as im:
                elapsed = 0
                for frame in ImageSequence.Iterator(im):
                    frames.append(frame.convert('RGBA').resize((w, h), RESAMPLE))
                    elapsed += max(.01, frame.info.get('duration', 100)/1000)
                    ends.append(elapsed)
        if not frames:
            raise ValueError(f'No frames decoded: {file}')
        self.media[key] = frames, ends

    @staticmethod
    def scroll_offset(scroll, t):
        offset = scroll.get('initial', 0)
        for step in scroll['steps']:
            if t < step['at']:
                return offset
            if t < step['at']+step['duration']:
                u = (t-step['at'])/step['duration']
                eased = u*u*(3-2*u)
                return offset+(step['to']-offset)*eased
            offset = step['to']
        return offset

    def scene_image(self, index, t):
        scene = self.scenes[index]
        im = self.screens[scene['screen']].copy()
        if 'scroll' in scene:
            scroll = scene['scroll']
            x,y,w,h = scroll['viewport']
            offset = round(self.scroll_offset(scroll,t))
            im.paste(self.scroll_images[index].crop((0,offset,w,offset+h)), (x,y))
        for patch in scene.get('patches', []):
            ImageDraw.Draw(im).rectangle(patch['box'], fill=patch['fill'])
        for spec in scene.get('overlays', []):
            dt = t - spec.get('start', 0)
            if dt < 0 or ('end' in spec and t >= spec['end']):
                continue
            frames, ends = self.media[json.dumps(spec, sort_keys=True)]
            dt = dt * spec.get('speed', 1)
            if spec.get('loop', True):
                dt %= ends[-1]
            tile = frames[min(len(frames)-1, bisect.bisect_right(ends, dt))].copy()
            if 'chroma_key' in spec:
                pixels = np.array(tile)
                distance = np.linalg.norm(pixels[:, :, :3].astype(float)-np.array(spec['chroma_key']), axis=2)
                pixels[:, :, 3] = np.uint8(pixels[:, :, 3] * np.clip((distance-spec.get('key_threshold', 10))/spec.get('key_softness', 24), 0, 1))
                tile = Image.fromarray(pixels)
            if spec.get('blur'):
                tile = tile.filter(ImageFilter.GaussianBlur(spec['blur']))
            im.paste(tile, tuple(spec['box'][:2]), tile)
        for event in scene.get('taps', []):
            p = (t-event['at'])/.19
            if 0 <= p <= 1:
                layer = Image.new('RGBA', (self.w*2, self.h*2))
                ImageDraw.Draw(layer).rounded_rectangle(tuple(round(v*2) for v in event['box']), radius=18, fill=(22, 51, 0, round(42*math.sin(math.pi*p))))
                im = Image.alpha_composite(im.convert('RGBA'), layer.resize(im.size, RESAMPLE)).convert('RGB')
        return im

    def phone(self, t):
        i = min(len(self.scenes)-1, max(0, bisect.bisect_right(self.starts, t)-1))
        local = t-self.starts[i]
        scene = self.scenes[i]
        duration = scene['_transition']
        new = self.scene_image(i, local)
        trans = scene.get('transition', {})
        kind = trans.get('type', 'cut')
        if i and kind == 'modal-in':
            # Keep the live backdrop throughout the hold; never swap back to a
            # screenshot's baked dimming/status bar when the animation finishes.
            under = self.scene_image(i-1, self.lengths[i-1])
            return self.modal_frame(under, new, local, duration, trans, True)
        if not duration or local >= duration:
            return new
        old = self.scene_image(i-1, self.lengths[i-1]+local)
        p = motion(local/duration, self.motion['page']['bezier'])
        trans = scene['transition']
        kind = trans['type']
        if kind == 'fade':
            return Image.blend(old, new, p)
        if kind in ('push', 'pop', 'rise'):
            if kind == 'rise':
                result = old.copy()
                result.paste(new, (0, round(self.h*(1-p))))
                return result
            page = self.motion['page']
            result = Image.new('RGB', old.size, 'white')
            def layer(im, x, opacity, radius=0):
                mask = rounded(im.size, radius) if radius else Image.new('L', im.size, 255)
                result.paste(im, (round(x),0), mask.point(lambda v: round(v*opacity)))
            if kind == 'push':
                layer(old, -self.w*page['parallax']*p, 1-(1-page['old_opacity'])*p)
                alpha = motion(local/(page['opacity_duration']*duration/page['duration']), (0,0,.58,1))
                layer(new, self.w*(1-p), page['new_opacity']+(1-page['new_opacity'])*alpha, page['radius']*(1-p))
            else:
                layer(new, -self.w*page['parallax']*(1-p), page['old_opacity']+(1-page['old_opacity'])*p)
                layer(old, self.w*p, 1-(1-page['new_opacity'])*p, page['radius']*p)
            return result
        return self.modal_frame(new, old, local, duration, trans, False)

    def modal_frame(self, under, sheet, local, duration, trans, entering):
        # Apply one full-phone backdrop to the undimmed page. Source pixels
        # above the actual modal edge never enter the moving layer.
        sheet_motion = self.motion[trans.get('preset', 'sheet')]
        scale = max(duration, .000001)/(sheet_motion['duration']+sheet_motion['delay'])
        progress = max(0, min(1, (local-sheet_motion['delay']*scale)/(sheet_motion['duration']*scale)))
        spring = motion(progress, sheet_motion['bezier']) if 'bezier' in sheet_motion else float(np.interp(progress, *zip(*sheet_motion['points'])))
        visibility = spring if entering else 1-spring
        dim_progress = motion(local/(sheet_motion['dim_duration']*scale), (.25,.1,.25,1))
        dim_visibility = dim_progress if entering else 1-dim_progress
        result = Image.blend(under, Image.new('RGB', under.size, 'black'), trans.get('dim', sheet_motion['dim'])*dim_visibility)
        top = trans.get('top', 54)
        tile = sheet.crop((0, top, self.w, self.h))
        result.paste(tile, (0, top+round((self.h-top+sheet_motion['extra_travel'])*(1-visibility))), rounded(tile.size, trans.get('radius', sheet_motion['radius']), True))
        return result

    def presentation_frame(self, t):
        im = self.phone(t)
        # Global content-time paths keep the desktop pointer independent of page slides.
        keys = self.cfg.get('cursor', [])
        if keys:
            point = keys[0]
            x, y = point['x'], point['y']
            for a, b in zip(keys, keys[1:]):
                if t < a['at']:
                    break
                u = max(0, min(1, (t-a['at'])/max(.001,b['at']-a['at'])))
                u = u*u*(3-2*u)
                x, y = a['x']+(b['x']-a['x'])*u, a['y']+(b['y']-a['y'])*u
                if t <= b['at']:
                    break
            pressed = any(k.get('click') and 0 <= t-k['at'] <= .12 for k in keys)
            scale = .85 if pressed else 1
            points = [(x+px*scale,y+py*scale) for px,py in [(0,0),(0,24),(6,18),(11,28),(16,25),(11,16),(21,16)]]
            ImageDraw.Draw(im).polygon(points, fill='white', outline='#21231D', width=2)
        for z in self.cfg.get('zooms', []):
            start, duration, hold = z['at'], z.get('duration', .65), z.get('hold', 1.5)
            local = t-start
            if 0 <= local <= duration*2+hold:
                u = min(1, local/duration) if local <= duration+hold else 1-(local-duration-hold)/duration
                ease = u*u*(3-2*u)
                scale = 1+(z.get('scale',1.6)-1)*ease
                cw, ch = self.w/scale, self.h/scale
                cx = self.w/2+(z['x']-self.w/2)*ease
                cy = self.h/2+(z['y']-self.h/2)*ease
                left, top = max(0,min(self.w-cw,cx-cw/2)), max(0,min(self.h-ch,cy-ch/2))
                im = im.transform(im.size, Image.Transform.EXTENT, (left,top,left+cw,top+ch), Image.Resampling.BICUBIC)
        return im

    def frame(self, t):
        im = self.base.copy()
        if self.logo:
            im.paste(self.logo, ((self.size[0]-self.logo.width)//2, (self.size[1]-self.logo.height)//2), self.logo)
        enter = motion((t-.1)/max(.01, self.intro-.15)) if self.intro else 1
        leave = motion((t-self.intro-self.content_duration)/min(.70, max(.01, self.outro))) if self.outro else 0
        fade_duration = self.cfg.get('phone_fade_duration', .45)
        if fade_duration <= 0:
            raise ValueError('phone_fade_duration must be positive.')
        fade_in = motion((t-.1)/min(fade_duration, max(.01, self.intro-.15))) if self.intro else 1
        fade_out = motion((t-self.intro-self.content_duration)/min(fade_duration, max(.01, self.outro))) if self.outro else 0
        opacity = fade_in*(1-fade_out)
        if opacity > 0:
            offset = round(24*(1-enter)+24*leave)
            im.paste(self.presentation_frame(max(0, min(self.content_duration-1/self.fps, t-self.intro))), (self.x, self.y+offset), self.mask.point(lambda v: round(v*opacity)))
        return im

    def render(self, output):
        output.parent.mkdir(parents=True, exist_ok=True)
        if self.cfg.get('native_capture'):
            capture = json.loads(self.path(self.cfg['native_capture']).read_text())
            provenance = {'origin':'native prototype recording; no reconstructed UI transitions', 'capture':capture}
        else:
            provenance = {'origin':self.motion_origin, 'motion':self.motion}
        output.with_suffix('.motion.json').write_text(json.dumps(provenance,indent=2)+'\n')
        print(f"Motion source: {provenance['origin']}", flush=True)
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        with output.with_suffix('.encode.log').open('w') as log:
            p = subprocess.Popen([ffmpeg, '-y', '-v', 'warning', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{self.size[0]}x{self.size[1]}', '-r', str(self.fps), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], stdin=subprocess.PIPE, stderr=log)
            try:
                for n in range(math.ceil(self.fps*self.duration)):
                    p.stdin.write(self.frame(n/self.fps).tobytes())
            finally:
                p.stdin.close()
                code = p.wait()
            if code:
                raise RuntimeError(f'Encoding failed; see {output.with_suffix(".encode.log")}')
        subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-i', str(output), '-f', 'null', '-'], check=True)
        times = [0, self.duration-1/self.fps]
        for start, length, scene in zip(self.starts, self.lengths, self.scenes):
            times.append(self.intro+start+length/2)
            if scene['_transition']:
                times.append(self.intro+start+scene['_transition']/2)
        times.sort()
        thumb_w = 270
        thumb_h = round(thumb_w*self.size[1]/self.size[0])
        contact = Image.new('RGB', (thumb_w*4, thumb_h*math.ceil(len(times)/4)), '#dddddd')
        for n, t in enumerate(times):
            tile = self.frame(t).resize((thumb_w, thumb_h), RESAMPLE)
            ImageDraw.Draw(tile).text((8, 8), f'{t:.2f}s', fill='black', stroke_width=1, stroke_fill='white')
            contact.paste(tile, (n%4*thumb_w, n//4*thumb_h))
        contact.save(output.with_suffix('.contact.jpg'))
        print(f'{output}\n{math.ceil(self.fps*self.duration)} frames, {self.fps} fps; full decode passed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('storyboard', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--format', choices=FORMATS)
    parser.add_argument('--background', help='Palette name or hex color')
    parser.add_argument('--background-image', type=Path)
    parser.add_argument('--logo', choices=['on','off'])
    parser.add_argument('--logo-color', help='Logo color for a photo background')
    parser.add_argument('--base-surfaces', type=Path)
    args = parser.parse_args()
    overrides = {k:v for k,v in vars(args).items() if k not in ('storyboard','output') and v is not None}
    for key in ('background_image','base_surfaces'):
        if key in overrides: overrides[key] = str(overrides[key].resolve())
    if 'logo' in overrides: overrides['logo'] = overrides['logo'] == 'on'
    Movie(args.storyboard.resolve(), overrides).render(args.output.resolve())
