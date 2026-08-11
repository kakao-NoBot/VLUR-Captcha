"""지식 베이스 동기화 스크립트 — 게시글과 knowledge/*.md 를 청크로 만들어 임베딩한다.

클러스터에서 실행:
    kubectl -n captcha exec deploy/backend -- python scripts/sync_knowledge.py

임베딩 모델을 교체했다면 기존 벡터는 새 모델의 벡터와 비교할 수 없으므로 전부 다시 만든다:
    kubectl -n captcha exec deploy/backend -- python scripts/sync_knowledge.py --force

내용이 바뀌지 않은 청크는 건너뛰므로 반복 실행해도 부담이 없다.
"""

import argparse
import sys
from pathlib import Path

# backend/ 를 import 경로에 넣어 서비스 모듈을 그대로 쓴다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.knowledge_base import search, sync_knowledge  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="내용이 같아도 전부 재임베딩")
    parser.add_argument("--test", metavar="질문", help="동기화 후 이 질문으로 검색을 시험한다")
    args = parser.parse_args()

    stats = sync_knowledge(force=args.force)
    print(
        "[sync] 신규 {added} · 갱신 {updated} · 변경없음 {skipped} · 비활성 {deactivated}".format(**stats)
    )

    if args.test:
        hits = search(args.test)
        print(f"\n[검색] {args.test!r} → {len(hits)}건")
        for hit in hits:
            print(f"  {hit['score']:.3f}  {hit['title']}")
            print(f"         {hit['content'][:80].replace(chr(10), ' ')}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
