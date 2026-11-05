"""Customer-side read-only AbuseIPDB check. No checks occur without --check."""
import argparse
from datetime import datetime, timezone
import ipaddress
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
DAYS = 365
ENDPOINT = "https://api.abuseipdb.com/api/v2/check"


class InvalidEvidence(ValueError):
    pass


def evaluate(payload, expected_ip):
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise InvalidEvidence("invalid-response")
    try:
        same = ipaddress.ip_address(data.get("ipAddress")) == ipaddress.ip_address(expected_ip)
    except (ValueError, TypeError):
        raise InvalidEvidence("ip-mismatch")
    if not same or data.get("isPublic") is not True:
        raise InvalidEvidence("ip-mismatch")
    score, reports = data.get("abuseConfidenceScore"), data.get("totalReports")
    if type(score) is not int or not 0 <= score <= 100 or type(reports) is not int or reports < 0:
        raise InvalidEvidence("missing-evidence")
    last = data.get("lastReportedAt")
    if "lastReportedAt" not in data or (last is not None and not isinstance(last, str)):
        raise InvalidEvidence("missing-evidence")
    if last is not None:
        try:
            stamp = datetime.fromisoformat(last.replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError()
        except ValueError:
            raise InvalidEvidence("invalid-report-time")
    flagged = reports > 0 or score > 0 or last is not None
    return {"status": "flagged" if flagged else "no-records-in-window",
            "abuseConfidenceScore": score, "totalReports": reports, "lastReportedAt": last,
            "message": "发现滥用报告或风险记录，请告知客户并换 IP；不要部署或切换到该 IP。" if flagged else
                       "仅在本次来源与查询范围内未查到报告，不证明从未被滥用；仍需核对其他明确污染记录。"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(ip, key):
    query = urllib.parse.urlencode({"ipAddress": ip, "maxAgeInDays": DAYS})
    request = urllib.request.Request(ENDPOINT + "?" + query,
        headers={"Key": key, "Accept": "application/json"})
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(request, timeout=25) as response:
        if response.status != 200:
            raise InvalidEvidence("query-failed")
        raw = response.read(1048577)
        if len(raw) > 1048576:
            raise InvalidEvidence("response-too-large")
        return json.loads(raw)


def check(root=ROOT):
    folder = root / "runtime" / "ip-history"
    # Refuse redirected local paths; never read keys from another workspace.
    for part in [root / "runtime", folder, folder / "input.json"]:
        if part.is_symlink():
            raise InvalidEvidence("unsafe-input-path")
    file = folder / "input.json"
    if file.stat().st_size > 8192:
        raise InvalidEvidence("invalid-input")
    args = json.loads(file.read_text(encoding="utf-8-sig"))
    if not isinstance(args, dict) or set(args) != {"ip", "apiKey", "purpose"}:
        raise InvalidEvidence("invalid-input")
    if not isinstance(args["ip"], str):
        raise InvalidEvidence("invalid-input")
    ip = ipaddress.ip_address(args["ip"])
    if not ip.is_global or ip.is_multicast or args["purpose"] not in ["candidate", "assigned", "existing"]:
        raise InvalidEvidence("invalid-input")
    key = args["apiKey"]
    if not isinstance(key, str) or not key.strip() or len(key) > 512 or any(c.isspace() for c in key):
        raise InvalidEvidence("missing-api-key")
    result = {"source": "AbuseIPDB", "checkedAt": datetime.now(timezone.utc).isoformat(),
              "maxAgeInDays": DAYS, "purpose": args["purpose"], "lifetimeCleanProven": False}
    try:
        result.update(evaluate(fetch(str(ip), key), str(ip)))
    except Exception:
        result.update(status="unknown", message="查询失败或证据不完整，不得记为通过。保留原连接，核对 API 权限或官网结果后再查。")
    for old in folder.glob("receipt-*.json"):
        if old.is_symlink() or old.stat().st_size > 16384:
            raise InvalidEvidence("unsafe-receipt")
        previous = json.loads(old.read_text(encoding="utf-8"))
        if previous.get("ip") == str(ip) and previous.get("status") == "flagged":
            result.update(status="flagged", previousRecordFound=True,
                          message="本机曾保存该 IP 的风险记录。即使当前评分为 0，也不能清除历史提醒；请告知客户并换 IP。")
    # Each attempt has a new immutable local receipt. No raw response or API key is persisted.
    name = "receipt-" + uuid4().hex + ".json"
    with (folder / name).open("x", encoding="utf-8") as output:
        json.dump({**result, "ip": str(ip)}, output, ensure_ascii=False, indent=2)
    return {**result, "receipt": "runtime/ip-history/" + name}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="query only on an authorized customer device")
    args = parser.parse_args()
    if not args.check:
        print(json.dumps({"status": "not-started", "next": "参阅 guides/ip-history.md，在客户设备准备输入并授权查询后使用 --check。"}, ensure_ascii=False))
        return 0
    try:
        result = check()
    except Exception:
        result = {"status": "unknown", "message": "输入缺失、不安全或格式错误。按 guides/ip-history.md 核对本地输入；不要上传密钥，不能使用旧回执代替本次检查。"}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "no-records-in-window" else 1


if __name__ == "__main__":
    raise SystemExit(main())
