# 2026-06-20 — Fixing "Unable to join call" + recording (LiveKit / OpenVidu Elastic, new AWS account)

**Outcome:** Call now connects and works. Root cause was a browser-untrusted TLS
certificate on the OpenVidu master node. Recording path (bucket name + IAM + signed
URLs) was also corrected in the Cloud Functions.

**Environment**
- AWS account `968234051275`, region `ap-south-1`
- OpenVidu Elastic 3.7.0 PRO, master node `i-05b2c332ec7c9e4ca` @ Elastic IP `3.7.142.232`
- Domain (sslip.io): `openvidu-msqkmnut-3-7-142-232.sslip.io`
- Media nodes: ASG `openvidu-elastic-media-asg-ap-south-1-OpenViduElastic`
- Firebase project `starlabs-test` (Cloud Functions, us-central1 / asia-south1)
- Angular dev app: `localhost:4200/joinlivekit/<roomId>`
- SSH key: `~/.ssh/openvidu-elastic-mumbai.pem` (user `ubuntu`)

---

## Problem 1 — Unable to join the call (the headline issue)

### Symptom
Browser console on join:
```
Token received: { success: true, url: 'wss://openvidu-msqkmnut-3-7-142-232.sslip.io/', ... }
WebSocket connection to 'wss://openvidu-msqkmnut-3-7-142-232.sslip.io/rtc?...' failed
ConnectionError: could not establish signal connection: Websocket got closed during a (re)connection attempt
GET https://openvidu-msqkmnut-3-7-142-232.sslip.io/rtc/validate?... net::ERR_FAILED
```
Token generation succeeded — the failure was purely at the WebSocket/TLS layer.

### Diagnosis (what ruled things in/out)
- `curl` to the validate endpoint returned **HTTP 401** (server is up and answering;
  401 is expected for an unauthenticated probe). So backend/signaling was healthy.
