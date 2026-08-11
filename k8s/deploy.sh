#!/usr/bin/env bash
# versions.env의 SHA를 클러스터에 반영한다.
#
#   ./deploy.sh --check   지금 떠 있는 것 / versions.env / CI가 빌드한 최신 을 비교만
#   ./deploy.sh           backend·ai·frontend·ticketing-demo 이미지 교체 (무중단)
#   ./deploy.sh --with-db 위 + MySQL까지 교체 (DB 재시작 = 짧은 다운타임)
#
# 이미지 태그는 커밋 SHA로 고정돼 있으므로, CI가 새 이미지를 올려도 이 스크립트를
# 돌리기 전까지는 클러스터가 바뀌지 않는다 — 언제 배포할지를 사람이 정하는 구조다.
set -euo pipefail

NS=captcha
REG=kc-sfacspace05.kr-central-2.kcr.dev/team2-repo
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# kubectl이 kic-iam-auth를 찾을 수 있게 (셸 rc를 안 거치는 실행 환경 대비)
export PATH="$HOME/bin:$PATH"

source "$HERE/versions.env"

EMBED_SHA="${EMBED_SHA:-}"          # 아직 안 만든 환경에서도 스크립트가 돌게

for v in BACKEND_SHA FRONTEND_SHA DB_SHA DEMO_SHA; do
  [[ "${!v}" =~ ^[0-9a-f]{40}$ ]] || { echo "오류: $v 가 40자리 커밋 SHA가 아닙니다 → ${!v}"; exit 1; }
