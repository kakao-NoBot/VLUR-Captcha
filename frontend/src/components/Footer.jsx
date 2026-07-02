import React, { useState } from 'react';
import vlurGif from '../assets/output-onlinegiftools.gif';
import ContactModal from './ContactModal';
import PrivacyModal from './PrivacyModal';
import TermsModal from './TermsModal';

const GITHUB_URL = 'https://github.com/kakao-NoBot/AI-Captcha';

export default function Footer() {
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

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
                <a href="#terms" onClick={(event) => { event.preventDefault(); setTermsOpen(true); }}>
                  이용약관
                </a>
                <a href="#privacy" onClick={(event) => { event.preventDefault(); setPrivacyOpen(true); }}>
                  개인정보처리방침
                </a>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
                <a href="#contact" onClick={(event) => { event.preventDefault(); setContactOpen(true); }}>
                  문의하기
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
