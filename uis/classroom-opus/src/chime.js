/**
 * 교실 알림음 — 기본 OFF. 버튼을 눌러야 AudioContext를 만든다(브라우저 자동재생 정책).
 * 소리는 부가 연출이라, 막힌 환경에서는 조용히 꺼지고 화면 연출만 계속된다.
 */

const tone = (ctx, { freq, at, dur, type = 'sine', gain = 0.06, slideTo }) => {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.03);
};

export const createChime = () => {
  let audio = null;
  let enabled = false;
  let lastError = null;

  const ensure = () => {
    if (audio) return audio;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
    return audio;
  };

  const play = (voices) => {
    if (!enabled) return;
    try {
      const ctx = ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume();
      const base = ctx.currentTime + 0.01;
      for (const voice of voices) tone(ctx, { ...voice, at: base + voice.offset });
    } catch (error) {
      enabled = false;
      lastError = `알림음을 쓸 수 없어요: ${String(error)}`;
    }
  };

  return {
    get enabled() {
      return enabled;
    },
    get lastError() {
      return lastError;
    },
    toggle() {
      enabled = !enabled;
      if (enabled) play([{ freq: 880, offset: 0, dur: 0.09 }]);
      return enabled;
    },
    /** 손 든 학생 — 교실 부저 "딩동" 2회. 가장 잘 들려야 하는 신호. */
    hand() {
      play([
        { freq: 987, offset: 0, dur: 0.16, gain: 0.085 },
        { freq: 740, offset: 0.17, dur: 0.22, gain: 0.085 },
        { freq: 987, offset: 0.42, dur: 0.16, gain: 0.07 },
        { freq: 740, offset: 0.59, dur: 0.24, gain: 0.07 },
      ]);
    },
    /** 다 했어요 — 상승 3음. */
    done() {
      play([
        { freq: 659, offset: 0, dur: 0.1 },
        { freq: 784, offset: 0.09, dur: 0.1 },
        { freq: 1046, offset: 0.18, dur: 0.18 },
      ]);
    },
    /** 착석 — 짧은 나무 두드림. */
    sit() {
      play([{ freq: 260, offset: 0, dur: 0.07, type: 'triangle', gain: 0.04, slideTo: 180 }]);
    },
    /** 등교 — 가벼운 딩. */
    enter() {
      play([{ freq: 620, offset: 0, dur: 0.08, gain: 0.045 }]);
    },
  };
};
