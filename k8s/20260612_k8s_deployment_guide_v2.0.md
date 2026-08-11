# 카카오클라우드 Kubernetes 배포 가이드 (배포 세션 전달용)

> 문서: 20260612_k8s_deployment_guide_v2.0
> 대상 서비스: 아스키 아트 기반 AI CAPTCHA
> 배포 대상: 카카오클라우드 Kubernetes Engine
> 운영 방식: **상시 가동(24/7, 주말 포함 중지 없음)**
> 특이사항: **GPU(ML 추론)는 클러스터 밖 GPU-01에서 실행하며 백엔드가 IP로 호출**

---

## 0. 인수인계 개요

이 문서는 **실제 배포를 담당하는 세션**에 전달하는 실행 문서입니다. 각 단계는 **[작업] 내가 무엇을 하는가 → [확인] 제대로 됐는지 어떻게 검증하는가** 형식으로 정리되어 있습니다. 명령어의 `<...>` 부분은 실제 값으로 교체합니다.

### 구성 요약

| 요소 | 위치 | 역할 |
|---|---|---|
| 워커 노드 3대 (4vCPU/8GB) | Kubernetes 클러스터 | 프론트·백엔드·DB 파드 실행 |
| GPU-01 (210.109.15.254) | **클러스터 밖** | ML 추론 서버(도커로 운영), 백엔드가 IP로 호출 |
| Block Storage 50GB | 클러스터(CSI 연동) | DB 데이터 영속 저장 |
| Container Registry 30GB | 카카오클라우드 | 프론트·백엔드 이미지 보관 |
| Load Balancer 1개 (L7) | Ingress 앞단 | 외부 트래픽 진입 |

### 런타임 흐름

```
사용자 → L7 LB → Ingress ─┬─ /   → Frontend
                          └─ /api → Backend ─┬─ MySQL(StatefulSet, 블록스토리지 PVC)
                                             └─ GPU-01 (클러스터 밖, IP 호출)
```

### 배포 순서(전체)

```
0 접속·클러스터 확인
1 Container Registry 자격증명(imagePullSecret)      ← 상세
2 CSI Provisioner(블록 스토리지) 확인/설정          ← 상세
3 Ingress Controller 확인/설치                      ← 상세
4 네임스페이스·Secret·ConfigMap
5 DB(StatefulSet+PVC)
6 백엔드(Deployment+Service)
7 프론트엔드(Deployment+Service)
8 Ingress 규칙 + LB 외부 노출
9 GPU-01 연동 검증
10 상시 운영·백업·모니터링
11 (선택) 롤링 업데이트/롤백
```

---

## Phase 0. 접속 & 클러스터 확인

**[작업]**
1. `kubectl` 설치
2. 카카오클라우드 콘솔에서 클러스터 kubeconfig를 내려받아 접속 설정
   ```bash
   export KUBECONFIG=./kubeconfig.yaml   # 또는 ~/.kube/config 에 병합
   ```

**[확인]**
```bash
kubectl get nodes
# 워커 노드 3대가 STATUS=Ready 로 보이면 정상
kubectl cluster-info
# 컨트롤 플레인 주소가 응답하면 접속 성공
```
> 안 보이면: kubeconfig 경로/토큰 만료/네트워크(사내망·VPN)부터 점검.

---

## Phase 1. Container Registry 자격증명 (imagePullSecret) — 상세

**개념**: 우리 이미지는 **프라이빗 레지스트리**에 있어서, 클러스터가 이미지를 내려받으려면 "로그인 정보(자격증명)"가 필요합니다. 이걸 K8s에 **Secret** 형태로 심어두는 것이 `imagePullSecret`입니다. 없으면 파드가 `ImagePullBackOff`로 뜨지 않습니다.

**[작업]**
1. 카카오클라우드 콘솔에서 Container Registry **접근 자격증명**(사용자명 + 액세스 키/토큰)과 **레지스트리 주소**를 확인/발급합니다.
2. 로컬에서 로그인 테스트(선택):
   ```bash
   docker login <registry-endpoint> -u <username> -p <access-key>
   ```
3. 클러스터에 pull 자격증명 Secret 생성:
   ```bash
   kubectl -n captcha create secret docker-registry regcred \
     --docker-server=<registry-endpoint> \
     --docker-username=<username> \
     --docker-password=<access-key>
   ```
