import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import breakdown  # noqa: E402


class BreakdownTests(unittest.TestCase):
    def test_frame_times_cover_the_reel(self):
        self.assertEqual(breakdown.frame_times(6.2, 2), [0.0, 2.0, 4.0, 6.0, 6.15])
        self.assertEqual(breakdown.first_second_times(0.5), [0.0, 0.25, 0.5])

    def test_scene_log_parser_skips_the_opening_frame(self):
        log = '\n'.join([
            'pts_time:0.000 n:0',
            'pts_time:1.25 n:1',
            'pts_time:1.30 n:2',
            'pts_time:4.5 n:3',
        ])
        self.assertEqual(breakdown.parse_scene_times(log), [1.25, 4.5])

    def test_markdown_includes_the_local_sections(self):
        text = breakdown.markdown_report({
            'file': 'rank01_ada_AbC.mp4',
            'durationSeconds': 6.2,
            'sceneCuts': [1.25],
            'frameSeconds': [0, 2],
            'frameEverySeconds': 2,
            'transcript': 'hello from the reel',
            'ocrText': 'SALE',
            'contactSheet': 'contact.jpg',
            'firstSecondSheet': 'first-second.jpg',
        })
        self.assertIn('rank01_ada_AbC.mp4', text)
        self.assertIn('hello from the reel', text)
        self.assertIn('SALE', text)
        self.assertIn('contact.jpg', text)


if __name__ == '__main__':
    unittest.main()
