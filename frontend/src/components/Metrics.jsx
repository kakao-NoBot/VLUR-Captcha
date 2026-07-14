import React from 'react';

const metricsData = [
  { value: '-', unit: '', cap: '분류 정확도', desc: 'ImageNet 8-class 전이학습 검증 정확도', bar: 0 },
  { value: '-', unit: '', cap: '평균 검증 응답', desc: '정답 키 + 궤적 채점까지의 서버 응답', bar: 0 },
  { value: '-', unit: '', cap: '봇 차단율', desc: '합성·스크립트 궤적 탐지 기준', bar: 0 },
];

export default function Metrics() {
  return (
    <section className="band" id="metrics">
      <div className="wrap">
        <div className="sec-head" data-reveal>
          <span className="eyebrow">Performance</span>
          <h2>측정으로 증명하는 성능</h2>
          <p>학습·발표 단계의 목표 지표입니다. 실제 수치는 모델 학습 후 갱신됩니다.</p>
        </div>
        <div className="metrics">
          {metricsData.map((m, i) => (
            <div className="metric" key={i} data-reveal style={{ transitionDelay: `${i * 130}ms` }}>
              <div className="big">{m.value}<span className="u">{m.unit}</span></div>
              <div className="cap">{m.cap}</div>
              <div className="desc">{m.desc}</div>
              <div className="bar"><i style={{ width: `${m.bar}%` }}/></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
