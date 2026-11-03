#!/bin/bash
# usage: run-mobile.sh <who> <email>
WHO=$1; EMAIL=$2
S=/private/tmp/claude-501/-Users-m1-Documents-Angular-Projects-Version-19-Starlabs-19/ea2adb35-d54b-461e-8254-321d610d51a0/scratchpad/manual
D=1278D214-3749-4E05-B8D3-C6793F0CE6C4
cd /Users/m1/Documents/Flutter_Projects/Version_3.44.3/Breakthroughs-Achievement || exit 1
/Users/m1/Documents/flutter_SDK/bin/flutter drive --driver=test_driver/integration_test.dart \
  --target=integration_test/features/zz_manual_screens_test.dart -d $D \
  --dart-define=QUEUE_E2E_TARGET=emulator --dart-define=WHO=$WHO --dart-define=E2E_EMAIL=$EMAIL 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" == *"CAP marker: "* ]]; then
    name="${line##*CAP marker: }"; name="${name//[^A-Za-z0-9_-]/}"
    sleep 1.2; xcrun simctl io $D screenshot --type=png "$S/shots/mobile/$name.png" >/dev/null 2>&1 && echo "[runner] captured $name"
  fi
done
