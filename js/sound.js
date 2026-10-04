/* 音響エンジン (Web Audio API による合成音)
 * - 音の豪華さは本人の結果（一致率・連続正解・クリア）だけで決まる。運で決まる音はない
 * - 一致率と連続正解数に応じた段階的サウンド演出
 * - DynamicsCompressorNode による音割れ防止とマスター音量管理
 * - FEVER専用の合成BGMループ
 */
(function () {
  'use strict';

  let AC = null;
  let masterGain = null;
  let compressor = null;
  let reverbNode = null;
  let isMuted = false;

  // マスター音量設定 (教室での一斉利用を考慮した控えめ設定: 0.28)
  const MASTER_VOLUME = 0.28;

  // AudioContext 初期化
  function initAudio() {
    if (AC) {
      if (AC.state === 'suspended') AC.resume();
      return AC;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    AC = new AudioCtx();

    // 1. ダイナミクスコンプレッサー (音割れ防止)
    compressor = AC.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, AC.currentTime);
    compressor.knee.setValueAtTime(12, AC.currentTime);
    compressor.ratio.setValueAtTime(8, AC.currentTime);
    compressor.attack.setValueAtTime(0.003, AC.currentTime);
    compressor.release.setValueAtTime(0.15, AC.currentTime);
    compressor.connect(AC.destination);

    // 2. マスターゲイン
    masterGain = AC.createGain();
    masterGain.gain.setValueAtTime(isMuted ? 0 : MASTER_VOLUME, AC.currentTime);
    masterGain.connect(compressor);

    // 3. 合成リバーブ (短く自然な広がり 0.6秒)
    try {
      const rate = AC.sampleRate;
      const len = Math.floor(rate * 0.6);
      const impulse = AC.createBuffer(2, len, rate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);
      for (let i = 0; i < len; i++) {
        const decay = Math.exp(-i / (rate * 0.12));
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
      }
      reverbNode = AC.createConvolver();
      reverbNode.buffer = impulse;

      const reverbGain = AC.createGain();
      reverbGain.gain.setValueAtTime(0.2, AC.currentTime);
      reverbNode.connect(reverbGain);
      reverbGain.connect(masterGain);
    } catch (e) {
      reverbNode = null;
    }

    return AC;
  }

  // 音声出力接続ヘルパー
  function connectOut(node, withReverb = true) {
    if (!masterGain) return;
    node.connect(masterGain);
    if (withReverb && reverbNode) {
      node.connect(reverbNode);
    }
  }

  // 単音生成 (基本トーン)
  function playTone(freq, delay, dur, type = 'sine', vol = 0.15) {
    const a = initAudio();
    if (!a || isMuted) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    connectOut(g, true);

    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // 木琴・マリンバ風の丸い打楽器音 (数字カウント用)
  function playMarimba(freq, delay, vol = 0.18) {
    const a = initAudio();
    if (!a || isMuted) return;
    const t0 = a.currentTime + delay;

    // 基本波 (sine) + 4倍音の微小アタック
    const osc1 = a.createOscillator();
    const osc2 = a.createOscillator();
    const g = a.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, t0);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 3.8, t0);

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);

    osc1.connect(g);
    osc2.connect(g);
    connectOut(g, false);

    osc1.start(t0);
    osc2.start(t0);
    osc1.stop(t0 + 0.1);
    osc2.stop(t0 + 0.1);
  }

  // 低音のドン (バスドラム / 衝撃音)
  function playBoom(delay = 0, vol = 0.28, pitch = 140) {
    const a = initAudio();
    if (!a || isMuted) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, t0);
    osc.frequency.exponentialRampToValueAtTime(32, t0 + 0.22);

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);

    osc.connect(g);
    connectOut(g, true);

    osc.start(t0);
    osc.stop(t0 + 0.4);
  }

  // 短いシュッという空気感・ノイズ
  function playShimmerNoise(delay = 0, dur = 0.22, vol = 0.08) {
    const a = initAudio();
    if (!a || isMuted) return;
    const t0 = a.currentTime + delay;
    const bufferSize = Math.floor(a.sampleRate * dur);
    const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = a.createBufferSource();
    noise.buffer = buffer;

    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, t0);
    filter.Q.setValueAtTime(2.0, t0);

    const g = a.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    noise.connect(filter);
    filter.connect(g);
    connectOut(g, true);

    noise.start(t0);
    noise.stop(t0 + dur + 0.02);
  }

  // シューッと高くなっていく上昇ノイズスイープ (盛り上げ用 0.35秒)
  function playSweepUp(delay = 0, dur = 0.38) {
    const a = initAudio();
    if (!a || isMuted) return;
    const t0 = a.currentTime + delay;
    const bufferSize = Math.floor(a.sampleRate * dur);
    const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = a.createBufferSource();
    noise.buffer = buffer;

    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, t0);
    filter.frequency.exponentialRampToValueAtTime(5500, t0 + dur);
    filter.Q.setValueAtTime(4.0, t0);

    const g = a.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    noise.connect(filter);
    filter.connect(g);
    connectOut(g, false);

    noise.start(t0);
    noise.stop(t0 + dur + 0.05);
  }

  // キラリとしたベル・チャイム (決めの「キン!」)
  function playBellChime(freq = 2093, delay = 0, vol = 0.22) {
    const a = initAudio();
    if (!a || isMuted) return;
    const t0 = a.currentTime + delay;
    const osc1 = a.createOscillator();
    const osc2 = a.createOscillator();
    const g = a.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, t0);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2.76, t0); // 非整数倍音で金属ベル感

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);

    osc1.connect(g);
    osc2.connect(g);
    connectOut(g, true);

    osc1.start(t0);
    osc2.start(t0);
    osc1.stop(t0 + 0.7);
    osc2.stop(t0 + 0.7);
  }

  /* ==============================================================
   * FEVER 合成BGM ループエンジン
   * - 外部音声ファイルを使わず Web Audio API で完全リアルタイム生成
   * - キック + ハイハット + ベース + シンセコード
   * - 倍率に応じてテンポ・ピッチが上昇
   * ============================================================== */
  let feverBgmTimer = null;
  let feverBgmStep = 0;
  let feverMultLevel = 2;
  let feverActive = false;

  function stepFeverBgm() {
    if (!feverActive || isMuted) return;
    const a = initAudio();
    if (!a) return;

    // 基本BPM (126 から倍率に応じて 144 まで少しずつ速く)
    const bpm = 126 + Math.min(18, (feverMultLevel - 2) * 6);
    const stepInterval = (60 / bpm) / 4; // 16分音符ごとの秒数

    const beatInBar = feverBgmStep % 16;
    const now = a.currentTime;

    // 1. 4つ打ちキック (0, 4, 8, 12)
    if (beatInBar % 4 === 0) {
      playBoom(0, 0.16, 120 + (feverMultLevel - 2) * 10);
    }

    // 2. ハイハット (裏拍 2, 6, 10, 14 軽快にオープン、他はクローズ)
    if (beatInBar % 2 === 0) {
      const isOpen = (beatInBar % 4 === 2);
      playShimmerNoise(0, isOpen ? 0.08 : 0.03, isOpen ? 0.05 : 0.03);
    }

    // 3. シンセベース (弾むフレーズ)
    const basePitches = [130.81, 146.83, 164.81, 196.00]; // C3, D3, E3, G3
    const pitchOffset = Math.pow(1.05946, Math.min(feverMultLevel - 2, 4));
    if (beatInBar % 2 === 0) {
      const pIdx = Math.floor(beatInBar / 4) % basePitches.length;
      const bFreq = basePitches[pIdx] * pitchOffset;
      const bOsc = a.createOscillator();
      const bGain = a.createGain();
      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bFreq, now);

      const bFilter = a.createBiquadFilter();
      bFilter.type = 'lowpass';
      bFilter.frequency.setValueAtTime(600, now);
      bFilter.frequency.exponentialRampToValueAtTime(180, now + stepInterval * 1.5);

      bGain.gain.setValueAtTime(0, now);
      bGain.gain.linearRampToValueAtTime(0.09, now + 0.005);
      bGain.gain.exponentialRampToValueAtTime(0.0001, now + stepInterval * 1.6);

      bOsc.connect(bFilter);
      bFilter.connect(bGain);
      connectOut(bGain, false);

      bOsc.start(now);
      bOsc.stop(now + stepInterval * 1.8);
    }

    // 4. シンセコード (裏拍アクセント)
    if (beatInBar === 4 || beatInBar === 12) {
      const chord = [261.63, 329.63, 392.00, 523.25].map(f => f * pitchOffset);
      chord.forEach(cf => playTone(cf, 0, 0.12, 'triangle', 0.04));
    }

    feverBgmStep++;
    feverBgmTimer = setTimeout(stepFeverBgm, stepInterval * 1000);
  }

  function startFeverBgm(mult = 2) {
    feverMultLevel = mult;
    if (feverActive) return;
    feverActive = true;
    feverBgmStep = 0;
    stepFeverBgm();
  }

  function updateFeverBgm(mult = 2) {
    feverMultLevel = mult;
    if (!feverActive) startFeverBgm(mult);
  }

  function stopFeverBgm() {
    feverActive = false;
    if (feverBgmTimer) {
      clearTimeout(feverBgmTimer);
      feverBgmTimer = null;
    }
  }

  /* ==============================================================
   * 各種効果音 (SFX オブジェクト)
   * ============================================================== */
  const SFX = {
    // 効果音有効/無効
    setSound(enable) {
      isMuted = !enable;
      if (masterGain && AC) {
        masterGain.gain.setValueAtTime(isMuted ? 0 : MASTER_VOLUME, AC.currentTime);
      }
      if (isMuted) stopFeverBgm();
    },

    // 単元・コース選択 (短く軽い「ポン」)
    pick() {
      playTone(880, 0, 0.06, 'triangle', 0.12);
      playTone(1320, 0.03, 0.08, 'sine', 0.10);
    },

    // ロック中コースをタップ (短く低い「ブッ」、責めない音)
    locked() {
      playTone(200, 0, 0.12, 'triangle', 0.08);
      playTone(180, 0.04, 0.12, 'triangle', 0.08);
    },

    // スタート (爽快な短いファンファーレ)
    start() {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((f, i) => {
        playTone(f, i * 0.06, 0.22, 'triangle', 0.12);
        playTone(f * 2, i * 0.06 + 0.01, 0.18, 'sine', 0.06);
      });
      playBoom(0.24, 0.18, 110);
    },

    /* 正解音: 一致率と連続正解数で音を重ねる
     * - 連続正解ごとに半音ずつピッチ上昇
     * - 一致率 < 75%: 長三和音のみ
     * - 75〜79%: + キラキラ高音
     * - 80〜89%: + 低音ドン、和音長め
     * - 90%以上: + スイープノイズ + アルペジオ長め (最高峰)
     */
    judgeOk(pct, streak = 0, feverMult = 1) {
      // 基準音 (連続正解数に応じて半音ずつ上昇、FEVER倍率で追加ブースト)
      const semitoneShift = Math.min(streak, 10) + Math.max(0, feverMult - 1) * 2;
      const baseFreq = 523.25 * Math.pow(1.05946, semitoneShift); // C5基準

      // 長三和音
      const root = baseFreq;
      const third = baseFreq * 1.25992; // E
      const fifth = baseFreq * 1.49831; // G
      const octave = baseFreq * 2.0;    // C6

      const chordDur = pct >= 80 ? 0.35 : 0.22;
      playTone(root, 0, chordDur, 'triangle', 0.13);
      playTone(third, 0.02, chordDur, 'triangle', 0.12);
      playTone(fifth, 0.04, chordDur, 'triangle', 0.12);
      playTone(octave, 0.06, chordDur + 0.05, 'sine', 0.11);

      // 75%以上: キラキラ高音アルペジオ
      if (pct >= 75) {
        const arpeggio = [octave * 1.25992, octave * 1.49831, octave * 2];
        arpeggio.forEach((f, i) => {
          playTone(f, 0.08 + i * 0.04, 0.18, 'sine', 0.08);
        });
      }

      // 80%以上: 低音ドン
      if (pct >= 80) {
        playBoom(0.01, 0.22, 130 + semitoneShift * 4);
      }

      // 90%以上: シャッというノイズ + 長めの華やかアルペジオ
      if (pct >= 90) {
        playShimmerNoise(0, 0.25, 0.12);
        const grandArp = [octave, octave * 1.25992, octave * 1.49831, octave * 2, octave * 2.5];
        grandArp.forEach((f, i) => {
          playBellChime(f, 0.12 + i * 0.05, 0.12);
        });
        playBoom(0.24, 0.20, 90);
      }
    },

    // FEVER突入・倍率アップ (盛り上げる音 → 衝撃音 → ファンファーレ)
    feverUp(mult) {
      playSweepUp(0, 0.35);
      setTimeout(() => {
        playBoom(0, 0.32, 150 + mult * 10);
        const notes = [659.25, 783.99, 987.77, 1318.51, 1567.98].map(f => f * Math.pow(1.05946, mult - 1));
        notes.forEach((f, i) => {
          playTone(f, i * 0.05, 0.28, 'triangle', 0.13);
          playTone(f * 2, i * 0.05, 0.2, 'sine', 0.07);
        });
        playBellChime(notes[notes.length - 1] * 2, 0.3, 0.22);
      }, 350);
    },

    // 「クリア条件たっせい!」(明るく爽やかなファンファーレ)
    goalReached() {
      playSweepUp(0, 0.28);
      setTimeout(() => {
        playBoom(0, 0.24, 130);
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((f, i) => {
          playTone(f, i * 0.06, 0.25, 'triangle', 0.12);
        });
        playBellChime(2093, 0.32, 0.2);
      }, 280);
    },

    // コースクリア (最も豪華なファンファーレ)
    courseClear(isFirst = false) {
      playSweepUp(0, 0.4);
      setTimeout(() => {
        playBoom(0, 0.35, 140);
        const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];
        notes.forEach((f, i) => {
          playTone(f, i * 0.08, 0.35, 'triangle', 0.14);
          playTone(f * 1.5, i * 0.08 + 0.02, 0.25, 'sine', 0.08);
        });
        playBellChime(2637, 0.75, 0.25);
        if (isFirst) {
          // 初クリアはさらに一段高い祝音
          setTimeout(() => {
            [1567.98, 1760.00, 2093.00, 2637.02].forEach((f, i) => {
              playBellChime(f, i * 0.07, 0.22);
            });
            playBoom(0.3, 0.25, 110);
          }, 850);
        }
      }, 400);
    },

    // まちがえたとき (短く、やわらかい下がり音。子どもを責めないトーン)
    ng() {
      // やさしい木琴・マリンバの下降音
      playMarimba(392.00, 0, 0.14);      // G4
      playMarimba(329.63, 0.09, 0.13);   // E4
      playMarimba(261.63, 0.18, 0.12);   // C4
    },

    // コース未達成 (やさしく「もう一回!」と思える短い音)
    fail() {
      const notes = [440.00, 392.00, 349.23, 329.63];
      notes.forEach((f, i) => {
        playTone(f, i * 0.12, 0.25, 'sine', 0.11);
      });
    },

    // 特別ファンファーレ (称号アップ・全コースクリア)
    specialFanfare() {
      playSweepUp(0, 0.35);
      setTimeout(() => {
        playBoom(0, 0.32, 120);
        const melody = [523.25, 659.25, 783.99, 1046.50, 1174.66, 1318.51, 1567.98, 2093.00];
        melody.forEach((f, i) => {
          playTone(f, i * 0.07, 0.3, 'triangle', 0.13);
          playTone(f * 2, i * 0.07, 0.2, 'sine', 0.07);
        });
        playBellChime(2637, 0.65, 0.28);
      }, 350);
    },

    // 数字カウントアップ音 (木琴/マリンバ風のチチチ…ピッチ上昇)
    countTick(progress = 0) {
      // progress 0.0 -> 1.0 に応じて 523Hz(C5) -> 1046Hz(C6)
      const freq = 523.25 + progress * 523.25;
      playMarimba(freq, 0, 0.15);
    },

    // 数字カウントアップ完了音 (「キン!」)
    countEnd() {
      playBellChime(2093, 0, 0.25);
      playBoom(0.02, 0.18, 120);
    },

    // FEVER BGM 制御
    feverBgm: {
      start: startFeverBgm,
      update: updateFeverBgm,
      stop: stopFeverBgm,
    },

    ac: initAudio,
  };

  window.SFX = SFX;
  window.Sound = SFX;
})();
