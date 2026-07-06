# AWS setup — OpenVidu Pro Elastic (new account, ap-south-1)

Scripts to stand up the **Development** and **Production** OpenVidu Elastic stacks in the
new AWS account (`968234051275`, region `ap-south-1`) and verify them.

> Local-only ops scripts — **not** part of the app build. Do not commit (per project rule
> "no code commits for the migration").

## Naming convention
| | Development → Firebase `starlabs-test` | Production → Firebase `fir-sample-aae4a` |
|---|---|---|
| Stack | `OpenViduElastic-dev` | `OpenViduElastic-prod` |
| Key pair | `openvidu-elastic-dev` (`~/.ssh/openvidu-elastic-dev.pem`) | `openvidu-elastic-prod` (`~/.ssh/openvidu-elastic-prod.pem`) |
| Recording bucket | `openvidu-meet-recordings-dev` | `openvidu-meet-recordings-prod` |
| Secrets Manager | `…-OpenViduElastic-dev` | `…-OpenViduElastic-prod` |

## Already created by setup (do not redo)
- ✅ S3 buckets `openvidu-meet-recordings-dev` / `-prod` (private)
- ✅ Key pairs `openvidu-elastic-dev` / `-prod` (pem saved to `~/.ssh`, chmod 400)
- ✅ IAM `starlabs-functions-policy` extended with both bucket ARNs
- ✅ Template `openvidu-elastic.yaml` uploaded to
  `s3://openvidu-meet-recordings-dev/cfn/openvidu-elastic.yaml`

Shared infra reused by both stacks: VPC `vpc-0626664e388a41f99`,
master subnet `subnet-063e8732cb17f7bd0`, media subnets
`subnet-063e8732cb17f7bd0,subnet-04137487e72a76caa,subnet-0c206719ece0ccd38`.

## Usage

### 1. Deploy (you supply the 3 secrets as env vars; they never hit a chat or shell arg)
```bash
OPENVIDU_LICENSE='<OpenVidu Pro license key>' \
MEET_ADMIN_PW='<choose Meet admin password>' \
MEET_API_KEY='<choose Meet API key>' \
bash scripts/aws/deploy-openvidu-stack.sh dev      # then later: ... prod
```
Stacks deploy with `CertificateType=letsencrypt` (real cert via the auto sslip.io domain —
fixes the self-signed issue from the old dev box). ~8–12 min to `CREATE_COMPLETE`.

### 2. Verify + capture Firebase-secret values
```bash
bash scripts/aws/verify-openvidu-stack.sh dev
```
Checks stack status, master node, media ASG, security-group ports, recording bucket,
TLS trust, and prints `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` /
`MASTER_INSTANCE_ID` / `MEDIA_ASG_NAME` for the matching Firebase project.

## Rollout order
1. Deploy `dev`, verify, then point `starlabs-test` secrets at it (Stage 1).
2. Test `join-openvidu-call` (development branch) **and** `join-livekit-call`
   (videoConference branch) against it.
3. Deploy `prod`, verify, point `fir-sample-aae4a` secrets at it.
4. Decommission the old unsuffixed `OpenViduElastic` stack (releases EIP `3.7.142.232`).

## Files
- `deploy-openvidu-stack.sh` — create a stack (`dev`|`prod`)
- `verify-openvidu-stack.sh` — verify a stack + print secret values
- `openvidu-elastic.yaml` — the OpenVidu 3.7 Pro Elastic CloudFormation template (reference copy)
