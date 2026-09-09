#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Verify an OCI OpenVidu Elastic stack and print the values the Firebase side
# needs — the twin of scripts/aws/verify-openvidu-stack.sh.
#
# Usage:
#   bash scripts/oci/verify-oci-stack.sh dev
#   bash scripts/oci/verify-oci-stack.sh prod
#
# Env:
#   OCI_TF_DIR    override the Terraform directory (default below)
#   SHOW_SECRETS=1  print LiveKit key/secret in full instead of masked
#
# Requires: oci CLI, terraform, python3.
# ---------------------------------------------------------------------------
set -euo pipefail

ENVN="${1:-}"
case "$ENVN" in dev|prod) ;; *) echo "Usage: bash $0 <dev|prod>"; exit 1;; esac

TF_DIR="${OCI_TF_DIR:-/Users/m1/Documents/Oracle Cloud/openvidu-oracle/pro/elastic}"
STACK="openvidu-elastic-${ENVN}"
if [[ "$ENVN" == "dev" ]]; then WS="default"; PROJECT="starlabs-test"; else WS="$ENVN"; PROJECT="fir-sample-aae4a"; fi

command -v oci >/dev/null || { echo "oci CLI not found in PATH"; exit 1; }
cd "$TF_DIR"
terraform workspace select "$WS" >/dev/null

C="$(awk -F'"' '/^compartment_ocid/{print $2}' "${ENVN}.tfvars")"
REGION="$(awk -F'"' '/^region/{print $2}' "${ENVN}.tfvars")"
[[ -n "$C" ]] || { echo "ERROR: compartment_ocid not found in ${ENVN}.tfvars"; exit 1; }

echo "=================================================================="
echo " stack=$STACK  workspace=$WS  region=$REGION  firebase=$PROJECT"
echo "=================================================================="

# ---------- Master node ----------
MASTER_ID="$(oci compute instance list --compartment-id "$C" --region "$REGION" \
  --query "data[?\"display-name\"=='${STACK}-master-node' && \"lifecycle-state\"!='TERMINATED'].id | [0]" --raw-output 2>/dev/null || true)"
if [[ -z "$MASTER_ID" || "$MASTER_ID" == "null" ]]; then
  echo "FAIL: no master node found for $STACK"; exit 1
fi
MASTER_STATE="$(oci compute instance get --instance-id "$MASTER_ID" --region "$REGION" --query 'data."lifecycle-state"' --raw-output)"
MASTER_IP="$(oci compute instance list-vnics --instance-id "$MASTER_ID" --region "$REGION" --query 'data[0]."public-ip"' --raw-output 2>/dev/null || echo "")"
echo "master        : $MASTER_STATE  ip=${MASTER_IP:-<none, instance stopped>}"
echo "  OCI_MASTER_INSTANCE_ID = $MASTER_ID"

# ---------- Media pool ----------
POOL_ID="$(oci compute-management instance-pool list --compartment-id "$C" --region "$REGION" \
  --query "data[?\"display-name\"=='${STACK}-media-pool' && \"lifecycle-state\"!='TERMINATED'].id | [0]" --raw-output 2>/dev/null || true)"
if [[ -n "$POOL_ID" && "$POOL_ID" != "null" ]]; then
  POOL_SIZE="$(oci compute-management instance-pool get --instance-pool-id "$POOL_ID" --region "$REGION" --query 'data.size' --raw-output)"
  echo "media pool    : size=$POOL_SIZE"
  echo "  OCI_MEDIA_POOL_ID      = $POOL_ID"
else
  echo "media pool    : NOT FOUND"
fi

# ---------- Bucket ----------
NS="$(oci os ns get --query 'data' --raw-output)"
BUCKET="$(oci os bucket list --compartment-id "$C" --region "$REGION" \
  --query "data[?starts_with(name,'${STACK}-appdata')].name | [0]" --raw-output 2>/dev/null || true)"
echo "namespace     : $NS"
echo "bucket        : ${BUCKET:-NOT FOUND}"

