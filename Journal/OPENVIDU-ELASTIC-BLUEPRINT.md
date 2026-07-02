# OpenVidu Elastic — deployment blueprint (for the fresh AWS account)

Captured read-only from the current account (`442429445766`, us-east-1) on 2026-06-18.
Goal: reproduce this exactly on a **new AWS account**, then re-point the Firebase Cloud
Functions, then plan migration (last step).

## What the current deployment is
- **Official OpenVidu Pro "Elastic" CloudFormation stack** (autoscaling media nodes).
- Two stacks: `OpenViduElastic` (prod), `OpenViduElastic-test` (test). Both `CREATE_COMPLETE`.
- Recording = OpenVidu Meet → **S3 bucket `openvidu-meet-recordings`** (test: `-test`).
- Generated credentials live in **Secrets Manager** secret
  `openvidu-elastic-us-east-1-OpenViduElastic` (stack output `ServicesAndCredentials`).

## Stack parameters to reproduce (prod `OpenViduElastic`)
| Parameter | Value | Notes for new account |
|---|---|---|
| OperatingSystem | Ubuntu-24 | keep |
| MasterNodeInstanceType | **c6a.xlarge** | keep (fixed-perf ✓) |
| MediaNodeInstanceType | **c6a.xlarge** | keep (fixed-perf ✓) |
| MinNumberOfMediaNodes | 1 | keep |
| InitialNumberOfMediaNodes | 1 | keep |
| MaxNumberOfMediaNodes | 5 | keep |
| ScaleTargetCPU | 50 | keep |
| RTCEngine | pion | keep |
| CertificateType | letsencrypt | keep (needs a DomainName or use ELB default) |
| DomainName / PublicElasticIP | (empty) | set a domain for the new box, or leave for generated |
| KeyName | openvidu-elastic | create an EC2 key pair of this name on the new account |
| S3AppDataBucketName | openvidu-meet-recordings | bucket name must be globally unique → likely new name |
| OpenViduVPC | vpc-04adf1e850c593b75 | **old-account ID — replace** with new-account VPC |
| OpenViduMasterNodeSubnet / MediaNodeSubnets | subnet-0bf4d289134d78c39 | **old-account — replace** with new-account subnet |
| OpenViduLicense | **(secret)** | OpenVidu **Pro license key** — required for Elastic |
| InitialMeetAdminPassword | **(secret)** | set new |
| InitialMeetApiKey | **(secret)** | set new |

## Deploy sequence on the new account
1. **New account + IAM admin + `aws configure`** (new profile) + **EC2 vCPU quota increase**
   (master + up to 5×c6a.xlarge media ≈ up to ~24 vCPUs at full scale; request accordingly).
2. Prereqs on the new account: a VPC + public subnet, an EC2 key pair named `openvidu-elastic`,
   the **OpenVidu Pro license**, and a domain for TLS (or accept the generated endpoint).
3. **Deploy the OpenVidu Elastic CloudFormation template** (same OpenVidu version) with the
   parameters above, swapping VPC/subnet/bucket for new-account values.
4. Read the new credentials from the stack's Secrets Manager output (LiveKit URL + API key/secret,
   Meet admin/api key).
5. **Re-point the Firebase Cloud Function secrets** to the new deployment:
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `AWS_ACCESS_KEY`, `AWS_SECRET`,
   `MASTER_INSTANCE_ID`, `MEDIA_ASG_NAME`, and the recording S3 bucket name.
6. **Webhooks:** point OpenVidu's webhook at the existing `onEventOpenVidu` Cloud Function URL.
7. **Verify:** token issue → join `/joinlivekit/<room>` → recording start/stop to S3 → webhook
   events land in Firestore `openviduroom` / `AWS_System/instance_status`.
8. **Migration (last):** cut traffic from old → new (DNS / config switch), drain, decommission old.

## Notes
- The Angular DeepFilterNet3 work is **server-independent** — it works against the new LiveKit
  URL with no change once the Cloud Function secrets point at the new deployment.
- The new account starts at a low vCPU quota — file the increase first; it gates everything.
