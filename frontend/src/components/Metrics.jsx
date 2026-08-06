import React from 'react';

const metricsData = [
  { value: '97.5', unit: '%', cap: '분류 정확도', desc: '자체 데이터셋 기반 전이학습 검증 정확도', bar: 97.5 },
  { value: '0.3', unit: '%', cap: '오탐률', desc: '실제 사람을 봇으로 오판정하는 비율', bar: 99.7 },
  { value: '25~40', unit: '건/초', cap: '검증 처리량', desc: '레코드 단위 초당 처리 건수(궤적 분석 포함)', bar: 70 },
  { value: '-', unit: '', cap: '동시 처리 세션', desc: '단일 인스턴스 기준 목표 동시 검증 수', bar: 0 },
];

export default function Metrics() {
  return (
    <section className="band" id="metrics">
      {/* 배경 장식용 블롭 */}
      <div className="band-blob band-blob--1" aria-hidden="true" />
      <div className="band-blob band-blob--2" aria-hidden="true" />

      <div className="wrap">
        <div className="sec-head" data-reveal>
          <span className="eyebrow">Performance</span>
          <h2>측정으로 증명하는 성능</h2>
          <p>앙상블 모델 실측 기준입니다. 동시 처리 세션은 부하테스트 이후 갱신 예정입니다.</p>
        </div>

        <div className="metrics metrics--grid4">
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