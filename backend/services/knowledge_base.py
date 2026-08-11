"""챗봇 RAG의 지식 베이스 — 문서를 청크로 잘라 임베딩해 두고, 질문에 맞는 조각을 찾아준다.

두 종류의 원본을 다룬다.
  board : DB의 게시글(faq/research/notice). 관리자가 올리는 즉시 반영돼야 하는 동적 콘텐츠.
  doc   : backend/knowledge/*.md. 아키텍처·모델 구조처럼 코드와 함께 버전 관리하는 정적 문서.

임베딩은 "쓰기 시점"에 한 번만 계산해 knowledge_chunks에 저장한다. 파드가 뜰 때마다 전부
다시 계산하면 기동 시간이 문서 수에 비례해 늘어나 배포가 느려지기 때문이다.
"""

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

from db import get_conn

EMBED_SERVICE_URL = os.getenv("EMBED_SERVICE_URL", "http://embed:8100").rstrip("/")

# 질의용 — 사용자가 챗봇 답변을 기다리는 경로라 짧게 잡는다. 문장 하나는 0.4초면 끝난다.
EMBED_TIMEOUT_SECONDS = float(os.getenv("EMBED_TIMEOUT_SECONDS", "10.0"))
# 색인용 — 여러 건을 한 번에 보내는 배치라 훨씬 오래 걸린다. CPU 추론이고 파드가 처음
# 요청을 받을 때 워밍업 비용까지 붙어서, 질의와 같은 값을 쓰면 타임아웃이 난다.
EMBED_BATCH_TIMEOUT_SECONDS = float(os.getenv("EMBED_BATCH_TIMEOUT_SECONDS", "180.0"))

# 한 번에 보낼 청크 수. 측정해 보니 400자 32건이 약 6.7초라 배치를 키울수록 실패 시
# 되돌릴 범위도 커진다. 16건이면 3초 남짓이라 재시도 부담이 작다.
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "16"))

DOC_DIR = Path(__file__).resolve().parent.parent / "knowledge"

# 한 청크의 목표 길이. 너무 길면 검색이 뭉뚱그려지고, 너무 짧으면 맥락이 끊긴다.
# 한국어는 한 문장이 60~120자 정도라 400자면 3~6문장이 담긴다.
CHUNK_TARGET_CHARS = 400
CHUNK_MAX_CHARS = 700


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def embed_texts(
    texts: list[str], kind: str = "passage", timeout: float | None = None
) -> tuple[list[list[float]], str, int]:
    """embed 서비스에 위임한다. 실패는 호출자가 처리하도록 예외를 그대로 올린다."""
    res = httpx.post(
        f"{EMBED_SERVICE_URL}/embed",
        json={"texts": texts, "kind": kind},
        timeout=timeout if timeout is not None else EMBED_TIMEOUT_SECONDS,
    )
    res.raise_for_status()
    payload = res.json()
    return payload["vectors"], payload["model"], payload["dim"]


def split_markdown(text: str) -> list[str]:
    """마크다운을 제목 단위로 먼저 나누고, 긴 절은 문단 경계에서 다시 자른다.

    제목을 기준으로 삼는 이유는 한 절이 보통 하나의 주제를 담고 있어서, 그 경계를 지키면
    검색된 조각만 읽어도 말이 되기 때문이다.
    """
    sections: list[str] = []
    current: list[str] = []
    for line in text.splitlines():
        if line.startswith("#") and current:
            sections.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current).strip())

    chunks: list[str] = []
    for section in filter(None, sections):
        if len(section) <= CHUNK_MAX_CHARS:
            chunks.append(section)
            continue
        # 긴 절은 빈 줄(문단) 경계에서 목표 길이까지 모아 나눈다.
        buf = ""
        for para in re.split(r"\n\s*\n", section):
            if buf and len(buf) + len(para) > CHUNK_TARGET_CHARS:
                chunks.append(buf.strip())
                buf = para
            else:
                buf = f"{buf}\n\n{para}" if buf else para
        if buf.strip():
            chunks.append(buf.strip())
    return [c for c in chunks if c.strip()]


def _collect_board_chunks(cur) -> list[dict[str, Any]]:
    """게시글은 제목과 본문이 함께 있어야 의미가 통하므로 한 건을 한 청크로 둔다.
    본문이 아주 길면 잘라서 여러 청크가 된다."""
    cur.execute(
        """SELECT board_id, board_type, title, content FROM boards
           WHERE board_type IN ('faq', 'research', 'notice')"""
    )
    items: list[dict[str, Any]] = []
    for row in cur.fetchall():
        body = (row["content"] or "").strip()
        title = (row["title"] or "").strip()
        pieces = split_markdown(body) if len(body) > CHUNK_MAX_CHARS else [body]
        for index, piece in enumerate(pieces):
            items.append(
                {
                    "source_type": "board",
                    "source_ref": str(row["board_id"]),
                    "chunk_index": index,
                    "title": f"[{row['board_type']}] {title}",
                    # 검색 대상 문자열에 제목을 포함시켜야 "API Key 발급" 같은 질문이
                    # 본문에 그 표현이 없어도 걸린다.
                    "content": f"{title}\n{piece}".strip(),
                }
            )
    return items


