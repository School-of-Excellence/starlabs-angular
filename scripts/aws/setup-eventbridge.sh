#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Wire the per-environment AWS state pipeline so /monitorliveassignment reflects
# the real master/media state:
#
#   EC2/ASG state change
#     -> EventBridge rule (scoped to THIS env's master instance-id + media ASG)
#        -> SNS topic openvidu-state-events-<env>
#           -> HTTPS subscription to <project>'s awsEventWebhook
#              -> Firestore AWS_System/instance_status
#
# Isolation: each rule matches ONLY this env's exact instance-id / ASG name, and
# each env has its OWN SNS topic -> its OWN Firebase project. Dev and prod cannot
# cross-write each other's status.
#
# Idempotent + read-derived. Run dev now; run prod AFTER the prod stack exists.
#
# Usage:
#   bash scripts/aws/setup-eventbridge.sh dev
#   bash scripts/aws/setup-eventbridge.sh prod
# ---------------------------------------------------------------------------
set -euo pipefail

ENVN="${1:-}"; case "$ENVN" in dev|prod) ;; *) echo "Usage: bash $0 <dev|prod>"; exit 1;; esac

R="ap-south-1"
ACCT="968234051275"
STACK="OpenViduElastic-${ENVN}"
ASG="openvidu-elastic-media-asg-${R}-${STACK}"
TOPIC_NAME="openvidu-state-events-${ENVN}"
if [[ "$ENVN" == "prod" ]]; then PROJECT="fir-sample-aae4a"; else PROJECT="starlabs-test"; fi
CF_URL="https://us-central1-${PROJECT}.cloudfunctions.net/awsEventWebhook"
MASTER_RULE="openvidu-master-state-changes-${ENVN}"
MEDIA_RULE="openvidu-media-asg-events-${ENVN}"

echo "== env=$ENVN  project=$PROJECT  stack=$STACK =="

# ---- derive the master instance-id for this stack ----
MASTER="$(aws ec2 describe-instances --region "$R" \
  --filters "Name=tag:Name,Values=*${STACK}*" "Name=tag:Name,Values=*Master*" \
            "Name=instance-state-name,Values=running,stopped,pending,stopping" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
[[ -n "$MASTER" && "$MASTER" != "None" ]] || { echo "ERROR: no master node found for $STACK (deploy the stack first)"; exit 1; }
echo "   master instance = $MASTER"
echo "   media ASG       = $ASG"

# ---- 1. SNS topic (create-topic is idempotent: returns existing ARN) ----
TOPIC_ARN="$(aws sns create-topic --region "$R" --name "$TOPIC_NAME" --query TopicArn --output text)"
echo "   SNS topic       = $TOPIC_ARN"

# ---- 2. topic policy: owner full access + allow EventBridge to publish ----
read -r -d '' POLICY <<JSON || true
{"Version":"2012-10-17","Statement":[
 {"Sid":"Owner","Effect":"Allow","Principal":{"AWS":"arn:aws:iam::${ACCT}:root"},"Action":["SNS:GetTopicAttributes","SNS:SetTopicAttributes","SNS:AddPermission","SNS:RemovePermission","SNS:DeleteTopic","SNS:Subscribe","SNS:ListSubscriptionsByTopic","SNS:Publish"],"Resource":"${TOPIC_ARN}"},
 {"Sid":"AllowEventBridgePublish","Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sns:Publish","Resource":"${TOPIC_ARN}"}
]}
JSON
aws sns set-topic-attributes --region "$R" --topic-arn "$TOPIC_ARN" --attribute-name Policy --attribute-value "$POLICY"
echo "   topic policy    = set (EventBridge publish allowed)"

# ---- 3. subscribe the CF (only if not already subscribed) ----
EXISTING_SUB="$(aws sns list-subscriptions-by-topic --region "$R" --topic-arn "$TOPIC_ARN" \
  --query "Subscriptions[?Endpoint=='${CF_URL}'].SubscriptionArn" --output text)"
if [[ -z "$EXISTING_SUB" ]]; then
  aws sns subscribe --region "$R" --topic-arn "$TOPIC_ARN" --protocol https --notification-endpoint "$CF_URL" >/dev/null
  echo "   subscription    = created (auto-confirmed by awsEventWebhook)"
else
  echo "   subscription    = already present"
fi

# ---- 4. EventBridge rules scoped to THIS env's node, targeting THIS env's topic ----
aws events put-rule --region "$R" --name "$MASTER_RULE" \
  --event-pattern "{\"source\":[\"aws.ec2\"],\"detail-type\":[\"EC2 Instance State-change Notification\"],\"detail\":{\"instance-id\":[\"${MASTER}\"]}}" >/dev/null
aws events put-targets --region "$R" --rule "$MASTER_RULE" --targets "Id=sns,Arn=${TOPIC_ARN}" >/dev/null
echo "   rule            = $MASTER_RULE -> $TOPIC_NAME (instance $MASTER)"

aws events put-rule --region "$R" --name "$MEDIA_RULE" \
  --event-pattern "{\"source\":[\"aws.autoscaling\"],\"detail\":{\"AutoScalingGroupName\":[\"${ASG}\"]}}" >/dev/null
aws events put-targets --region "$R" --rule "$MEDIA_RULE" --targets "Id=sns,Arn=${TOPIC_ARN}" >/dev/null
echo "   rule            = $MEDIA_RULE -> $TOPIC_NAME (asg $ASG)"

echo "== done. Toggle the master (stop/start) once to push a state event and update the monitor. =="
