"""
Diffusion 사용 감사 로그 — 팀 리뷰 핵심 지적 반영 (1차 + 2차).

1차 리뷰: "지금 diffusion 세트로 여러 모델을 반복 선택했다면, 그 세트는 이미 사실상
validation이다. 최종 성능 판정을 위해서는 별도의 봉인된 diffusion family가 필요하다."

2차 리뷰(재감사): "사용 횟수는 보이지만 dataset hash·run ID·model hash·사용 목적이 없는
단순 카운터" — 그래서 이번에 dataset 파일의 sha256, 모델 체크포인트 경로(있으면 hash까지),
그리고 이 diffusion 세트의 신뢰 등급을 명시적으로 DEV_REDTEAM_ONLY로 고정해서 기록한다.
지금까지(train_common 등 여러 스크립트에서) 이미 여러 번 봐서 최종 판정에는 못 쓴다는 뜻이다.
"""
import hashlib
import json
import os
from datetime import datetime, timezone

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "diffusion_usage_log.jsonl")

# 지금 갖고 있는 diffusion 세트의 신뢰 등급 — 반복 사용으로 이미 오염됨(1차 리뷰).
# 최종 성능 판정에는 이 등급의 데이터를 쓰면 안 되고, 팀에게 새 sealed set을 받아야 한다.
CURRENT_DIFFUSION_TRUST_LEVEL = "DEV_REDTEAM_ONLY_NOT_FOR_FINAL_JUDGMENT"


def _sha256_of_file(path: str, chunk_size: int = 1 << 20) -> str:
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_of_path(path: str) -> str:
    """파일이면 그 파일 해시, 디렉토리면 안의 전체 파일을 정렬된 이름 순으로 이어붙여 해시한
    매니페스트 해시(RL 레드팀처럼 데이터가 폴더 하나에 여러 jsonl로 나뉘어 있을 때 필요 —
    7/23 실사용 중 발견된 버그: 폴더 경로를 그대로 open()하려다 PermissionError로 죽었음).
    """
    if not path or not os.path.exists(path):
        return None
    if os.path.isfile(path):
        return _sha256_of_file(path)
    h = hashlib.sha256()
    for name in sorted(os.listdir(path)):
        fpath = os.path.join(path, name)
        if os.path.isfile(fpath):
            h.update(name.encode("utf-8"))
            h.update((_sha256_of_file(fpath) or "").encode("utf-8"))
    return h.hexdigest()


def log_diffusion_use(
    script_name: str, purpose: str, result_summary: dict,
    dataset_path: str = None, model_checkpoint_path: str = None,
):
    """diffusion_file을 실제로 읽어서 평가에 쓸 때마다 호출. 누적 사용 횟수를 반환.

    dataset_path/model_checkpoint_path를 넘기면 각각의 sha256도 같이 기록해서, "정확히 어느
    데이터·어느 모델로 이 판정을 했는지" 재현·감사 가능하게 한다(2차 리뷰 반영).
    """
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "script": script_name,
        "purpose": purpose,  # 예: "hard-negative 적용 여부 판단", "GroupDRO 채택 여부 판단"
        "result_summary": result_summary,
        "diffusion_trust_level": CURRENT_DIFFUSION_TRUST_LEVEL,
        "dataset_sha256": _sha256_of_path(dataset_path) if dataset_path else None,
        "model_checkpoint_path": os.path.abspath(model_checkpoint_path) if model_checkpoint_path else None,
        "model_checkpoint_sha256": _sha256_of_file(model_checkpoint_path) if model_checkpoint_path else None,
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    count = sum(1 for _ in open(LOG_PATH, "r", encoding="utf-8")) if os.path.exists(LOG_PATH) else 1
    print(
        f"\n⚠ [diffusion 사용 기록 #{count}, 등급={CURRENT_DIFFUSION_TRUST_LEVEL}] "
        f"지금까지 diffusion 결과를 {count}번째 보고 있습니다. "
        "이 세트로 여러 번 비교·선택하면 이미 validation처럼 오염된 것과 같습니다 — "
        "최종 성능 판정은 팀에게 새로운 봉인된(sealed) diffusion family를 요청해서 "
        "그걸로 딱 한 번만 다시 확인하세요."
    )
    return count


def usage_count() -> int:
    if not os.path.exists(LOG_PATH):
        return 0
    return sum(1 for _ in open(LOG_PATH, "r", encoding="utf-8"))