done
# embed는 선택 — 값이 있으면 형식만 검사한다.
if [[ -n "$EMBED_SHA" && ! "$EMBED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "오류: EMBED_SHA 가 40자리 커밋 SHA가 아닙니다 → $EMBED_SHA"; exit 1
fi

# 레지스트리에 그 태그가 실제로 있는지 CI 이력으로 확인한다. 없는 태그로 배포하면
# 파드가 ImagePullBackOff에 걸려 롤아웃이 멈추고, 이미 뜬 옛 파드만 서비스를 이어간다.
preflight() {
  local runs
  runs=$(curl -sL --max-time 15 \
    "https://api.github.com/repos/kakao-NoBot/AI-Captcha/actions/runs?per_page=60" 2>/dev/null) || return 0
  BACKEND_SHA="$BACKEND_SHA" FRONTEND_SHA="$FRONTEND_SHA" EMBED_SHA="$EMBED_SHA" \
  python3 -c "
import json, os, sys
try:
    runs = json.loads(sys.stdin.read())['workflow_runs']
except Exception:
    sys.exit(0)   # 조회 실패는 배포를 막지 않는다
built = {}
for r in runs:
    if r.get('conclusion') == 'success':
        built.setdefault(r['name'], set()).add(r['head_sha'])
checks = [
    ('Backend + AI Image Build', os.environ['BACKEND_SHA'], 'BACKEND_SHA'),
    ('Frontend Image Build',     os.environ['FRONTEND_SHA'], 'FRONTEND_SHA'),
]
if os.environ.get('EMBED_SHA'):
    checks.append(('Embed Image Build', os.environ['EMBED_SHA'], 'EMBED_SHA'))
bad = []
for workflow, sha, var in checks:
    shas = built.get(workflow)
    if shas is not None and sha not in shas:
        latest = next((r['head_sha'] for r in runs
                       if r['name'] == workflow and r.get('conclusion') == 'success'), '?')
        bad.append(f'  {var}={sha[:12]} — {workflow} 가 이 커밋에서 돌지 않았습니다. 최신 성공: {latest[:12]}')
if bad:
    print('배포 중단: 레지스트리에 없는 이미지 태그입니다.', file=sys.stderr)
    print('\n'.join(bad), file=sys.stderr)
    print('\\n워크플로우마다 트리거 경로가 달라 한 커밋에서 일부만 빌드됩니다.', file=sys.stderr)
    print('./deploy.sh --check 로 실제 빌드된 SHA를 확인해 versions.env를 고치세요.', file=sys.stderr)
    sys.exit(1)
" <<<"$runs"
}

current() {  # 지금 클러스터에 떠 있는 이미지 태그
  kubectl -n "$NS" get "$1" "$2" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null \
    | sed 's/.*:sha-//'
}

if [[ "${1:-}" == "--check" ]]; then
  printf '%-16s %-14s %-14s\n' 워크로드 "현재 배포됨" "versions.env"
  printf '%-16s %-14s %-14s\n' ---------------- -------------- --------------
  for d in backend ai; do
    printf '%-16s %-14s %-14s\n' "$d" "$(current deploy "$d" | cut -c1-12)" "$(echo "$BACKEND_SHA" | cut -c1-12)"
  done
  printf '%-16s %-14s %-14s\n' frontend "$(current deploy frontend | cut -c1-12)" "$(echo "$FRONTEND_SHA" | cut -c1-12)"
  printf '%-16s %-14s %-14s\n' ticketing-demo "$(current deploy ticketing-demo | cut -c1-12)" "$(echo "$DEMO_SHA" | cut -c1-12)"
  printf '%-16s %-14s %-14s\n' mysql "$(current statefulset mysql | cut -c1-12)" "$(echo "$DB_SHA" | cut -c1-12)"
  printf '%-16s %-14s %-14s\n' embed "$(current deploy embed | cut -c1-12)" "$(echo "${EMBED_SHA:0:12}")"

  echo
  echo "CI가 빌드한 최신 커밋:"
  curl -sL "https://api.github.com/repos/kakao-NoBot/AI-Captcha/actions/runs?per_page=30" \
    | python3 -c "
import json,sys
seen={}
for r in json.load(sys.stdin).get('workflow_runs',[]):
    if r.get('conclusion')=='success' and r['name'] not in seen:
        seen[r['name']]=r['head_sha']
for k,v in seen.items(): print(f'  {k:28} {v[:12]}')" 2>/dev/null || echo "  (조회 실패)"
  curl -sL "https://api.github.com/repos/kakao-NoBot/ticketing-demo-site/actions/runs?per_page=10" \
    | python3 -c "
import json,sys
for r in json.load(sys.stdin).get('workflow_runs',[]):
    if r.get('conclusion')=='success':
        print(f\"  {'Ticketing Demo':28} {r['head_sha'][:12]}\"); break" 2>/dev/null || true
  exit 0
fi

echo "배포 전 이미지 존재 확인..."
preflight || exit 1

echo "네임스페이스: $NS"
echo "BACKEND_SHA  = ${BACKEND_SHA:0:12}  (backend, ai)"
echo "FRONTEND_SHA = ${FRONTEND_SHA:0:12}"
echo "DEMO_SHA     = ${DEMO_SHA:0:12}"
[[ -n "$EMBED_SHA" ]] && echo "EMBED_SHA    = ${EMBED_SHA:0:12}"
[[ "${1:-}" == "--with-db" ]] && echo "DB_SHA       = ${DB_SHA:0:12}  ← MySQL 재시작됨"
echo

kubectl -n "$NS" set image deploy/backend        "backend=$REG/vlur-backend:sha-$BACKEND_SHA"
kubectl -n "$NS" set image deploy/ai             "ai=$REG/vlur-ai:sha-$BACKEND_SHA"
kubectl -n "$NS" set image deploy/frontend       "frontend=$REG/vlur-frontend:sha-$FRONTEND_SHA"
kubectl -n "$NS" set image deploy/ticketing-demo "ticketing-demo=$REG/vlur-ticketing-demo:sha-$DEMO_SHA"
if [[ -n "$EMBED_SHA" ]] && kubectl -n "$NS" get deploy embed >/dev/null 2>&1; then
  kubectl -n "$NS" set image deploy/embed "embed=$REG/vlur-embed:sha-$EMBED_SHA"
fi

if [[ "${1:-}" == "--with-db" ]]; then
  read -r -p "MySQL을 재시작합니다. DB가 잠시 끊깁니다. 계속할까요? (yes 입력) " ans
  [[ "$ans" == "yes" ]] || { echo "DB는 건너뜁니다."; }
  [[ "$ans" == "yes" ]] && kubectl -n "$NS" set image statefulset/mysql "mysql=$REG/vlur-database:sha-$DB_SHA"
fi

echo
for d in backend ai frontend ticketing-demo; do
  kubectl -n "$NS" rollout status "deploy/$d" --timeout=180s
done
if [[ -n "$EMBED_SHA" ]] && kubectl -n "$NS" get deploy embed >/dev/null 2>&1; then
  kubectl -n "$NS" rollout status deploy/embed --timeout=180s
fi

echo
echo "완료. 문제가 있으면 되돌리세요:"
echo "  kubectl -n $NS rollout undo deploy/backend"
