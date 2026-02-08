# ClamAV Production Integration

## Purpose
ClamAV is the malware scanning engine for evidence uploads. Production deployments must run the ClamAV daemon (`clamd`) and expose a local Unix socket for the worker service.

## Installation

### Ubuntu/Debian
```
sudo apt-get update
sudo apt-get install -y clamav clamav-daemon
sudo systemctl enable clamav-daemon
sudo systemctl start clamav-daemon
```

### macOS (Homebrew)
```
brew install clamav
# Update signatures
grep -q '^DatabaseDirectory' /usr/local/etc/clamav/freshclam.conf || echo "DatabaseDirectory /usr/local/var/lib/clamav" >> /usr/local/etc/clamav/freshclam.conf
freshclam
# Start clamd
/usr/local/sbin/clamd --config-file=/usr/local/etc/clamav/clamd.conf
```

## Required Environment Variables
- `CLAMD_SOCKET` (default `/var/run/clamav/clamd.ctl`)
- `CLAMAV_ENABLED` (`true` by default; set `false` to disable scanning)
- `CLAMD_TIMEOUT` (default `30000` ms)

## Health Check
The worker service performs a periodic ClamAV health check on startup and every 60 seconds:
- Logs `ClamAV available (version...)` when healthy
- Logs `ClamAV enabled but unavailable` when the daemon is down
- Logs `ClamAV disabled` when `CLAMAV_ENABLED=false`

## EICAR Test (Required)
The EICAR test file is a harmless antivirus test string. Use the script below to verify detection.

```
pnpm tsx scripts/clamav-eicar-test.ts
```

Expected output:
- `status=INFECTED`
- `threat=Eicar-Test-Signature`

## Fallback Policy
- **Production:** If `CLAMAV_ENABLED=true` and ClamAV is unavailable, malware scan jobs return `ERROR` and uploads should be treated as *not scanned*. Do not mark evidence as `CLEAN` without ClamAV.
- **Development/Test:** Set `CLAMAV_ENABLED=false` to return a stub `CLEAN` result and unblock local development.

## Evidence Flow Notes
- The worker scans blob content by hash via `readBlob()` and quarantines via `quarantineBlob()` when infected.
- Scan results are written to evidence blob status in the API layer.
