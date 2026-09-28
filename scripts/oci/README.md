# OCI setup — OpenVidu Pro Elastic (ap-mumbai-1)

Scripts to stand up and verify the **Development** and **Production** OpenVidu Elastic
stacks on OCI. Twin of `scripts/aws/`, but the stacks are **Terraform**, not
CloudFormation — read the workspace warning below before running anything by hand.

Terraform lives at `/Users/m1/Documents/Oracle Cloud/openvidu-oracle/pro/elastic`
(official `openvidu-oracle` @ tag 3.8.0). Override with `OCI_TF_DIR`.

## Naming convention
| | Development → Firebase `starlabs-test` | Production → Firebase `fir-sample-aae4a` |
|---|---|---|
| Terraform `stackName` | `openvidu-elastic-dev` | `openvidu-elastic-prod` |
| Terraform workspace | `default` | `prod` |
| tfvars | `dev.tfvars` | `prod.tfvars` |
| VCN DNS label | `openviduelasti` (legacy) | `ovelasticprod` |
| Vault | `openvidu-elastic-dev-vault` | `openvidu-elastic-prod-vault` |
| Recording bucket | `openvidu-elastic-dev-appdata-d16985` | `openvidu-elastic-prod-appdata-<random>` |
| Firebase secrets | `LIVEKIT_URL_OCI` etc. **(dev values)** | same names **(prod values)** |

Both stacks share one tenancy, one compartment (`starlabs-videoconference`), one region
and one OCI user — so compartment/region/namespace are **not** per-environment.

## ⚠️ One state per workspace
The dev cluster's state is in the **default** workspace. Running
`terraform apply -var-file=prod.tfvars` from there does **not** create a second cluster —
it plans a destroy-and-replace of dev. `deploy-oci-stack.sh` pins the workspace per
environment and refuses to run if the selected state holds a different stack. Use it.

## Usage

### 1. Deploy (secrets come from the environment, never from shell args)
```bash
TF_VAR_openviduLicense='<license>' TF_VAR_initialMeetAdminPassword='<password>' \
  bash scripts/oci/deploy-oci-stack.sh prod plan     # then: ... prod apply
```

### 2. Verify + capture the Firebase-secret values
```bash
bash scripts/oci/verify-oci-stack.sh prod
```
Reports master state and IP, pool size, bucket, namespace, and a twirp health probe
(**401 = healthy**, 404 = up but bad_route, 503 = media node never bootstrapped), then
prints the values the Firebase side needs.

### 3. Secrets + function deploy (Functions repo)
```bash
PROVIDER=both bash scripts/set-secrets-and-deploy.sh prod
```
Pulls the LiveKit trio from that stack's Vault, the S3 pair from that workspace's state,
the API-signing credentials from `~/.oci/config`, and the master/pool OCIDs from the API.
`PROVIDER` is `aws` (default, unchanged behaviour), `oci`, or `both`. Use `both` on the
first prod run — `CheckMasternodeStatus` gained the activeprovider gate and needs
redeploying alongside the OCI functions.

## Not covered by Terraform (manual, same as dev)
- ONS topic + Events rule + HTTPS subscription → `ociEventWebhook`, then
  `oci ons subscription resend-confirmation` (it stays PENDING until the function exists)
- `onEventOci` URL into `/opt/openvidu/config/cluster/media_node/livekit.yaml` on the
  master + `systemctl restart openvidu` — this is what makes recording fire hands-free
- Object Storage lifecycle rule on the appdata bucket (IA 30d → Archive 90d)
- Budget alert on the compartment
- `OCI_RECORDING_BUCKET` in `functions/.env.fir-sample-aae4a` after the first prod apply
- Firestore seed `openvidu server/mediaprovider → { activeprovider: "aws" }` **before**
  the CF deploy

## Capacity
Tenancy limit is **13 E5 OCPUs** in ap-mumbai-1. Dev running = 5 (master 2 + media 3);
prod master + one media = 10/13. A second prod media node lands exactly on 13, a third
fails to launch. Effective prod ceiling today: **2 concurrent calls**, until the service
limit is raised.

## Files
- `deploy-oci-stack.sh` — plan/apply a stack (`dev`|`prod`), workspace-safe
- `verify-oci-stack.sh` — verify a stack + print the Firebase values
