#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Verify an OpenVidu Pro Elastic stack (dev or prod) and print the values
# needed for the Firebase Cloud Function secrets.
#
# Read-only: creates/changes nothing. Safe to run repeatedly.
#
# Usage:
#   bash scripts/aws/verify-openvidu-stack.sh dev
#   bash scripts/aws/verify-openvidu-stack.sh prod
# ---------------------------------------------------------------------------
set -uo pipefail

ENVN="${1:-}"
case "$ENVN" in
  dev|prod) ;;
  *) echo "Usage: bash $0 <dev|prod>"; exit 1 ;;
esac

R="ap-south-1"
STACK="OpenViduElastic-${ENVN}"
BUCKET="openvidu-meet-recordings-${ENVN}"

line(){ printf '\n======== %s ========\n' "$1"; }

line "1. STACK STATUS"
STATUS=$(aws cloudformation describe-stacks --region "$R" --stack-name "$STACK" \
          --query 'Stacks[0].StackStatus' --output text 2>/dev/null) || { echo "stack $STACK not found"; exit 1; }
echo "$STACK : $STATUS"
if [[ "$STATUS" != "CREATE_COMPLETE" && "$STATUS" != "UPDATE_COMPLETE" ]]; then
  echo "-- not complete yet; recent events --"
  aws cloudformation describe-stack-events --region "$R" --stack-name "$STACK" --max-items 12 \
    --query 'StackEvents[].{T:Timestamp,Status:ResourceStatus,Type:ResourceType,Reason:ResourceStatusReason}' \
    --output table 2>/dev/null
  echo "(re-run when CREATE_COMPLETE)"
  exit 0
fi

line "2. MASTER NODE"
aws ec2 describe-instances --region "$R" \
  --filters "Name=tag:Name,Values=*${STACK}*" "Name=instance-state-name,Values=running,stopped" \
  --query 'Reservations[].Instances[].{Id:InstanceId,Type:InstanceType,State:State.Name,EIP:PublicIpAddress,DNS:PublicDnsName}' \
  --output table

line "3. MEDIA AUTO SCALING GROUP"
aws autoscaling describe-auto-scaling-groups --region "$R" \
  --query "AutoScalingGroups[?contains(AutoScalingGroupName,'${STACK}')].{Name:AutoScalingGroupName,Min:MinSize,Max:MaxSize,Desired:DesiredCapacity,Instances:length(Instances)}" \
  --output table

line "4. SECURITY GROUP INGRESS (expect 22/80/443/7881 tcp, 3478/7881/50000-60000 udp)"
for sg in $(aws ec2 describe-security-groups --region "$R" \
    --query "SecurityGroups[?contains(GroupName,'${STACK}')].GroupId" --output text); do
  echo "-- $sg --"
  aws ec2 describe-security-groups --region "$R" --group-ids "$sg" \
    --query 'SecurityGroups[0].IpPermissions[].{Proto:IpProtocol,From:FromPort,To:ToPort}' --output table
done

line "5. RECORDING BUCKET"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then echo "OK  $BUCKET reachable"; else echo "MISSING $BUCKET"; fi

line "6. CREDENTIALS (Secrets Manager) — for Firebase secrets"
SECRET_NAME=$(aws cloudformation describe-stacks --region "$R" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='ServicesAndCredentials'].OutputValue" --output text 2>/dev/null \
  | sed -n 's/.*name=\([^&]*\).*/\1/p')
[[ -z "$SECRET_NAME" ]] && SECRET_NAME="openvidu-elastic-${R}-${STACK}"
echo "secret: $SECRET_NAME"
echo "(values below — copy into the matching Firebase project's secrets)"
aws secretsmanager get-secret-value --region "$R" --secret-id "$SECRET_NAME" \
  --query 'SecretString' --output text 2>/dev/null | python3 -m json.tool 2>/dev/null \
  || echo "  (could not read secret; open it in the console: ServicesAndCredentials output)"

line "7. TLS TRUST CHECK"
DOMAIN=$(aws secretsmanager get-secret-value --region "$R" --secret-id "$SECRET_NAME" \
  --query 'SecretString' --output text 2>/dev/null \
  | python3 -c 'import sys,json,re
try:
  d=json.load(sys.stdin)
except Exception:
  sys.exit(0)
for v in d.values():
  if isinstance(v,str):
    m=re.search(r"https?://([^/\"]+sslip\.io)", v) or re.search(r"wss?://([^/\"]+)", v)
    if m: print(m.group(1)); break' 2>/dev/null)
if [[ -n "$DOMAIN" ]]; then
  echo "domain: $DOMAIN"
  echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
    | openssl x509 -noout -issuer -dates 2>/dev/null
  curl -s -o /dev/null -w 'validate endpoint: HTTP %{http_code} verify=%{ssl_verify_result} (want 401 / verify=0)\n' \
    "https://${DOMAIN}/rtc/validate" 2>/dev/null
else
  echo "could not auto-detect domain from secret; check ServicesAndCredentials manually"
fi

line "DONE"
cat <<EOF
Map these into Firebase project ($([[ "$ENVN" == prod ]] && echo fir-sample-aae4a || echo starlabs-test)):
  LIVEKIT_URL          -> wss URL from section 6
  LIVEKIT_API_KEY      -> from section 6
  LIVEKIT_API_SECRET   -> from section 6
  MASTER_INSTANCE_ID   -> Id from section 2
  MEDIA_ASG_NAME       -> Name from section 3
  AWS_ACCESS_KEY/SECRET-> starlabs-functions IAM user keys (unchanged)
EOF
