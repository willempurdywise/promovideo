import unittest
from test_renderer import module, ROOT
import numpy as np

class DesktopTest(unittest.TestCase):
    def movie(self, **kw):
        return module.Movie(ROOT/'examples/generated/storyboard.json', {'device':'desktop','viewport':[1440,900], **kw})
    def test_fits_all_formats_and_intro(self):
        for fmt in module.FORMATS:
            m=self.movie(format=fmt)
            margin=round(min(m.size)*.08)
            self.assertGreaterEqual(m.x,margin)
            self.assertGreaterEqual(m.y,margin)
            self.assertLessEqual(m.y+m.h+24,m.size[1]-margin)
            self.assertAlmostEqual(m.w/m.h,1440/900,delta=.003)
    def test_zoom_returns_exactly_and_changes_focus(self):
        m=self.movie(zooms=[{'at':0,'x':200,'y':200,'scale':1.6,'duration':.65,'hold':1.5}])
        self.assertTrue(np.array_equal(m.phone(0),m.presentation_frame(0)))
        self.assertFalse(np.array_equal(m.phone(.65),m.presentation_frame(.65)))
        self.assertTrue(np.array_equal(m.phone(2.8),m.presentation_frame(2.8)))
    def test_cursor_moves_without_changing_background(self):
        m=self.movie(cursor=[{'at':0,'x':100,'y':100},{'at':1,'x':300,'y':100}])
        a=np.array(m.presentation_frame(0)); b=np.array(m.presentation_frame(1))
        self.assertFalse(np.array_equal(a[100:130,100:125],b[100:130,100:125]))
