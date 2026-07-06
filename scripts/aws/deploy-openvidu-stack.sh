#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy an OpenVidu Pro Elastic stack (dev or prod) into the NEW AWS account
# (968234051275 / ap-south-1).
#
# Secrets are read from environment variables so they never appear as command
# arguments. You pass the environment as a positional parameter.
#
# Usage:
#   OPENVIDU_LICENSE='...' MEET_ADMIN_PW='...' MEET_API_KEY='...' \
#     bash scripts/aws/deploy-openvidu-stack.sh dev
#
#   OPENVIDU_LICENSE='...' MEET_ADMIN_PW='...' MEET_API_KEY='...' \
#     bash scripts/aws/deploy-openvidu-stack.sh prod
#
# Pre-created by setup (do NOT need to recreate):
#   - S3 buckets : openvidu-meet-recordings-dev / -prod
#   - Key pairs  : openvidu-elastic-dev / -prod  (pem in ~/.ssh)
#   - Template   : uploaded to s3://openvidu-meet-recordings-dev/cfn/openvidu-elastic.yaml
# ---------------------------------------------------------------------------
set -euo pipefail

ENVN="${1:-}"
case "$ENVN" in
  dev|prod) ;;
  *) echo "Usage: OPENVIDU_LICENSE=.. MEET_ADMIN_PW=.. MEET_API_KEY=.. bash $0 <dev|prod>"; exit 1 ;;
esac
: "${OPENVIDU_LICENSE:?ERROR: export OPENVIDU_LICENSE (OpenVidu Pro license key)}"
: "${MEET_ADMIN_PW:?ERROR: export MEET_ADMIN_PW (Meet admin password to set)}"
# MEET_API_KEY is OPTIONAL. OpenVidu does NOT auto-generate it; it only seeds the Meet
# REST API key if provided. The CF/LiveKit flow does not use it, so leaving it empty
# matches the current working baseline. Set it only if you call the Meet REST API directly.
MEET_API_KEY="${MEET_API_KEY:-}"

# ---- Fixed infrastructure values (shared VPC, ap-south-1) ----
R="ap-south-1"
STACK="OpenViduElastic-${ENVN}"
KEY="openvidu-elastic-${ENVN}"
BUCKET="openvidu-meet-recordings-${ENVN}"
TURL="https://openvidu-meet-recordings-dev.s3.${R}.amazonaws.com/cfn/openvidu-elastic.yaml"
VPC="vpc-0626664e388a41f99"
MASTER_SUBNET="subnet-063e8732cb17f7bd0"
MEDIA_SUBNETS="subnet-063e8732cb17f7bd0,subnet-04137487e72a76caa,subnet-0c206719ece0ccd38"

# ---- Sanity: refuse to clobber an existing stack ----
if aws cloudformation describe-stacks --region "$R" --stack-name "$STACK" >/dev/null 2>&1; then
  echo "ERROR: stack $STACK already exists. Delete it first or use the other environment."
  exit 1
fi

# ---- Build parameters JSON (commas in the subnet list are safe inside JSON) ----
PARAMS_FILE="$(mktemp)"
trap 'rm -f "$PARAMS_FILE"' EXIT
cat > "$PARAMS_FILE" <<JSON
[
  {"ParameterKey":"OperatingSystem","ParameterValue":"Ubuntu-24"},
  {"ParameterKey":"MasterNodeInstanceType","ParameterValue":"c6a.xlarge"},
  {"ParameterKey":"MediaNodeInstanceType","ParameterValue":"c6a.xlarge"},
  {"ParameterKey":"MinNumberOfMediaNodes","ParameterValue":"1"},
  {"ParameterKey":"InitialNumberOfMediaNodes","ParameterValue":"1"},
  {"ParameterKey":"MaxNumberOfMediaNodes","ParameterValue":"5"},
  {"ParameterKey":"ScaleTargetCPU","ParameterValue":"50"},
  {"ParameterKey":"RTCEngine","ParameterValue":"pion"},
  {"ParameterKey":"CertificateType","ParameterValue":"letsencrypt"},
  {"ParameterKey":"DomainName","ParameterValue":""},
  {"ParameterKey":"PublicElasticIP","ParameterValue":""},
  {"ParameterKey":"OwnPublicCertificate","ParameterValue":""},
  {"ParameterKey":"OwnPrivateCertificate","ParameterValue":""},
  {"ParameterKey":"KeyName","ParameterValue":"${KEY}"},
  {"ParameterKey":"S3AppDataBucketName","ParameterValue":"${BUCKET}"},
  {"ParameterKey":"OpenViduVPC","ParameterValue":"${VPC}"},
  {"ParameterKey":"OpenViduMasterNodeSubnet","ParameterValue":"${MASTER_SUBNET}"},
  {"ParameterKey":"OpenViduMediaNodeSubnets","ParameterValue":"${MEDIA_SUBNETS}"},
  {"ParameterKey":"OpenViduLicense","ParameterValue":"${OPENVIDU_LICENSE}"},
  {"ParameterKey":"InitialMeetAdminPassword","ParameterValue":"${MEET_ADMIN_PW}"},
  {"ParameterKey":"InitialMeetApiKey","ParameterValue":"${MEET_API_KEY}"}
]
JSON

echo ">> Creating stack ${STACK}"
echo "   region=${R}  key=${KEY}  bucket=${BUCKET}  cert=letsencrypt"
aws cloudformation create-stack \
  --region "$R" \
  --stack-name "$STACK" \
  --template-url "$TURL" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters "file://${PARAMS_FILE}"

echo
echo ">> Started. Watch progress with:"
echo "   bash scripts/aws/verify-openvidu-stack.sh ${ENVN}"
echo "   aws cloudformation describe-stacks --region ${R} --stack-name ${STACK} --query 'Stacks[0].StackStatus' --output text"
