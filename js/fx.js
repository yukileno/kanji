/* 演出エンジン（見た目だけ。点数や判定には関わらない）
 * - 全画面キャンバスのパーティクル: 紙吹雪・花火・星・絵文字
 * - 画面のゆれ・フラッシュ・数字のカウントアップ・点数が飛んでいく演出 */
(function () {
  'use strict';
  const COLORS = ['#ff3b6b', '#ffcc00', '#22c55e', '#3b9cff', '#a855f7', '#ff8a00', '#00e5ff', '#ffffff', '#ff6ec7'];
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(cv));
  if (document.body) document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, P = [], running = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize); resize();
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function add(p) { if (reduce) return; P.push(p); if (P.length > 900) P.splice(0, P.length - 900); if (!running) { running = true; requestAnimationFrame(loop); } }
  function star(c, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); }
  function loop() {
    ctx.clearRect(0, 0, W, H);
    P = P.filter(p => p.life > 0);
    for (const p of P) {
      p.life -= 1; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const a = Math.min(1, p.life / 25);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.kind === 'emoji') { ctx.font = `${p.size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.ch, 0, 0); }
      else {
        ctx.fillStyle = p.color;
        if (p.kind === 'star') star(ctx, p.size);
        else if (p.kind === 'dot') { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fill(); }
        else ctx.fillRect(-p.size, -p.size * .45, p.size * 2, p.size * .9);   // 紙吹雪
      }
      ctx.restore();
    }
    if (P.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  const FX = {
    // 中心から飛び散る
    burst(x, y, n = 60, power = 12) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), v = rand(power * .3, power);
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: .35, drag: .97, life: rand(45, 80), rot: rand(0, 6), vr: rand(-.3, .3),
          size: rand(4, 9), color: pick(COLORS), kind: pick(['star', 'paper', 'paper', 'dot']) });
      }
    },
    // 花火（空中で丸く広がる）
    firework(x, y, n = 70) {
      const c = pick(COLORS);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, v = rand(5, 9);
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .12, drag: .965, life: rand(50, 75), rot: 0, vr: 0, size: rand(2, 3.5), color: Math.random() < .2 ? '#fff' : c, kind: 'dot' });
      }
    },
    // 上から紙吹雪
    confetti(n = 120) {
      for (let i = 0; i < n; i++)
        add({ x: rand(0, W), y: rand(-H * .3, -10), vx: rand(-2, 2), vy: rand(2, 6), g: .06, drag: .995, life: rand(120, 200), rot: rand(0, 6), vr: rand(-.2, .2), size: rand(5, 9), color: pick(COLORS), kind: 'paper' });
    },
    emoji(x, y, list, n = 10) {
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI * .9, -Math.PI * .1), v = rand(6, 13);
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .3, drag: .98, life: rand(55, 85), rot: rand(-.5, .5), vr: rand(-.08, .08), size: rand(26, 42), ch: pick(list), kind: 'emoji' });
      }
    },
    // 画面の端から火の粉（FEVER中）
    sparks(n = 6) {
      for (let i = 0; i < n; i++) {
        const left = Math.random() < .5;
        add({ x: left ? rand(0, 30) : rand(W - 30, W), y: rand(H * .3, H), vx: left ? rand(.5, 2) : rand(-2, -.5), vy: rand(-6, -2), g: -.02, drag: .99, life: rand(40, 70), rot: 0, vr: 0, size: rand(2, 4), color: pick(['#ffcc00', '#ff8a00', '#ff3b6b', '#fde047']), kind: 'dot' });
      }
    },
    center(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
    shake(el, cls = 'fx-shake') { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },
    flash(color = '#fff') {
      const f = document.createElement('div');
      f.style.cssText = `position:fixed;inset:0;background:${color};pointer-events:none;z-index:29;animation:fxFlash .35s ease-out forwards`;
      document.body.appendChild(f); setTimeout(() => f.remove(), 400);
    },
    // 数字をくるくる増やす
    countUp(el, to, ms = 600, from = null) {
      const f0 = from ?? (+String(el.textContent).replace(/[^\d]/g, '') || 0), t0 = performance.now();
      cancelAnimationFrame(el._cu);
      const step = now => {
        const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(f0 + (to - f0) * e).toLocaleString();
        if (k < 1) el._cu = requestAnimationFrame(step);
      };
      el._cu = requestAnimationFrame(step);
    },
    // 文字が要素から要素へ飛んでいく（+600 が点数へ）
    fly(text, fromEl, toEl, cls = 'fx-fly') {
      const [x0, y0] = FX.center(fromEl), [x1, y1] = FX.center(toEl);
      const d = document.createElement('div'); d.className = cls; d.textContent = text;
      d.style.left = x0 + 'px'; d.style.top = y0 + 'px';
      document.body.appendChild(d);
      requestAnimationFrame(() => { d.style.transform = `translate(${x1 - x0}px,${y1 - y0}px) scale(.5)`; d.style.opacity = '.2'; });
      setTimeout(() => d.remove(), 750);
    },
  };
  window.FX = FX;
})();
