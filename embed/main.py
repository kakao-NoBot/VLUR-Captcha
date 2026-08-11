"""문장 임베딩 전용 내부 서비스.

챗봇 RAG가 쓸 벡터를 만든다. 캡차 검증 경로(AI 서비스)와 프로세스를 분리한 이유는,
부가 기능인 챗봇의 모델 로딩·메모리 사용이 보안 핵심 기능을 흔들지 않게 하기 위해서다.

모델은 이미지 빌드 시점에 내려받아 구워두므로 기동 시 네트워크가 필요 없다.
"""

import os
from typing import Literal

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("EMBED_MODEL", "intfloat/multilingual-e5-small")

# e5 계열은 질의와 문서에 서로 다른 접두사를 붙여야 성능이 나온다. 같은 문장이라도
# "찾는 쪽"과 "찾히는 쪽"의 표현을 다르게 학습했기 때문에, 이 접두사를 빠뜨리면
# 검색 품질이 눈에 띄게 떨어진다.
_PREFIX = {"query": "query: ", "passage": "passage: "}

_model = SentenceTransformer(MODEL_NAME, device="cpu")
EMBED_DIM = _model.get_sentence_embedding_dimension()

app = FastAPI(title="VLUR Embedding Service", version=MODEL_NAME)


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)
    # 문서를 색인할 때는 passage, 사용자 질문을 벡터로 바꿀 때는 query.
    kind: Literal["query", "passage"] = "passage"


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "model": MODEL_NAME, "dim": EMBED_DIM}


@app.post("/embed")
def embed(body: EmbedRequest) -> dict[str, object]:
    prefixed = [_PREFIX[body.kind] + t for t in body.texts]
    # 정규화해서 내보내면 이후 유사도 계산이 내적만으로 끝난다(코사인과 동일).
    vectors = _model.encode(prefixed, normalize_embeddings=True, convert_to_numpy=True)
    return {
        "model": MODEL_NAME,
        "dim": EMBED_DIM,
        "vectors": np.asarray(vectors, dtype=np.float32).tolist(),
    }
