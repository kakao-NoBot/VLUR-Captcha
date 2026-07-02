import React, { useState } from 'react';
import vlurGif from '../assets/output-onlinegiftools.gif';
import PrivacyModal from './PrivacyModal';

export default function Footer() {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <>
      <footer>
        <div className="foot-dark">
          <div className="wrap">
            <div className="foot">
              <div>
                <a className="brand" href="#top">
                  <img src={vlurGif} alt="VLUR" style={{ height: 48, width: 'auto' }} />
                </a>
                <p>© VLUR ALL RIGHTS RESERVED</p>
              </div>
              <div className="foot-links">
                <a href="#">이용약관</a>
                <a href="#" onClick={e => { e.preventDefault(); setPrivacyOpen(true); }}>개인정보처리방침</a>
                <a href="#">GitHub</a>
                <a href="#">문의하기</a>
              </div>
    <footer>
      <div className="foot-dark">
        <div className="wrap">
          <div className="foot">
            <div>
              <a className="brand" href="#top">
                <img src={vlurGif} alt="VLUR" style={{ height: 48, width: 'auto' }} />
              </a>
              <p>© VLUR ALL RIGHTS RESERVED</p>
            </div>
            <div className="foot-links">
              <a href="#">이용약관</a>
              <a href="#">개인정보처리방침</a>
              <a
                href="https://github.com/kakao-NoBot"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a href="#">문의하기</a>
            </div>
          </div>
        </div>
      </footer>
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}