4. 파드가 이 Secret으로 pull하도록 연결 — 두 방법 중 하나:
   - (개별) 각 Deployment의 `spec.template.spec.imagePullSecrets`에 `- name: regcred` 추가
   - (일괄) 네임스페이스 기본 서비스어카운트에 붙이기:
     ```bash
     kubectl -n captcha patch serviceaccount default \
       -p '{"imagePullSecrets":[{"name":"regcred"}]}'
     ```

**[확인]**
```bash
kubectl -n captcha get secret regcred          # 존재 확인
# 테스트: 프라이빗 이미지로 임시 파드 실행
kubectl -n captcha run pulltest --image=<registry>/captcha-backend:v1 --restart=Never
kubectl -n captcha get pod pulltest            # Running 또는 Completed 면 pull 성공
kubectl -n captcha describe pod pulltest | grep -i pull   # ImagePullBackOff 없으면 OK
kubectl -n captcha delete pod pulltest         # 정리
```
> `ImagePullBackOff`가 뜨면: 레지스트리 주소·자격증명 오타, Secret 미연결, 이미지 태그 확인.

---

## Phase 2. CSI Provisioner (블록 스토리지) — 상세

**개념**: CSI(Container Storage Interface) Provisioner는 **PVC를 만들면 카카오클라우드 블록 스토리지를 자동으로 생성·연결**해 주는 연결 장치입니다. 이게 설정돼 있어야 DB가 데이터를 영속 저장할 수 있습니다. **설정은 클러스터당 한 번만** 합니다(부트캠프가 이미 해뒀을 수 있음).

**[작업 — 먼저 "이미 돼 있는지" 확인]**
```bash
kubectl get sc
# 블록 스토리지용 StorageClass가 목록에 있으면 이미 설정된 것
kubectl get pods -n kube-system | grep -i csi
# csi provisioner/controller 파드가 Running 이면 정상
```
- 이미 StorageClass가 있으면 → **이 Phase는 건너뜀**. StorageClass 이름만 메모(뒤에서 PVC에 사용).
- 없으면 → 아래 설정 진행(권한 필요).

**[작업 — 없을 때만: 설정]**
1. 카카오클라우드 Kubernetes Engine의 **CSI Provisioner 설정 가이드**에 따라 클러스터에 CSI Provisioner를 배포합니다(클러스터당 1회).
2. 배포 후 기본 StorageClass가 생성됩니다.

**[확인 — 실제로 볼륨이 만들어지는지 테스트]**
```bash
# 테스트 PVC 생성
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: csi-test, namespace: captcha }
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: <위에서_확인한_StorageClass>
  resources: { requests: { storage: 10Gi } }
EOF

kubectl -n captcha get pvc csi-test
# STATUS 가 Bound 로 바뀌면 블록 스토리지 자동 생성·연결 성공
# (Pending 이 오래 지속되면 CSI 미설정 또는 StorageClass 이름 오류)

kubectl -n captcha delete pvc csi-test   # 테스트 정리
```
> 참고: 일부 StorageClass는 `WaitForFirstConsumer` 모드라, **파드가 실제로 붙기 전까지 Pending**일 수 있습니다. 이 경우 DB 파드를 띄우면 Bound됩니다.

---

## Phase 3. Ingress Controller — 상세

**개념**: **Ingress(규칙)** 는 "어떤 경로를 어디로 보낼지" 적은 표일 뿐이고, 실제로 그 규칙을 읽어 트래픽을 처리하는 **엔진이 Ingress Controller**(보통 nginx-ingress)입니다. 컨트롤러가 없으면 Ingress를 만들어도 아무 동작도 하지 않습니다. 도커의 Nginx 역할을 이 컨트롤러가 대신합니다.

**[작업 — 먼저 "이미 있는지" 확인]**
```bash
kubectl get pods -A | grep -i ingress
# ingress-nginx-controller 같은 파드가 Running 이면 이미 설치됨
kubectl get svc -A | grep -i ingress
# 컨트롤러의 Service(type=LoadBalancer)에 EXTERNAL-IP 가 붙어 있으면
# 그게 우리 L7 LB의 외부 진입점
```
- 있으면 → EXTERNAL-IP를 메모하고 **이 Phase 건너뜀**.
- 없으면 → 아래 설치(권한 필요).

**[작업 — 없을 때만: 설치]**
1. nginx-ingress Controller를 Helm 또는 매니페스트로 설치합니다.
2. 설치 시 컨트롤러의 Service가 `type: LoadBalancer`로 뜨면서 **카카오클라우드 L7 LB가 연결**됩니다.

