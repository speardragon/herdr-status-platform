/**
 * 관제실 경보음 — 기본 OFF. 사용자가 버튼을 눌러야 AudioContext를 만든다(자동재생 정책 준수).
 * 오디오가 막힌 환경에서도 UI가 멈추지 않도록 모든 호출을 방어한다.
 */

const MASTER_GAIN = 0.08;

const beep = (ctx, { freq, at, dur, type = 'square', gain = MASTER_GAIN, slideTo }) => {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
};

export const createAlarm = () => {
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
      for (const voice of voices) beep(ctx, { ...voice, at: base + voice.offset });
    } catch (error) {
      // 오디오는 부가 연출이다 — 실패하면 조용히 끄고 화면 연출은 계속 간다.
      enabled = false;
      lastError = `경보음 사용 불가: ${String(error)}`;
    }
  };

  return {
    get enabled() {
      return enabled;
    },
    get lastError() {
      return lastError;
    },
    /** @returns {boolean} 토글 후 상태 */
    toggle() {
      enabled = !enabled;
      if (enabled) play([{ freq: 660, offset: 0, dur: 0.08, type: 'triangle' }]);
      return enabled;
    },
    /** 조난 — 2음 사이렌 3회. 가장 시끄러운 신호. */
    distress() {
      play([
        { freq: 880, offset: 0, dur: 0.16, gain: 0.11 },
        { freq: 620, offset: 0.18, dur: 0.16, gain: 0.11 },
        { freq: 880, offset: 0.36, dur: 0.16, gain: 0.11 },
        { freq: 620, offset: 0.54, dur: 0.2, gain: 0.11 },
      ]);
    },
    docked() {
      play([
        { freq: 784, offset: 0, dur: 0.1, type: 'sine', gain: 0.07 },
        { freq: 1175, offset: 0.09, dur: 0.16, type: 'sine', gain: 0.07 },
      ]);
    },
    ignition() {
      play([{ freq: 320, offset: 0, dur: 0.12, type: 'sawtooth', gain: 0.045, slideTo: 620 }]);
    },
    blip() {
      play([{ freq: 520, offset: 0, dur: 0.05, type: 'sine', gain: 0.05 }]);
    },
  };
};
