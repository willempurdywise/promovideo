"""Behavior checks. Generate examples/make_example.py before running unittest."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('renderer', ROOT/'.agents/skills/promovideo/scripts/render.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RendererTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.movie = module.Movie(ROOT/'examples/generated/storyboard.json')

    def test_loop_boundary_matches(self):
        m = self.movie
        self.assertTrue(np.array_equal(m.frame(0), m.frame(m.duration-1/m.fps)))

    def test_background_stays_solid(self):
        m = self.movie
        for t in np.linspace(0, m.duration-1/m.fps, 20):
            pixels = np.array(m.frame(t))
            self.assertTrue(np.all(pixels[:, :m.x] == [159,232,112]))
            self.assertTrue(np.all(pixels[:, m.x+m.w:] == [159,232,112]))

    def test_gif_actually_changes(self):
        m = self.movie
        a = np.array(m.scene_image(4, .04))[350:420,160:230]
        self.assertTrue(any(not np.array_equal(a, np.array(m.scene_image(4,t))[350:420,160:230]) for t in (.2,.4,.8)))

    def test_bundled_video_decodes_and_animates(self):
        m = self.movie
        overlay = {'file':'@celebration-forest-green.mp4', 'box':[100,250,180,180], 'fps':60, 'max_duration':2, 'loop':False}
        m.load_media(overlay)
        frames, times = m.media[module.json.dumps(overlay, sort_keys=True)]
        self.assertGreater(len(frames), 60)
        self.assertFalse(np.array_equal(frames[0], frames[60]))

    def test_formats_and_centering(self):
        for fmt, size in module.FORMATS.items():
            m = module.Movie(ROOT/'examples/generated/storyboard.json', {'format':fmt})
            self.assertEqual(m.size, size)
            self.assertEqual((m.x,m.y), ((size[0]-390)//2,(size[1]-844)//2))

    def test_all_ten_colour_pairs(self):
        for name, color in module.COLORS.items():
            m = module.Movie(ROOT/'examples/generated/storyboard.json', {'background':name})
            expected = module.Image.new('RGB',(1,1),module.PARTNERS[color]).getpixel((0,0))
            pixels = np.array(m.logo)
            self.assertTrue(np.all(pixels[:,:,:3][pixels[:,:,3] == 255] == expected))

    def test_logo_disabled(self):
        m = module.Movie(ROOT/'examples/generated/storyboard.json', {'logo':False})
        self.assertIsNone(m.logo)
        self.assertTrue(np.all(np.array(m.frame(0)) == [159,232,112]))

    def test_photo_cover_without_stretch(self):
        with tempfile.TemporaryDirectory() as tmp:
            photo = Path(tmp)/'photo.png'
            im = module.Image.new('RGB',(200,100),'red')
            module.ImageDraw.Draw(im).rectangle((50,0,149,99),fill='blue')
            im.save(photo)
            m = module.Movie(ROOT/'examples/generated/storyboard.json', {'background_image':str(photo),'logo':False})
            self.assertTrue(np.all(np.array(m.base)[100:-100,100:-100] == [0,0,255]))

    def test_source_spring_overshoots(self):
        self.assertGreater(max(p[1] for p in self.movie.motion['spring_sheet']['points']), 1)
        self.assertAlmostEqual(self.movie.scenes[2]['_transition'], .5)
        self.assertNotIn('points', self.movie.motion['sheet'])

    def test_scroll_pauses_and_easing(self):
        scroll = {'steps':[{'at':1,'duration':.5,'to':180}, {'at':2,'duration':.5,'to':400}]}
        self.assertEqual(module.Movie.scroll_offset(scroll,.9), 0)
        self.assertEqual(module.Movie.scroll_offset(scroll,1.6), 180)
        self.assertEqual(module.Movie.scroll_offset(scroll,1.9), 180)
        self.assertEqual(module.Movie.scroll_offset(scroll,3), 400)
        early = module.Movie.scroll_offset(scroll,1.05)
        middle = module.Movie.scroll_offset(scroll,1.25)-module.Movie.scroll_offset(scroll,1.20)
        self.assertLess(early, middle)

    def test_modal_backdrop_stays_consistent_after_opening(self):
        m = self.movie
        start = m.starts[2]
        # The source modal has a baked #bfbfbf header. Use the preceding page
        # with 40% dim instead, before and after settling.
        under = m.scene_image(1, m.lengths[1])
        expected = module.Image.blend(under, module.Image.new('RGB',under.size,'black'), .4)
        for elapsed in (.49,.5,.8):
            self.assertTrue(np.array_equal(np.array(m.phone(start+elapsed))[:40], np.array(expected)[:40]))
        self.assertTrue(np.array_equal(np.array(m.phone(start))[:40], np.array(under)[:40]))

    def test_modal_backdrop_fades_as_one_layer(self):
        m = self.movie
        under = module.Image.new('RGB',(m.w,m.h),'white')
        sheet = module.Image.new('RGB',(m.w,m.h),'white')
        # A deliberately deeper edge excludes the screenshot's grey band.
        module.ImageDraw.Draw(sheet).rectangle((0,0,m.w,119), fill='#bfbfbf')
        im = m.modal_frame(under,sheet,.1,.5,{'top':120},True)
        self.assertEqual(im.getpixel((195,20)), im.getpixel((195,100)))
        self.assertLess(im.getpixel((195,20))[0],255)
        self.assertGreater(im.getpixel((195,20))[0],153)
        settled = m.modal_frame(under,sheet,.8,.5,{'top':120},True)
        self.assertEqual(settled.getpixel((195,100)),(153,153,153))
        self.assertEqual(settled.getpixel((195,130)),(255,255,255))

    def test_bad_transition_fails_before_render(self):
        config = module.json.loads((ROOT/'examples/generated/storyboard.json').read_text())
        for screen in config['screens'].values():
            screen['file'] = str(ROOT/'examples/generated'/screen['file'])
        config['scenes'][1]['transition']['type'] = 'typo'
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'storyboard.json'
            path.write_text(module.json.dumps(config))
            with self.assertRaisesRegex(ValueError, 'Unknown transition'):
                module.Movie(path)


if __name__ == '__main__':
    unittest.main()
