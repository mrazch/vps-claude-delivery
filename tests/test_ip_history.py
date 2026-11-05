import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ip_history", Path(__file__).resolve().parents[1] / "scripts/check-ip-history.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
IP = "8.8.8.8"  # Synthetic input only: all requests are replaced by mocks.
CLEAN = {"data": {"ipAddress": IP, "isPublic": True, "abuseConfidenceScore": 0, "totalReports": 0, "lastReportedAt": None}}

class HistoryTests(unittest.TestCase):
    def test_window_result_is_not_lifetime_guarantee(self):
        self.assertEqual(mod.evaluate(CLEAN, IP)["status"], "no-records-in-window")

    def test_zero_score_with_reports_is_flagged(self):
        value = copy.deepcopy(CLEAN)
        value["data"]["totalReports"] = 1
        self.assertEqual(mod.evaluate(value, IP)["status"], "flagged")

    def test_old_record_or_positive_score_is_flagged(self):
        for key, value in [("lastReportedAt", "2020-01-01T00:00:00Z"), ("abuseConfidenceScore", 1)]:
            item = copy.deepcopy(CLEAN); item["data"][key] = value
            self.assertEqual(mod.evaluate(item, IP)["status"], "flagged")

    def test_invalid_or_wrong_ip_is_not_clean(self):
        for field, value in [("ipAddress", "1.1.1.1"), ("isPublic", False), ("totalReports", True), ("abuseConfidenceScore", "0"), ("lastReportedAt", "invalid")]:
            item = copy.deepcopy(CLEAN); item["data"][field] = value
            with self.assertRaises(mod.InvalidEvidence): mod.evaluate(item, IP)
        for field in CLEAN["data"]:
            item = copy.deepcopy(CLEAN); del item["data"][field]
            with self.assertRaises(mod.InvalidEvidence): mod.evaluate(item, IP)

    def fixture(self, root):
        folder = root / "runtime/ip-history"; folder.mkdir(parents=True)
        (folder / "input.json").write_text(json.dumps({"ip": IP, "apiKey": "synthetic-key", "purpose": "assigned"}))
        return folder

    def test_receipt_is_local_and_redacted_output_has_no_ip_or_key(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); folder = self.fixture(root)
            with patch.object(mod, "fetch", return_value=CLEAN): result = mod.check(root)
            self.assertEqual(result["maxAgeInDays"], 365)
            self.assertIs(result["lifetimeCleanProven"], False)
            self.assertNotIn(IP, json.dumps(result)); self.assertNotIn("synthetic-key", json.dumps(result))
            receipt = json.loads((root / result["receipt"]).read_text())
            self.assertEqual(receipt["ip"], IP)
            self.assertNotIn("synthetic-key", json.dumps(receipt))

    def test_query_failure_is_unknown(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); self.fixture(root)
            with patch.object(mod, "fetch", side_effect=OSError("secret error")):
                result = mod.check(root)
            self.assertEqual(result["status"], "unknown"); self.assertNotIn("secret", json.dumps(result))

    def test_history_warning_survives_later_clean_query(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); folder = self.fixture(root)
            (folder / "receipt-old.json").write_text(json.dumps({"ip": IP, "status": "flagged"}))
            with patch.object(mod, "fetch", return_value=CLEAN): result = mod.check(root)
            self.assertEqual(result["status"], "flagged")
            self.assertTrue(result["previousRecordFound"])

    def test_no_flag_never_queries(self):
        with patch("sys.argv", ["check-ip-history.py"]), patch.object(mod, "fetch", side_effect=AssertionError()), patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(mod.main(), 0)

    def test_invalid_local_inputs_never_query(self):
        for changes in [{"ip": "127.0.0.1"}, {"ip": "224.0.0.1"}, {"apiKey": ""}, {"ip": "node.example.invalid"}, {"purpose": "other"}]:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp); folder = self.fixture(root)
                value = json.loads((folder / "input.json").read_text()); value.update(changes)
                (folder / "input.json").write_text(json.dumps(value))
                with patch.object(mod, "fetch", side_effect=AssertionError("network forbidden")) as request:
                    with self.assertRaises((mod.InvalidEvidence, ValueError)): mod.check(root)
                    request.assert_not_called()

    def test_flagged_receipt_remains_visible_when_next_query_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); folder = self.fixture(root)
            (folder / "receipt-old.json").write_text(json.dumps({"ip": IP, "status": "flagged"}))
            with patch.object(mod, "fetch", side_effect=OSError("offline")):
                self.assertEqual(mod.check(root)["status"], "flagged")

    def test_request_uses_fixed_host_header_key_and_365_days(self):
        opener = unittest.mock.MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.status = 200; response.read.return_value = json.dumps(CLEAN).encode()
        with patch.object(mod.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(mod.fetch(IP, "synthetic-key"), CLEAN)
        request = opener.open.call_args.args[0]
        self.assertTrue(request.full_url.startswith(mod.ENDPOINT + "?"))
        self.assertIn("maxAgeInDays=365", request.full_url)
        self.assertNotIn("synthetic-key", request.full_url)
        self.assertEqual(request.get_header("Key"), "synthetic-key")
        self.assertIsNone(mod.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.invalid"))

if __name__ == "__main__": unittest.main()
