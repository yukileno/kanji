/* ペンで書く枠（熟語・送りがな対応）
 * - 漢字1字につき1マス、送りがなは印字（書かせない）
 * - ペン入力を優先し、ペンを使ったあとは指・手のひらのタッチを無視（penMode: 'auto' | 'pen' | 'any'）
 * - 筆圧で線の太さを変え、点は時刻つきで保存（ふりかえり再生用）
 * 座標は「1マス=1」の単位で保存するので、画面サイズが変わっても書いた線は崩れない。 */
(function () {
  'use strict';
  const COLORS = { ok: '#16a34a', order: '#ea580c', dir: '#ea580c', length: '#ea580c', shape: '#dc2626', extra: '#dc2626', missing: '#94a3b8' };
  const INK = '#2b2f3a';

  class WritingPad {
    constructor(wrap, opt = {}) {
      this.opt = Object.assign({ penMode: 'auto', maxBox: 320, minBox: 110, kanaScale: .46, onStroke: null }, opt);
      this.wrap = wrap;
      wrap.classList.add('wpad');
      wrap.innerHTML = '<canvas></canvas><canvas></canvas><canvas></canvas>';
      [this.gc, this.oc, this.ic] = wrap.querySelectorAll('canvas');   // 下から: 方眼・お手本・インク
      this.strokes = []; this.cur = null; this.pid = null; this.seenPen = false;
      this.segs = []; this.cells = []; this.box = 200; this.t0 = 0;
      this.result = null; this.tmpls = []; this.showModel = false; this.locked = false; this.anim = 0;
      const ink = this.ic;
      ink.addEventListener('pointerdown', e => this._down(e));
      ink.addEventListener('pointermove', e => this._move(e));
      ink.addEventListener('pointerup', e => this._up(e));
      ink.addEventListener('pointercancel', e => this._up(e));
      ink.addEventListener('contextmenu', e => e.preventDefault());
      ink.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    }

    /* ---------- レイアウト ---------- */
    setWord(segs, tmpls) {
      this.segs = segs; this.tmpls = tmpls || [];
      this.clear();
      this.layout();
    }
    layout() {
      const units = this.segs.reduce((a, s) => a + (s.type === 'kanji' ? 1 : this._kanaW(s.text)), 0) || 1;
      const avail = (this.wrap.parentElement || this.wrap).clientWidth - 12;
      this.box = Math.floor(Math.max(this.opt.minBox, Math.min(avail / units, this.opt.maxBox)));
      let x = 0; this.cells = []; this.kana = [];
      for (const s of this.segs) {
        if (s.type === 'kanji') { this.cells.push({ x0: x, ch: s.ch }); x += 1; }
        else { const w = this._kanaW(s.text); this.kana.push({ x0: x, w, text: s.text }); x += w; }
      }
      this.W = x * this.box; this.H = this.box;
      this.wrap.style.width = this.W + 'px'; this.wrap.style.height = this.H + 'px';
      const d = window.devicePixelRatio || 1;
      for (const cv of [this.gc, this.oc, this.ic]) {
        cv.width = Math.round(this.W * d); cv.height = Math.round(this.H * d);
        cv.style.width = this.W + 'px'; cv.style.height = this.H + 'px';
      }
      this.dpr = d;
      this._drawGrid(); this._drawOverlay(); this._redrawInk();
    }
    _kanaW(text) { return [...text].length * this.opt.kanaScale + .08; }
    _ctx(cv) { const c = cv.getContext('2d'); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); return c; }

    _drawGrid() {
      const c = this._ctx(this.gc), b = this.box;
      c.clearRect(0, 0, this.W, this.H);
      for (const cell of this.cells) {
        const x = cell.x0 * b;
        c.setLineDash([]); c.lineWidth = 2.5; c.strokeStyle = '#f2a5bb';
        c.strokeRect(x + 5, 5, b - 10, b - 10);
        c.setLineDash([7, 7]); c.lineWidth = 1.5; c.strokeStyle = '#f8cfdb';
        c.beginPath(); c.moveTo(x + b / 2, 9); c.lineTo(x + b / 2, b - 9); c.moveTo(x + 9, b / 2); c.lineTo(x + b - 9, b / 2); c.stroke();
      }
      c.setLineDash([]);
      c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `600 ${b * .4}px "Klee One","Hiragino Mincho ProN",serif`;
      for (const k of this.kana) [...k.text].forEach((ch, i) => c.fillText(ch, (k.x0 + .04 + (i + .5) * this.opt.kanaScale) * b, b * .55));
    }

    /* ---------- 入力 ---------- */
    _pt(e) {
      const r = this.ic.getBoundingClientRect();
      const p = e.pointerType === 'pen' ? (e.pressure || .5) : .5;
      return { x: (e.clientX - r.left) / this.box, y: (e.clientY - r.top) / this.box, t: Math.round(performance.now() - this.t0), p };
    }
    _accept(e) {
      if (e.pointerType === 'pen') { this.seenPen = true; return true; }
      if (e.pointerType === 'touch') return this.opt.penMode === 'any' || (this.opt.penMode === 'auto' && !this.seenPen);
      return true;   // マウス（先生のPC確認用）
    }
    _down(e) {
      e.preventDefault();
      if (this.locked || this.pid !== null || !this._accept(e)) return;
      if (this.result) this.clearResult();
      this.pid = e.pointerId;
      try { this.ic.setPointerCapture(e.pointerId); } catch (err) {}
      if (!this.strokes.length) this.t0 = performance.now();
      this.cur = [this._pt(e)]; this.strokes.push(this.cur);
      const c = this._inkCtx(INK), p = this.cur[0];
      c.beginPath(); c.arc(p.x * this.box, p.y * this.box, this._w(p) / 2, 0, 7); c.fill();
    }
    _move(e) {
      if (e.pointerId !== this.pid || !this.cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const c = this._inkCtx(INK);
      for (const ev of (evs.length ? evs : [e])) {
        const p = this._pt(ev), s = this.cur, last = s[s.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < .004) continue;
        p.p = last.p * .6 + p.p * .4;        // 筆圧をなめらかに
        s.push(p); this._seg(c, s, s.length - 1);
      }
    }
    _up(e) {
      if (e.pointerId !== this.pid) return;
      this.pid = null;
      const s = this.cur; this.cur = null;
      if (s && this.opt.onStroke) this.opt.onStroke(s);
    }

    /* ---------- 描画 ---------- */
    _w(p) { return this.box * .042 * (.55 + p.p * .9); }
    _inkCtx(color) { const c = this._ctx(this.ic); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = c.fillStyle = color; return c; }
    // 中点を結ぶ二次曲線で、なめらかに描く
    _seg(c, s, i) {
      const b = this.box, a = s[i - 2] || s[i - 1], p = s[i - 1], q = s[i];
      const m0 = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 }, m1 = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      c.lineWidth = (this._w(p) + this._w(q)) / 2;
      c.beginPath(); c.moveTo((i < 2 ? p.x : m0.x) * b, (i < 2 ? p.y : m0.y) * b);
      c.quadraticCurveTo(p.x * b, p.y * b, m1.x * b, m1.y * b); c.stroke();
    }
    _drawStroke(c, s, upto = s.length) {
      const b = this.box;
      c.beginPath(); c.arc(s[0].x * b, s[0].y * b, this._w(s[0]) / 2, 0, 7); c.fill();
      for (let i = 1; i < upto; i++) this._seg(c, s, i);
      if (upto === s.length && s.length > 1) {   // 最後の半区間
        const p = s[s.length - 2], q = s[s.length - 1];
        c.lineWidth = this._w(q); c.beginPath(); c.moveTo((p.x + q.x) / 2 * b, (p.y + q.y) / 2 * b); c.lineTo(q.x * b, q.y * b); c.stroke();
      }
    }
    _strokeColor(s) { return this.result && s.status && s.status !== 'ok' ? COLORS[s.status] : INK; }
    _redrawInk() {
      const c = this._ctx(this.ic); c.clearRect(0, 0, this.W, this.H);
      for (const s of this.strokes) this._drawStroke(this._inkCtx(this._strokeColor(s)), s);
    }
    // お手本（animCJK の輪郭）を重ねる。判定後は画ごとに色分け
    _drawOverlay() {
      const c = this.oc.getContext('2d'), b = this.box, d = this.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.oc.width, this.oc.height);
      if (!this.showModel && !this.result) return;
      this.cells.forEach((cell, k) => {
        const t = this.tmpls[k]; if (!t) return;
        const r = this.result && this.result.chars[k], s = b / 1024;
        t.strokes.forEach((path, j) => {
          c.setTransform(d * s, 0, 0, -d * s, d * cell.x0 * b, d * 900 * s);
          c.fillStyle = r ? COLORS[r.tmplStatus[j]] + (r.tmplStatus[j] === 'ok' ? '33' : '66') : '#ff3b6b30';
          c.fill(new Path2D(path));
        });
        if (r) {   // 画の番号（間違えた画だけ）
          c.setTransform(d, 0, 0, d, 0, 0);
          c.font = `900 ${b * .07}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          t.lines.forEach((ln, j) => {
            if (r.tmplStatus[j] === 'ok') return;
            c.fillStyle = COLORS[r.tmplStatus[j]];
            c.fillText(j + 1, (cell.x0 + ln[0].x) * b - b * .045, ln[0].y * b - b * .04);
          });
        }
      });
    }

    /* ---------- 操作 ---------- */
    undo() { if (this.locked) return; this.strokes.pop(); this.clearResult(); this._redrawInk(); }
    clear() { this.stopModel(); cancelAnimationFrame(this.anim);this.strokes = []; this.cur = null; this.pid = null; this.result = null; this.locked = false; this._redrawInk && this.W && (this._redrawInk(), this._drawOverlay()); }
    toggleModel(on = !this.showModel) { this.showModel = on; this._drawOverlay(); return on; }
    clearResult() { if (!this.result) return; this.result = null; this.strokes.forEach(s => delete s.status); this._drawOverlay(); this._redrawInk(); }

    // マスごとに線を振り分け（重心のx座標で決める。送りがなの上にはみ出した線は近いマスへ）
    strokesByCell() {
      const out = this.cells.map(() => []), idx = this.cells.map(() => []);
      this.strokes.forEach((s, si) => {
        const cx = s.reduce((a, p) => a + p.x, 0) / s.length;
        let k = 0, bd = 1e9;
        this.cells.forEach((c, i) => { const d = cx < c.x0 ? c.x0 - cx : cx > c.x0 + 1 ? cx - c.x0 - 1 : 0; if (d < bd) { bd = d; k = i; } });
        out[k].push(s.map(p => ({ x: p.x - this.cells[k].x0, y: p.y, t: p.t, p: p.p })));
        idx[k].push(si);
      });
      return { strokes: out, index: idx };
    }
    // judgeWord の結果を受け取り、色分け表示
    showResult(result) {
      this.result = result;
      const { index } = this.strokesByCell();
      result.chars.forEach((r, k) => index[k].forEach((si, n) => { this.strokes[si].status = r.userStatus[n] || 'extra'; }));
      this._drawOverlay(); this._redrawInk();
    }
    // 書いた順に再生（線と線の間の待ち時間は最大0.35秒に詰める）
    replay(speed = 1) {
      cancelAnimationFrame(this.anim);
      if (!this.strokes.length) return;
      const tl = []; let off = 0, prevEnd = null;
      for (const s of this.strokes) {
        const st = s[0].t, en = s[s.length - 1].t;
        if (prevEnd !== null) off += Math.max(0, (st - prevEnd) - 350);
        tl.push({ s, st: st - off, en: en - off }); prevEnd = en;
      }
      this.locked = true;
      const start = performance.now();
      const step = now => {
        const t = (now - start) * speed;
        const c = this._ctx(this.ic); c.clearRect(0, 0, this.W, this.H);
        for (const { s, st } of tl) {
          if (t < st) break;
          const n = s.findIndex(p => p.t - (s[0].t - st) > t);
          this._drawStroke(this._inkCtx(this._strokeColor(s)), s, n < 0 ? s.length : Math.max(1, n));
        }
        if (t < tl[tl.length - 1].en + 200) this.anim = requestAnimationFrame(step);
        else { this.locked = false; this._redrawInk(); }
      };
      this.anim = requestAnimationFrame(step);
    }
    // 書き順アニメーション: 1画ずつ、輪郭の内側を中心線に沿って塗っていく（animCJK と同じ見せ方）
    animateModel(opt = {}) {
      const speed = opt.speed || 1;
      this.stopModel();
      const plan = []; let t = 0;
      this.cells.forEach((cell, k) => {
        const tm = this.tmpls[k]; if (!tm) return;
        tm.strokes.forEach((d, j) => {
          const m = tm.medians[j];
          const len = m.reduce((a, p, i) => i ? a + Math.hypot(p[0] - m[i - 1][0], p[1] - m[i - 1][1]) : 0, 0);
          const dur = (220 + len * .6) / speed;
          plan.push({ cell, j, path: new Path2D(d), m, len, st: t, dur });
          t += dur + 150 / speed;
        });
        t += 250 / speed;
      });
      if (!plan.length) return;
      this.locked = true; this.animating = true;
      this.ic.style.opacity = .15;                    // 書いた線は薄くして、お手本を見やすく
      const b = this.box, d = this.dpr, s = b / 1024, c = this.oc.getContext('2d');
      const start = performance.now();
      const step = now => {
        const el = now - start;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.oc.width, this.oc.height);
        for (const it of plan) {                       // うすい下絵
          c.setTransform(d * s, 0, 0, -d * s, d * it.cell.x0 * b, d * 900 * s);
          c.fillStyle = '#e2e8f0'; c.fill(it.path);
        }
        for (const it of plan) {
          if (el < it.st) break;
          const f = Math.min(1, (el - it.st) / it.dur);
          c.setTransform(d * s, 0, 0, -d * s, d * it.cell.x0 * b, d * 900 * s);
          c.save(); c.clip(it.path);
          c.strokeStyle = f < 1 ? '#ff3b6b' : INK; c.lineWidth = 150; c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath(); c.moveTo(it.m[0][0], it.m[0][1]);
          let left = f * it.len;
          for (let i = 1; i < it.m.length && left > 0; i++) {
            const [x0, y0] = it.m[i - 1], [x1, y1] = it.m[i], sl = Math.hypot(x1 - x0, y1 - y0);
            const k = Math.min(1, left / (sl || 1)); c.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); left -= sl;
          }
          c.stroke(); c.restore();
          // 画の番号
          c.setTransform(d, 0, 0, d, 0, 0);
          c.font = `900 ${b * .065}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = '#ff3b6b';
          c.fillText(it.j + 1, (it.cell.x0 + it.m[0][0] / 1024) * b - b * .04, (900 - it.m[0][1]) / 1024 * b - b * .04);
        }
        const last = plan[plan.length - 1];
        if (el < last.st + last.dur + 900) this.anim = requestAnimationFrame(step);
        else { this.stopModel(); opt.onDone && opt.onDone(); }
      };
      this.anim = requestAnimationFrame(step);
    }
    stopModel() {
      if (!this.animating) return;
      cancelAnimationFrame(this.anim);
      this.animating = false; this.locked = false; this.ic.style.opacity = '';
      this._drawOverlay();
    }
    // 保存用（ふりかえり・ログ）: 小数を丸めて軽くする
    exportStrokes() { return this.strokes.map(s => s.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), p.t, +p.p.toFixed(2)])); }
  }
  window.WritingPad = WritingPad;
})();
