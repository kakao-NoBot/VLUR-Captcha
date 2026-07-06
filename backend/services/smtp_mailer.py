"""Gmail SMTP 메일 발송 (앱 비밀번호 사용)

구글 계정 > 2단계 인증 활성화 > 앱 비밀번호 발급 후
.env의 SMTP_USER / SMTP_PASSWORD에 설정.
네이버 메일 등 다른 SMTP 서버도 SMTP_HOST/SMTP_PORT로 교체 가능.
"""
import os
import smtplib
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr


def send_mail(to_email: str, title: str, html_body: str) -> None:
    """동기 발송 함수. 실패 시 RuntimeError. (async 라우터에서는 run_in_threadpool로 호출)"""
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    if not (user and password):
        raise RuntimeError("SMTP 설정(SMTP_USER/SMTP_PASSWORD)이 없습니다.")

    msg = MIMEText(html_body, "html", "utf-8")
    msg["Subject"] = title
    msg["From"] = formataddr((str(Header("VLUR CAPTCHA", "utf-8")), user))
    msg["To"] = to_email

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(user, [to_email], msg.as_string())
    except (smtplib.SMTPException, OSError) as e:
        raise RuntimeError(f"SMTP 발송 실패: {e}") from e