**[확인]**
```bash
kubectl get svc -n ingress-nginx
# EXTERNAL-IP 가 <pending> → 잠시 후 실제 IP/호스트로 바뀌면 LB 연결 성공
kubectl get pods -n ingress-nginx
# controller 파드 Running
```
> EXTERNAL-IP가 계속 `<pending>`이면: LB 쿼터/권한, 또는 클라우드 연동 애노테이션 문제 → 운영진 확인.

---

## Phase 4. 네임스페이스·Secret·ConfigMap

**[작업]**
```bash
kubectl create namespace captcha

# DB 비밀번호 (민감정보)
kubectl -n captcha create secret generic db-secret \
  --from-literal=MYSQL_ROOT_PASSWORD='<강한_비밀번호>'

# 앱 설정 (비민감) — GPU-01 주소가 여기서 주입됨
kubectl -n captcha create configmap app-config \
  --from-literal=DB_NAME=captcha \
  --from-literal=MODEL_SERVER_URL=http://210.109.15.254:<GPU포트>
```

**[확인]**
```bash
kubectl -n captcha get secret,configmap
kubectl -n captcha get configmap app-config -o yaml   # 값이 맞는지
```

---

## Phase 5. 데이터베이스 (StatefulSet + PVC)

**개념**: DB는 상태가 있으므로 **StatefulSet**으로 배포하고, **PVC**로 블록 스토리지를 물립니다(Phase 2 확인 완료 전제).

**[작업]**
1. PVC 생성 → CSI가 블록 스토리지 자동 생성
2. MySQL StatefulSet 배포(위 Secret/ConfigMap 참조), replica **1**
3. Service(ClusterIP, 이름 `mysql`) 생성 → 백엔드가 이 이름으로 접속
4. SQL 초기화 파일은 ConfigMap으로 `/docker-entrypoint-initdb.d`에 마운트 → **데이터 없을 때 최초 1회만** 실행

**[확인]**
```bash
kubectl -n captcha get pvc            # Bound
kubectl -n captcha get pods           # mysql-0 Running
kubectl -n captcha exec -it mysql-0 -- mysql -uroot -p -e "SHOW DATABASES;"
# captcha DB와 테이블이 보이면 초기화 성공
```

---

## Phase 6. 백엔드 (Deployment + Service)

**[작업]**
1. Deployment 배포 (replica **2**), 이미지 = `<registry>/captcha-backend:v1`
2. 환경변수: DB는 Service 이름 `mysql`, GPU는 ConfigMap의 `MODEL_SERVER_URL`
3. Service(ClusterIP) 생성

**[확인]**
```bash
kubectl -n captcha get deploy,pods -l app=backend    # 2/2 Running
kubectl -n captcha logs deploy/backend | tail        # DB/GPU 연결 에러 없는지
kubectl -n captcha exec -it deploy/backend -- curl -s localhost:8000/health
```

---

## Phase 7. 프론트엔드 (Deployment + Service)

**[작업]**
1. Deployment 배포 (replica **2**), 이미지 = `<registry>/captcha-frontend:v1`
2. Service(ClusterIP) 생성
3. 프론트의 API 호출은 **상대경로 `/api`** 로 (도메인 하드코딩 금지 → Ingress가 백엔드로 넘김)

**[확인]**
```bash
kubectl -n captcha get deploy,pods -l app=frontend    # 2/2 Running
```

---

## Phase 8. Ingress 규칙 + 외부 노출

**[작업]**
1. Ingress 생성: `/` → frontend Service, `/api` → backend Service
2. Phase 3에서 확인한 LB 외부 주소로 접속 테스트

**[확인]**
```bash
kubectl -n captcha get ingress          # ADDRESS(외부 IP/호스트) 확인
curl http://<외부주소>/                 # 프론트 응답(HTML)
curl http://<외부주소>/api/health       # 백엔드 응답(JSON)
```

---

## Phase 9. GPU-01 연동 검증

**[작업]**
1. GPU-01에서 ML 추론 서버가 도커로 실행 중인지 확인(`docker ps`)
2. 보안 그룹: **워커 노드 대역 → GPU-01 포트** 인바운드 허용 확인

**[확인]**
```bash
# 백엔드 파드에서 GPU-01 직접 호출
kubectl -n captcha exec -it deploy/backend -- \
  curl -s http://210.109.15.254:<GPU포트>/health
# 정상 응답이면 클러스터 → GPU 연동 성공
```
> GPU-01은 K8s가 관리하지 않으므로 배포·재시작은 GPU-01에서 도커로 직접 수행합니다.

