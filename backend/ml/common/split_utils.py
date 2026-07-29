"""
공유 문서(§4)가 지정한 person 단위 분할 유틸.
셋(부스팅/CNN/BiLSTM 담당)이 동일하게 import해서 쓰는 걸 전제로 함.

person_split_v{1,2}.json은 팀이 준 원본 그대로 쓴다(개인정보 보호를 위해 personId를
sha256 해시 토큰으로 감춘 스키마) — 이 파일을 우리 스키마로 바꿔서 저장하지 않는다.
대신 이 모듈이 로딩 시점에 원본 스키마를 직접 해석해서, 우리 personId를 같은 방식으로
해시해 어느 split에 속하는지 매칭한다.

원본 스키마 (팀이 준 그대로):
    {
      "group_token_policy": {"algorithm": "sha256", "namespace": "...", ...},
      "splits": {
        "train": {"person_tokens": [...], "person_aliases": [...], ...},
        "validation": {...},
        "test": {...}
      },
      ...
    }
"""
import hashlib
import json


def load_split_manifest(path: str) -> dict:
    """person_split_v1.json / person_split_v2.json 로드 (팀 원본 스키마 그대로).

    로딩과 동시에 "토큰 -> split명" 조회용 인덱스(`_token_to_split`)와 해시 namespace
    (`_namespace`)를 만들어서 매니페스트 dict에 덧붙인다 — assign_record_to_split()이
    매 레코드마다 splits를 다시 스캔하지 않고 O(1)로 찾게 하기 위한 파생 캐시일 뿐,
    원본 파일 내용 자체는 그대로 반환한다(파일을 고쳐서 저장하지 않음).
    """
    with open(path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    if "splits" in manifest and "group_token_policy" in manifest:
        # 팀 원본 스키마: personId가 sha256 토큰으로 감춰져 있음
        namespace = manifest["group_token_policy"]["namespace"]
        token_to_split = {}
        for split_name, split_data in manifest["splits"].items():
            for token in split_data.get("person_tokens", []):
                token_to_split[token] = split_name
        manifest["_namespace"] = namespace
        manifest["_token_to_split"] = token_to_split
    # else: 원본이 아직 없어서 만든 임시 단순 스키마({"train":[...], ...}) — 하위호환 유지.

    return manifest


def assign_record_to_split(record: dict, manifest: dict) -> str:
    """사람 레코드 1개를 personId 기준으로 train/validation/test에 배정.

    manifest가 팀 원본 스키마(해시 토큰)면 personId를 같은 알고리즘·namespace로 해시해서
    매칭한다. 아직 원본이 없어서 만든 임시 단순 스키마({"train":[...], ...})면 리스트에서
    직접 찾는다(하위호환). 7/23: build_person_split_v2.py가 만드는 중첩 스키마
    ({"splits": {"train": {"person_tokens": [...]}, ...}})도 추가 지원 — person 실험용
    정본으로 도입된 새 포맷.
    """
    person_id = record.get("personId")

    if "_token_to_split" in manifest:
        token = hashlib.sha256((manifest["_namespace"] + person_id).encode()).hexdigest()
        split = manifest["_token_to_split"].get(token)
        if split is None:
            raise KeyError(
                f"personId={person_id!r} 를 해시해도 매니페스트({manifest.get('split_version')}) "
                "토큰과 일치하는 게 없음. 새 참가자가 추가됐거나 namespace가 바뀐 것일 수 있음."
            )
        return split

    if "splits" in manifest and all("person_tokens" in v for v in manifest["splits"].values()):
        namespace = manifest.get("group_token_policy", {}).get("namespace", "")
        token = hashlib.sha256((namespace + person_id).encode()).hexdigest()
        for split_name, split_info in manifest["splits"].items():
            if token in split_info["person_tokens"]:
                return split_name
        raise KeyError(
            f"personId={person_id!r} 를 해시해도 매니페스트({manifest.get('split_version')}) "
            "splits.*.person_tokens 어디에도 없음 — 새 참가자가 추가됐거나 namespace가 바뀐 것일 수 있음."
        )

    # 하위호환: 임시 단순 스키마
    if person_id in manifest["train"]:
        return "train"
    if person_id in manifest["validation"]:
        return "validation"
    if person_id in manifest["test"]:
        return "test"
    raise KeyError(
        f"personId={person_id!r} 가 매니페스트({manifest.get('track')})에 없음. "
        "새 참가자가 추가됐다면 매니페스트를 갱신할 것."
    )


def assign_bot_split(capture_id: str, ratios=(0.60, 0.20, 0.20), seed: str = "disc_v1") -> str:
    """봇 레코드를 captureId 해시 기반으로 결정론적으로 train/validation/test에 배정.

    공유 문서 §4 규칙 2에 정의된 것과 동일한 구현 — seed를 "disc_v1" / "disc_v2" 등으로
    바꿔서 트랙별로 호출한다.
    """
    h = int(hashlib.sha256((seed + capture_id).encode()).hexdigest(), 16)
    r = (h % 10_000) / 10_000
    if r < ratios[0]:
        return "train"
    if r < ratios[0] + ratios[1]:
        return "validation"
    return "test"
