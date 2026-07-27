"""
AIS adapter (TideWatch E8).

Pluggable source of AIS-reported vessel counts for an AOI, used to estimate
"dark" vessels = EO-detected vessels minus AIS-reported vessels. A dark vessel
is one seen in imagery but broadcasting no AIS transponder signal — the core
signal marine insurers and sanctions-compliance buyers pay for.

Mode is set by env AIS_MODE:
  - "off"  (default): returns None. Feature dormant — emits NO signal, so we
            never raise a false dark-vessel alert without a real AIS source.
  - "stub": deterministic, input-derived count for demos/tests (no network).
  - "http": call a real AIS provider at AIS_ENDPOINT (structure provided;
            wire a concrete provider before enabling in production).

Returning None everywhere it cannot produce a trustworthy number is deliberate:
dark-vessel detection must degrade to "unknown", never to a fabricated count.
"""
import os
import hashlib


def get_ais_vessel_count(aoi_id, bbox, timestamp):
    """AIS-reported vessel count for the AOI at a time, or None if unavailable."""
    mode = os.environ.get("AIS_MODE", "off").lower()
    if mode == "stub":
        return _stub_count(aoi_id, timestamp)
    if mode == "http":
        return _http_count(aoi_id, bbox, timestamp)
    return None  # "off" or unknown mode


def _stub_count(aoi_id, timestamp):
    # Deterministic pseudo count derived from inputs so demos/tests reproduce.
    h = hashlib.sha256(f"{aoi_id}|{timestamp}".encode()).hexdigest()
    return int(h[:2], 16) % 12  # 0..11 AIS-reported vessels


def _http_count(aoi_id, bbox, timestamp):
    endpoint = os.environ.get("AIS_ENDPOINT")
    if not endpoint:
        print("WARN: AIS_MODE=http but AIS_ENDPOINT is unset; returning None")
        return None
    # TODO: real provider integration (e.g. Spire/AISHub/exactEarth). Kept
    # dependency-free here; implement with urllib.request against the signed
    # provider contract, mapping bbox+time-window -> unique MMSI count.
    print(f"WARN: AIS http provider not yet implemented for {endpoint}")
    return None
