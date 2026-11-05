import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("mac_download", Path(__file__).resolve().parents[1] / "scripts/mac/download_karing.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class DownloadTests(unittest.TestCase):
    def test_verified_download_and_cache(self):
        payload = b"synthetic installer bytes, never executable"
        with tempfile.TemporaryDirectory() as folder, patch.object(mod, "SHA256", hashlib.sha256(payload).hexdigest()):
            with patch.object(mod.urllib.request, "urlopen", return_value=io.BytesIO(payload)) as request:
                result = mod.download(folder)
                self.assertEqual(result["status"], "downloaded")
                request.assert_called_once_with(mod.URL, timeout=60)
            with patch.object(mod.urllib.request, "urlopen", side_effect=AssertionError("network forbidden")):
                self.assertEqual(mod.download(folder)["status"], "cached")

    def test_bad_download_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / mod.FILENAME
            target.write_bytes(b"existing bytes")
            with patch.object(mod.urllib.request, "urlopen", return_value=io.BytesIO(b"wrong bytes")):
                with self.assertRaisesRegex(mod.Failure, "karing_checksum_mismatch"):
                    mod.download(folder)
            self.assertEqual(target.read_bytes(), b"existing bytes")
            self.assertEqual(list(Path(folder).iterdir()), [target])

    def test_no_flag_never_downloads(self):
        with patch("sys.argv", ["download_karing.py"]), patch.object(mod, "download", side_effect=AssertionError("download forbidden")), patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(mod.main(), 0)
            self.assertEqual(json.loads(output.getvalue())["status"], "not-started")

    def test_download_failure_omits_raw_exception(self):
        with patch("sys.argv", ["download_karing.py", "--download"]), patch.object(mod, "download", side_effect=OSError("sensitive local path")), patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(mod.main(), 1)
            self.assertNotIn("sensitive", output.getvalue())
            self.assertEqual(json.loads(output.getvalue())["error"], "OSError")


if __name__ == "__main__":
    unittest.main()