# ---------- Health probe ----------
# Unauthenticated twirp probe. 401 = server up and authenticating (healthy).
# 404 = up but bad_route (missing Content-Type) — also fine. 503 = Caddy has no
# upstream, i.e. the media node never finished bootstrapping.
if [[ -n "$MASTER_IP" ]]; then
  # curl already prints 000 via -w when it fails to connect; don't append a second one.
  CODE="$(curl -s -k -o /dev/null -w '%{http_code}' --max-time 10 \
    "https://${MASTER_IP}/twirp/livekit.RoomService/ListRooms" -X POST 2>/dev/null)" || true
  CODE="${CODE:-000}"
  case "$CODE" in
    401) echo "twirp probe   : 401 — HEALTHY (server up, auth enforced)";;
    404) echo "twirp probe   : 404 — up (bad_route; harmless)";;
    503) echo "twirp probe   : 503 — NO UPSTREAM. Media node did not bootstrap.";;
    000) echo "twirp probe   : unreachable (booting, or port 443 blocked)";;
    *)   echo "twirp probe   : HTTP $CODE";;
  esac
fi

# ---------- LiveKit credentials from this stack's Vault ----------
# NOTE: once prod exists, BOTH vaults hold secrets named LIVEKIT_URL etc. in the
# same compartment — always filter by this stack's vault id, never by name alone.
VAULT_ID="$(oci kms management vault list --compartment-id "$C" --region "$REGION" \
  --query "data[?\"display-name\"=='${STACK}-vault' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output 2>/dev/null || true)"
getsecret(){
  local id
  id="$(oci vault secret list --compartment-id "$C" --vault-id "$VAULT_ID" --region "$REGION" \
        --name "$1" --query 'data[0].id' --raw-output 2>/dev/null || true)"
  [[ -n "$id" && "$id" != "null" ]] || { echo ""; return; }
  oci secrets secret-bundle get --secret-id "$id" --region "$REGION" \
    --query 'data."secret-bundle-content".content' --raw-output 2>/dev/null | base64 --decode 2>/dev/null || echo ""
}
if [[ -n "$VAULT_ID" && "$VAULT_ID" != "null" ]]; then
  LK_URL="$(getsecret LIVEKIT_URL)"; LK_KEY="$(getsecret LIVEKIT_API_KEY)"; LK_SEC="$(getsecret LIVEKIT_API_SECRET)"
  echo
  if [[ -z "$LK_URL" ]]; then
    echo "NOTE: LIVEKIT_URL is not in the vault yet. The master writes the URL secrets at the"
    echo "      END of its install (after OpenVidu starts), so on a fresh stack this simply"
    echo "      means bootstrap is still running — give it 5-10 min and re-run. The API key"
    echo "      and secret appear earlier, which is why they may already be populated."
    echo
  fi
  echo "Firebase secrets for $PROJECT:"
  echo "  LIVEKIT_URL_OCI        = ${LK_URL:-<not written yet>}"
  if [[ "${SHOW_SECRETS:-}" == "1" ]]; then
    echo "  LIVEKIT_API_KEY_OCI    = ${LK_KEY:-<not found>}"
    echo "  LIVEKIT_API_SECRET_OCI = ${LK_SEC:-<not found>}"
  else
    echo "  LIVEKIT_API_KEY_OCI    = ${LK_KEY:0:4}****** (SHOW_SECRETS=1 to reveal)"
    echo "  LIVEKIT_API_SECRET_OCI = ******"
  fi
else
  echo; echo "WARN: vault ${STACK}-vault not found (still provisioning?)"
fi

# ---------- S3 key (recording) from this workspace's state ----------
# Tolerate an empty/partial state — `terraform state show` exits 1 when the resource
# (or the whole state) is absent, which would abort the script under `set -e`.
S3_ACCESS="$( { terraform state show -no-color oci_identity_customer_secret_key.openvidu_s3_key 2>/dev/null || true; } \
             | awk -F'"' '/^ *id /{print $2; exit}')"
echo "  OCI_S3_ACCESS_KEY      = ${S3_ACCESS:0:8}****** (full pair in this workspace's state)"
echo "  bucket / namespace     = ${BUCKET:-?} / $NS"
echo
echo ">> To write these into Firebase and deploy (Functions repo):"
echo "   PROVIDER=oci  bash scripts/set-secrets-and-deploy.sh $ENVN"
echo "   PROVIDER=both bash scripts/set-secrets-and-deploy.sh $ENVN   # first prod run"