---

## Phase 10. 상시 운영(24/7)·백업·모니터링

> 이 서비스는 **주말 포함 상시 가동**입니다. 정기 중지가 없으므로 "재기동 절차"보다 **지속 운영 안정성과 백업**이 핵심입니다.

**[상시 운영 점검 항목]**
```bash
kubectl -n captcha get pods           # 모든 파드 Running, RESTARTS 급증 없는지
kubectl top nodes                     # 노드 CPU/메모리 여유(파드 재배치·부족 여부)
kubectl top pods -n captcha           # 파드별 자원 사용
kubectl get events -n captcha --sort-by=.lastTimestamp | tail
```

**[백업 — 상시 운영이어도 필수]**
- 인프라 레벨: 블록 스토리지 **스냅샷 스케줄** 설정(정기 자동 백업)
- 데이터 레벨: `mysqldump`를 크론잡으로 주기 실행 → Object Storage에 보관
  ```bash
  # 예: CronJob 또는 별도 스크립트에서
  kubectl -n captcha exec mysql-0 -- \
    sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" captcha' > backup_$(date +%F).sql
  ```

**[안정성 권장]**
- 파드 `readinessProbe`/`livenessProbe` 설정 → 죽은 파드 자동 교체
- 무상태(프론트·백엔드)는 replica 2 유지로 파드 하나 죽어도 무중단
- 상시 가동이라 **로그 누적 주의** → 로그 로테이션/보존 정책 확인

---

## Phase 11. (선택) 업데이트 & 롤백

**[작업]**
1. 새 이미지 빌드 → 태그 `:v2` → Registry push
2. 롤링 업데이트(무중단): `kubectl -n captcha set image deploy/backend backend=<registry>/captcha-backend:v2`
3. 문제 시 롤백: `kubectl -n captcha rollout undo deploy/backend`

**[확인]**
```bash
kubectl -n captcha rollout status deploy/backend    # 성공적으로 롤아웃됐는지
```

---

## 부록 A. 진행 전 운영진 확인 항목

| 항목 | 확인 질문 |
|---|---|
| CSI Provisioner | 블록 스토리지 StorageClass가 이미 설정돼 있는가? 없다면 설정 권한이 있는가? |
| Ingress Controller | 설치돼 있는가? 없다면 설치 권한이 있는가? LB가 자동 연결되는가? |
| Registry 자격증명 | pull/push용 자격증명(액세스 키) 발급 방법과 레지스트리 주소 |
| kubeconfig | 클러스터 접속 kubeconfig 발급 경로 |

## 부록 B. 도커 컴포즈 → 쿠버네티스 대응표

| Docker Compose | Kubernetes |
|---|---|
| `docker compose up` | Deployment / StatefulSet |
| 컨테이너 이름 통신 | Service (ClusterIP) |
| `volumes:` 바인드 | PVC (+ CSI 자동 프로비저닝) |
| Nginx 프록시/포트 개방 | Ingress + Ingress Controller |
| `.env` | ConfigMap / Secret |

## 부록 C. 자주 나는 오류 빠른 진단

| 증상 | 원인 후보 | 확인 |
|---|---|---|
| `ImagePullBackOff` | 레지스트리 자격증명 문제 | Phase 1 재확인, `describe pod` |
| PVC가 `Pending` | CSI 미설정 / StorageClass 이름 오류 / WaitForFirstConsumer | `kubectl get sc`, 파드 생성 여부 |
| Ingress ADDRESS 없음 | Ingress Controller 미설치 / LB 미연결 | Phase 3 확인 |
| 백엔드→GPU 실패 | 보안그룹 미허용 / GPU 컨테이너 다운 | Phase 9 curl, GPU-01 `docker ps` |
| 파드 `CrashLoopBackOff` | 앱 설정·환경변수 오류 | `kubectl logs`로 원인 |

---

### 한 줄 요약

접속 확인 → **레지스트리 자격증명 → CSI(블록스토리지) → Ingress Controller** 3대 기반부터 검증한 뒤, DB(StatefulSet+PVC) → 백엔드 → 프론트 → Ingress 순으로 올리고, GPU는 클러스터 밖 IP로 연동한다. **주말 포함 상시 가동**이므로 재기동 절차 대신 **백업·모니터링·프로브**로 안정성을 확보한다.
