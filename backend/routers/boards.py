from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from auth.deps import get_current_admin
from db import get_conn

router = APIRouter(prefix="/boards", tags=["boards"])


class BoardRequest(BaseModel):
    title: str
    content: str


@router.get("")
def list_notices():
    """공지사항 목록 조회 (누구나 열람 가능)"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT board_id, title, content, created_at
                   FROM boards
                   WHERE board_type = 'notice'
                   ORDER BY board_id DESC"""
            )
            rows = cur.fetchall()
    return {"notices": rows}


@router.post("", status_code=201)
def create_notice(body: BoardRequest, admin: dict = Depends(get_current_admin)):
    """공지사항 작성 (관리자 전용)"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO boards (user_id, board_type, title, content)
                   VALUES (%s, 'notice', %s, %s)""",
                (admin.get("sub"), body.title, body.content),
            )
            new_id = cur.lastrowid
        conn.commit()
    return {"board_id": new_id, "message": "공지사항이 등록되었습니다."}


@router.put("/{board_id}")
def update_notice(board_id: int, body: BoardRequest, admin: dict = Depends(get_current_admin)):
    """공지사항 수정 (관리자 전용)"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE boards SET title = %s, content = %s
                   WHERE board_id = %s AND board_type = 'notice'""",
                (body.title, body.content, board_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="해당 공지사항을 찾을 수 없습니다.",
                )
        conn.commit()
    return {"message": "공지사항이 수정되었습니다."}


@router.delete("/{board_id}")
def delete_notice(board_id: int, admin: dict = Depends(get_current_admin)):
    """공지사항 삭제 (관리자 전용)"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM boards WHERE board_id = %s AND board_type = 'notice'",
                (board_id,),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="해당 공지사항을 찾을 수 없습니다.",
                )
        conn.commit()
    return {"message": "공지사항이 삭제되었습니다."}
