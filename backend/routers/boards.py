from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from auth.deps import get_current_admin
from db import get_conn

router = APIRouter(prefix="/boards", tags=["boards"])


# 커뮤니티 게시판에서 다루는 글 유형 ('qna'/'inquiry'는 문의용이라 제외)
BOARD_TYPES = ("notice", "general", "faq", "research")


class BoardRequest(BaseModel):
    title: str
    content: str
    board_type: str = "notice"  # 'notice'(공지) | 'general'(일반) | 'faq' | 'research'


def _validate_board_type(board_type: str) -> str:
    if board_type not in BOARD_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="허용되지 않는 글 유형입니다.",
        )
    return board_type


@router.get("")
def list_notices():
    """게시글 목록 조회 (누구나 열람 가능)"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT board_id, board_type, title, content, created_at
                   FROM boards
                   WHERE board_type IN ({','.join(['%s'] * len(BOARD_TYPES))})
                   ORDER BY board_id DESC""",
                BOARD_TYPES,
            )
            rows = cur.fetchall()
    return {"notices": rows}


@router.post("", status_code=201)
def create_notice(body: BoardRequest, admin: dict = Depends(get_current_admin)):
    """게시글 작성 (관리자 전용)"""
    board_type = _validate_board_type(body.board_type)
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO boards (user_id, board_type, title, content)
                   VALUES (%s, %s, %s, %s)""",
                (admin.get("sub"), board_type, body.title, body.content),
            )
            new_id = cur.lastrowid
        conn.commit()
    return {"board_id": new_id, "message": "게시글이 등록되었습니다."}


@router.put("/{board_id}")
def update_notice(board_id: int, body: BoardRequest, admin: dict = Depends(get_current_admin)):
    """공지사항 수정 (관리자 전용)"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""UPDATE boards SET title = %s, content = %s, board_type = %s
                   WHERE board_id = %s AND board_type IN ({','.join(['%s'] * len(BOARD_TYPES))})""",
                (body.title, body.content, _validate_board_type(body.board_type), board_id, *BOARD_TYPES),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="해당 게시글을 찾을 수 없습니다.",
                )
        conn.commit()
    return {"message": "게시글이 수정되었습니다."}


@router.delete("/{board_id}")
def delete_notice(board_id: int, admin: dict = Depends(get_current_admin)):
    """공지사항 삭제 (관리자 전용)"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM boards WHERE board_id = %s AND board_type IN ({','.join(['%s'] * len(BOARD_TYPES))})",
                (board_id, *BOARD_TYPES),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="해당 게시글을 찾을 수 없습니다.",
                )
        conn.commit()
    return {"message": "게시글이 삭제되었습니다."}
