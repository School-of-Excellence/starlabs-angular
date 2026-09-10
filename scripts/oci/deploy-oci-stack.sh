#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy an OpenVidu Pro Elastic stack (dev or prod) on OCI — the Terraform twin
# of scripts/aws/deploy-openvidu-stack.sh.
#
# Why this script exists (read before bypassing it):
#   The OCI stacks are TERRAFORM, not CloudFormation. One directory holds ONE
#   state per workspace. The dev cluster lives in the "default" workspace. Running
#   `terraform apply -var-file=prod.tfvars` from that workspace does NOT create a
#   second cluster — it plans a DESTROY-AND-REPLACE of dev. This script pins the
#   workspace per environment and refuses to run if the selected state already
#   holds a different stack.
#
# Usage:
#   TF_VAR_openviduLicense='...' TF_VAR_initialMeetAdminPassword='...' \
#     bash scripts/oci/deploy-oci-stack.sh dev  plan
#   TF_VAR_openviduLicense='...' TF_VAR_initialMeetAdminPassword='...' \
#     bash scripts/oci/deploy-oci-stack.sh prod apply
#
# Env:
#   OCI_TF_DIR   override the Terraform directory (default below)
#
# Requires: terraform, the OCI CLI configured (~/.oci/config DEFAULT profile).
# ---------------------------------------------------------------------------
set -euo pipefail

ENVN="${1:-}"
MODE="${2:-plan}"   # plan | apply
case "$ENVN" in dev|prod) ;; *) echo "Usage: bash $0 <dev|prod> [plan|apply]"; exit 1;; esac
case "$MODE" in plan|apply) ;; *) echo "mode must be plan or apply"; exit 1;; esac

TF_DIR="${OCI_TF_DIR:-/Users/m1/Documents/Oracle Cloud/openvidu-oracle/pro/elastic}"
STACK="openvidu-elastic-${ENVN}"
TFVARS="${ENVN}.tfvars"
# dev was applied in the default workspace before workspaces were introduced;
# every later environment gets its own. Do not "tidy" dev into a named one —
# that would orphan the running cluster's state.
if [[ "$ENVN" == "dev" ]]; then WS="default"; else WS="$ENVN"; fi

command -v terraform >/dev/null || { echo "terraform not found in PATH"; exit 1; }
[[ -d "$TF_DIR" ]] || { echo "ERROR: Terraform dir not found: $TF_DIR (set OCI_TF_DIR)"; exit 1; }
[[ -f "$TF_DIR/$TFVARS" ]] || { echo "ERROR: $TFVARS not found in $TF_DIR"; exit 1; }
: "${TF_VAR_openviduLicense:?ERROR: export TF_VAR_openviduLicense (OpenVidu Pro license key)}"
: "${TF_VAR_initialMeetAdminPassword:?ERROR: export TF_VAR_initialMeetAdminPassword}"

cd "$TF_DIR"

echo "=================================================================="
echo " env=$ENVN  stack=$STACK  workspace=$WS  mode=$MODE"
echo " dir=$TF_DIR"
echo "=================================================================="

echo ">> terraform init"
terraform init -input=false >/dev/null

# ---- Workspace selection (create on first prod run) ----
if terraform workspace list | sed 's/[* ]//g' | grep -qx "$WS"; then
  terraform workspace select "$WS"
else
  [[ "$WS" == "default" ]] && { echo "ERROR: default workspace missing — wrong directory?"; exit 1; }
  echo ">> creating workspace $WS"
  terraform workspace new "$WS"
fi
echo ">> workspace now: $(terraform workspace show)"

# ---- Guard: never point one environment's config at another's state ----
# `terraform state list` EXITS 1 on a brand-new workspace ("No state file was found!").
# Under `set -euo pipefail` that killed the script silently on every fresh deploy — the
# guard below is only meaningful when a state exists, so tolerate the empty case.
RESOURCES="$( { terraform state list 2>/dev/null || true; } | wc -l | tr -d ' ')"
if [[ "$RESOURCES" -gt 0 ]]; then
  CUR_VCN="$( { terraform state show -no-color oci_core_vcn.openvidu_vcn 2>/dev/null || true; } \
             | awk -F'"' '/display_name/{print $2; exit}')"
  if [[ -n "$CUR_VCN" && "$CUR_VCN" != "${STACK}-vcn" ]]; then
    echo
    echo "REFUSING TO CONTINUE."
    echo "  Workspace '$WS' already holds stack '${CUR_VCN%-vcn}', but you asked for '$STACK'."
    echo "  Applying here would destroy the existing cluster. Check the workspace."
    exit 1
  fi
  echo ">> workspace holds $RESOURCES existing resources for $STACK (update path)"
else
  echo ">> workspace state is empty (fresh deploy)"
fi

# ---- Prod gate ----
if [[ "$ENVN" == "prod" && "${FORCE:-}" != "1" ]]; then
  read -r -p "About to target PRODUCTION infrastructure. Type PROD to continue: " ok
  [[ "$ok" == "PROD" ]] || { echo "aborted."; exit 1; }
fi

echo ">> terraform plan -var-file=$TFVARS"
terraform plan -var-file="$TFVARS" -out=".tfplan-${ENVN}"

if [[ "$MODE" == "plan" ]]; then
  echo
  echo ">> Plan only. Review the output above, then run:"
  echo "   bash $0 $ENVN apply"
  exit 0
fi

echo
read -r -p "Apply the plan shown above? Type yes to continue: " go
[[ "$go" == "yes" ]] || { echo "aborted."; exit 1; }

terraform apply ".tfplan-${ENVN}"
rm -f ".tfplan-${ENVN}"

cat <<NEXT

>> Applied. Next steps:
   1. bash scripts/oci/verify-oci-stack.sh $ENVN
   2. Set the Firebase secrets + deploy the functions (Functions repo):
        PROVIDER=oci  bash scripts/set-secrets-and-deploy.sh $ENVN
        PROVIDER=both bash scripts/set-secrets-and-deploy.sh $ENVN   # first prod run
   3. Manual, not covered by Terraform:
        - ONS topic + Events rule + HTTPS subscription -> ociEventWebhook,
          then: oci ons subscription resend-confirmation
        - onEventOci URL into /opt/openvidu/config/cluster/media_node/livekit.yaml
          on the master, then: systemctl restart openvidu
        - Object Storage lifecycle rule on the appdata bucket (IA 30d, Archive 90d)
        - Budget alert on the compartment
NEXT