def _collect_doc_chunks() -> list[dict[str, Any]]:
    if not DOC_DIR.is_dir():
        return []
    items: list[dict[str, Any]] = []
    for path in sorted(DOC_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        for index, piece in enumerate(split_markdown(text)):
            items.append(
                {
                    "source_type": "doc",
                    "source_ref": path.name,
                    "chunk_index": index,
                    "title": path.stem,
                    "content": piece,
                }
            )
    return items


def sync_knowledge(force: bool = False) -> dict[str, int]:
    """원본을 훑어 청크를 갱신한다. 내용이 그대로인 청크는 재임베딩하지 않는다.

    force=True면 해시가 같아도 다시 임베딩한다(임베딩 모델을 교체했을 때 사용).
    """
    conn = get_conn()
    added = updated = skipped = removed = 0
    with conn:
        with conn.cursor() as cur:
            items = _collect_board_chunks(cur) + _collect_doc_chunks()

            cur.execute(
                "SELECT source_type, source_ref, chunk_index, content_hash, embedding FROM knowledge_chunks"
            )
            existing = {
                (r["source_type"], r["source_ref"], r["chunk_index"]): r
                for r in cur.fetchall()
            }

            pending: list[dict[str, Any]] = []
            for item in items:
                key = (item["source_type"], item["source_ref"], item["chunk_index"])
                item["content_hash"] = _hash(item["content"])
                prev = existing.pop(key, None)
                unchanged = (
                    prev is not None
                    and prev["content_hash"] == item["content_hash"]
                    and prev["embedding"] is not None
                )
                if unchanged and not force:
                    skipped += 1
                    continue
                item["_is_new"] = prev is None
                pending.append(item)

            # 원본에서 사라진 청크는 비활성화한다(삭제하지 않는 이유는 이력 추적).
            for key in existing:
                cur.execute(
                    """UPDATE knowledge_chunks SET is_active = FALSE
                       WHERE source_type=%s AND source_ref=%s AND chunk_index=%s""",
                    key,
                )
                removed += cur.rowcount

            # embed 서비스 호출은 배치로 — 요청당 왕복 비용을 줄이되, 한 번에 너무 많이
            # 보내면 타임아웃 위험이 커지므로 EMBED_BATCH_SIZE로 나눈다.
            for start in range(0, len(pending), EMBED_BATCH_SIZE):
                batch = pending[start : start + EMBED_BATCH_SIZE]
                vectors, model, dim = embed_texts(
                    [b["content"] for b in batch],
                    kind="passage",
                    timeout=EMBED_BATCH_TIMEOUT_SECONDS,
                )
                for item, vector in zip(batch, vectors):
                    cur.execute(
                        """INSERT INTO knowledge_chunks
                               (source_type, source_ref, chunk_index, title, content,
                                embed_model, embed_dim, embedding, content_hash, is_active)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                           ON DUPLICATE KEY UPDATE
                               title=VALUES(title), content=VALUES(content),
                               embed_model=VALUES(embed_model), embed_dim=VALUES(embed_dim),
                               embedding=VALUES(embedding), content_hash=VALUES(content_hash),
                               is_active=TRUE""",
                        (
                            item["source_type"], item["source_ref"], item["chunk_index"],
                            item["title"], item["content"], model, dim,
                            json.dumps(vector), item["content_hash"],
                        ),
                    )
                    if item["_is_new"]:
                        added += 1
                    else:
                        updated += 1
        conn.commit()
    return {"added": added, "updated": updated, "skipped": skipped, "deactivated": removed}


def search(question: str, top_k: int = 3, min_score: float = 0.75) -> list[dict[str, Any]]:
    """질문과 가장 가까운 청크를 고른다.

    임베딩이 정규화되어 있어 코사인 유사도가 내적과 같으므로 곱셈-합만으로 끝난다.
    청크가 수천 건을 넘어가면 이 전수 계산이 부담이 되고, 그때가 벡터 DB를 도입할 시점이다.

    min_score는 "관련 없는 문서를 억지로 끼워 넣지 않기" 위한 하한이다. 무관한 문서가
    프롬프트에 들어가면 모델이 그걸 근거로 엉뚱한 답을 지어낸다.
    """
    vectors, _, _ = embed_texts([question], kind="query")
    query_vector = vectors[0]

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT title, content, embedding FROM knowledge_chunks
                   WHERE is_active = TRUE AND embedding IS NOT NULL"""
            )
            rows = cur.fetchall()

    scored: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        vector = row["embedding"]
        if isinstance(vector, str):
            vector = json.loads(vector)
        if not vector or len(vector) != len(query_vector):
            continue
        score = sum(a * b for a, b in zip(query_vector, vector))
        if score >= min_score:
            scored.append((score, {"title": row["title"], "content": row["content"], "score": score}))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in scored[:top_k]]