- TLS probe: `ssl_verify_result = 20` (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`) and
  `issuer = CN=Caddy Local Authority - ECC Intermediate` → **self-signed cert**.
- Cert validity was only ~12 hours and regenerated on each master restart — classic
  Caddy *internal CA* behaviour.
- Media ASG was healthy (`Desired=1`, one `InService` node), so not a media issue.

**Root cause:** OpenVidu was deployed with `certificateType: selfsigned`. Caddy served
its own internal CA cert, which **browsers do not trust**, so the LiveKit signaling
WebSocket was killed with `net::ERR_FAILED`. Node.js (Cloud Functions) tolerated the
same endpoint only because it sets `NODE_TLS_REJECT_UNAUTHORIZED=0`. The previous
(working) AWS account had used Let's Encrypt.

### Fix — switch Caddy from self-signed to Let's Encrypt
The cert issuer is **not** exposed via an `openvidu.env` knob; it's baked into Caddy's
TLS automation policy. Two files matter:
- **Source template:** `/opt/openvidu/config/cluster/master_node/caddy.yaml`
  (has `${openvidu.X}` placeholders; survives full stack regen)
- **Runtime (what Caddy actually reads):**
  `/opt/openvidu/data/runtime/config/caddy/caddy.yaml`
  (fully interpolated; mounted into the `caddy` container at `/config`)

> ⚠️ Gotcha: `docker restart caddy` re-reads the **runtime** file, NOT the source
> template. Editing only the source has no effect until OpenVidu regenerates the
> runtime copy. We edited **both** (source for durability, runtime for immediate effect).

Issuer block change in both files:
```yaml
# before
    automation:
      policies:
        - issuers:
          - module: internal
# after
    automation:
      policies:
        - issuers:
          - module: acme
            email: appexperience@soexcellence.com
            challenges:
              tls-alpn:
                disabled: true        # force HTTP-01; port 443 is wrapped by layer4
```
Why disable `tls-alpn`: port 443 is handled by Caddy's `layer4` app (TURN/HTTP demux),
so the TLS-ALPN-01 challenge can't terminate cleanly there. HTTP-01 on port 80 (the
`redirect` server) is reliable — Caddy auto-injects the `/.well-known/acme-challenge/*`
handler.

Pre-flight checks before flipping (all passed):
- DNS: `openvidu-msqkmnut-3-7-142-232.sslip.io` → `3.7.142.232`
- SG `sg-097e215d6edc39d48`: ports 80 and 443 open to `0.0.0.0/0`
- Port 80 reachable (Caddy answered HTTP 301)

Apply:
```bash
# backups made: caddy.yaml.bak-selfsigned (both source and runtime)
sudo cp <edited> /opt/openvidu/data/runtime/config/caddy/caddy.yaml
sudo docker restart caddy
```

### Verification
```
issuer=C=US, O=Let's Encrypt, CN=YE2
subject=CN=openvidu-msqkmnut-3-7-142-232.sslip.io
notBefore=Jun 20 08:45:48 2026 GMT  notAfter=Sep 18 08:45:47 2026 GMT
curl https://.../rtc/validate  ->  HTTP 401  verify=0   (trusted, no -k needed)
```
LE issuance took ~15–20s after restart. Call connects cleanly afterwards.

**Persistence:** the cert lives in the `caddy_data` EBS volume and survives master
stop/start — no re-issuance needed on next boot, and well under LE rate limits.

---

## Problem 2 — Recording never landed in S3 (fixed earlier same day)

### Symptom
Meeting ended; S3 bucket empty.

### Diagnosis
From `onEventOpenVidu` webhook logs, the `egress_ended` event showed the recording
**completed** (7.07 MB, 17s) but with:
```
bucket: "openvidu-meet-recordings-test"        # does not exist
backupStorageUsed: true
location: /home/egress/backup_storage/recordings/WLBYpSr6Js8LbMibg74H-1781899974316.mp4
```
S3 upload failed, so egress fell back to **local backup storage on the media node**.
That media node (`i-0f950d1b7399912af`) was terminated by the ASG ~84s later, deleting
its EBS volume. **That specific recording was unrecoverable** (no snapshot existed).

Three root causes in the Cloud Functions:
1. Wrong bucket name — code used `openvidu-meet-recordings-test` / `openvidu-meet-recordings`,
   neither exists. Actual CloudFormation bucket: **`openvidu-appdata-862fbbc0`**.
2. IAM user `starlabs-functions` had **no S3 permissions** (EC2/ASG only). Egress uses
   these creds to upload.
3. `getSignedUrlAWS` (recording playback URLs) used wrong region `us-east-1` + wrong bucket.

### Fix (Firebase Functions repo)
- `functions/components/openVidu.js` (~line 315): bucket → `openvidu-appdata-862fbbc0`
- `functions/components/AWS_endpoint.js` (`getSignedUrlAWS`): region → `ap-south-1`,
  bucket → `openvidu-appdata-862fbbc0`
- IAM inline policy `starlabs-functions-policy`: added
  `s3:PutObject/GetObject/ListBucket/DeleteObject` on
  `arn:aws:s3:::openvidu-appdata-862fbbc0[/*]`
- Deployed `openViduStartRecording`, `openViduStopRecording`, `onEventOpenVidu`,
  `openViduCloseRoom`, `getSignedUrlAWS`.

> Deploy gotcha (recurring): `functions/package.json` `"main"` must be temporarily set
> to `index.openvidu-deploy.js` so the Firebase CLI sees the OpenVidu exports, then use
> targeted `--only "functions:..."` so it doesn't try to delete all other functions.
> **Always restore `"main": "index.emulator.js"` after.**

---

## Operational notes
- After confirming the call works, the fleet was spun down to save cost:
  - Media ASG → `Min=0, Desired=0` (terminates the media node)
  - Master node `i-05b2c332ec7c9e4ca` → stopped
  - Elastic IP `3.7.142.232` stays associated (~$3.60/mo) to preserve the sslip.io domain.
- To bring it back: start the master, set ASG `Min/Desired=1`. LE cert persists.

## Quick reference — checks used
```bash
# cert / trust
echo | openssl s_client -connect 3.7.142.232:443 \
  -servername openvidu-msqkmnut-3-7-142-232.sslip.io 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
curl -s -o /dev/null -w 'HTTP %{http_code} verify=%{ssl_verify_result}\n' \
  https://openvidu-msqkmnut-3-7-142-232.sslip.io/rtc/validate

# recordings
aws s3 ls s3://openvidu-appdata-862fbbc0/recordings/ --region ap-south-1
```
