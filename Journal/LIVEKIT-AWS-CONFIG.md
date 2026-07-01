# LiveKit AWS config — match the tested videoconference baseline

This is the **Part B** runbook: bring the **existing Starlabs LiveKit AWS** (master node
`MASTER_INSTANCE_ID` + media Auto-Scaling Group `MEDIA_ASG_NAME`, region `us-east-1`,
controlled by the Firebase functions) in line with the documented/tested config from the
videoconference repo (`SETUP-JOURNAL.md`, `provision-plain.sh`).

> The DeepFilterNet3 audio runs **client-side**, so none of this is required to *enable* the
> feature — it governs **call quality/texture** (jitter, ICE, instance scheduling). Apply it to
> get the same audio quality the videoconference boxes had.

Apply on the EC2 instance(s) running `livekit-server` (master, and the media-node launch
template/AMI so new nodes inherit it). You need SSH/console access to those instances.

---

## 1. Instance family — the #1 audio rule
**Media instances MUST be `c6i` (fixed-performance), never `t3`/burstable.** A `t3` SFU passes
every average metric yet sounds audibly worse ("like echo") — shared-core scheduling jitter
perturbs realtime RTP forwarding.

- Check the media ASG launch template instance type:
  ```
  aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names <MEDIA_ASG_NAME> --region us-east-1
  aws ec2 describe-launch-template-versions --launch-template-id <lt-id> --region us-east-1 \
    --query 'LaunchTemplateVersions[].LaunchTemplateData.InstanceType'
  ```
- If it's `t3.*`, create a new launch-template version with **`c6i.xlarge`** (≈40 calls incl.
  reconnect storm) or `c6i.2xlarge`, set it `$Default`, then refresh the ASG.
- Master node: also `c6i` (e.g. `c6i.xlarge`). Resize via stop → modify instance type → start.

Other instance specs: **Ubuntu 22.04 LTS**, **60 GB gp3**.

## 2. Security group — inbound rules (all source `0.0.0.0/0`)
| Protocol | Port(s) | Purpose |
|---|---|---|
| TCP | 22 | SSH |
| TCP | 80 | HTTP / ACME (Caddy TLS challenge) |
| TCP | 443 | HTTPS (meet + LiveKit signaling) |
| TCP | 7881 | LiveKit TCP fallback (UDP-blocked clients) |
| UDP | 3478 | TURN |
| UDP | 7881 | LiveKit RTC |
| UDP | 50000–60000 | RTC media range |

```
aws ec2 authorize-security-group-ingress --group-id <sg-id> --region us-east-1 \
  --ip-permissions \
    IpProtocol=udp,FromPort=50000,ToPort=60000,IpRanges='[{CidrIp=0.0.0.0/0}]' \
    IpProtocol=udp,FromPort=3478,ToPort=3478,IpRanges='[{CidrIp=0.0.0.0/0}]' \
    IpProtocol=udp,FromPort=7881,ToPort=7881,IpRanges='[{CidrIp=0.0.0.0/0}]' \
    IpProtocol=tcp,FromPort=7881,ToPort=7881,IpRanges='[{CidrIp=0.0.0.0/0}]'
```
(22/80/443 are presumably already open.)

## 3. `livekit.yaml` — the critical settings
On the master node (and any media node config), ensure:
```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true        # CRITICAL
  # node_ip:  <-- MUST NOT be pinned to the EIP (causes TURN-relay fallback)
redis:
  address: localhost:6379
turn:
  enabled: true
  udp_port: 3478
keys:
  <APIKEY>: <SECRET>           # must match the Firebase secrets LIVEKIT_API_KEY / LIVEKIT_API_SECRET
```
**Hard rules:** `use_external_ip: true`; **never** set `node_ip: <EIP>` (the EIP isn't on the NIC →
flaky ICE → real TURN-relay fallback). The junk `docker0 172.17.0.1` candidate is harmless.

If LiveKit runs in a multi-node (master+media) cluster, keep the cluster's Redis/region settings;
only the `rtc`/`turn`/`use_external_ip` block above is what must match.

## 4. docker-compose (if LiveKit runs via compose)
```yaml
services:
  redis:
    image: redis:7-alpine
    network_mode: host
    command: redis-server --bind 127.0.0.1
    restart: unless-stopped
  livekit:
    image: livekit/livekit-server:v1.8     # pinned, not :latest
    network_mode: host                      # required for ICE + media ports
    restart: unless-stopped
    command: --config /etc/livekit.yaml
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    depends_on: [redis]
```
`network_mode: host` is required — bridged networking breaks ICE/media.

## 5. TLS / reverse proxy (Caddy, L7)
```
lk.<domain> {
    reverse_proxy 127.0.0.1:7880
}
```
Use **L7** `reverse_proxy` (not layer4 — layer4 throttles model/asset downloads). Caddy
auto-obtains Let's Encrypt certs via the port-80 ACME challenge.

## 6. Verify after applying
1. `wss://<lk-host>` returns the LiveKit WS upgrade; `https://<lk-host>` returns `OK`.
2. Join a 2-person call; in `chrome://webrtc-internals` confirm the selected ICE candidate pair is
   **host/srflx (direct), not relay** — if it's relay, `node_ip` is still pinned (rule #3).
3. Confirm media nodes are `c6i` in the EC2 console.
4. A/B audio: one server at a time, all other call tabs **fully closed** (a lingering tab double-plays
   via two SFUs and sounds like echo).

---
*Source of truth: `videoconference/SETUP-JOURNAL.md` + `fresh-livekit-dfn/provision-plain.sh`.*
