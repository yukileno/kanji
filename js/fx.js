/* 演出エンジン (高効率Canvas & ネオン・宝石・花火・光線エフェクト)
 * - ギャンブル用語・絵柄・仕組みは一切不使用
 * - 一致率の段階 (青 <75% / 緑 75-79% / 赤 80-89% / 金 90%+ / 虹) に完全連動
 * - Chromebook 向け高効率描画 & prefers-reduced-motion 対応
 * - 書く枠の邪魔をしない pointer-events: none
 */
(function () {
  'use strict';

  // 段階ごとのネオンカラーパレット
  const PALETTES = {
    blue: ['#38bdf8', '#0ea5e9', '#0284c7', '#bae6fd', '#ffffff'],
    green: ['#4ade80', '#22c55e', '#16a34a', '#bbf7d0', '#ffffff'],
    red: ['#f87171', '#ef4444', '#dc2626', '#fecaca', '#fde047'],
    gold: ['#fde047', '#facc15', '#eab308', '#ca8a04', '#ffffff', '#ffedd5'],
    rainbow: ['#ff3b6b', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ffffff'],
  };

  const cv = document.createElement('canvas');
  cv.id = 'fxCanvas';
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:35;';
  
  if (document.body) document.body.appendChild(cv);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(cv));

  const ctx = cv.getContext('2d');
  let W = 0, H = 0, P = [], running = false;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function addParticle(p) {
    if (reduceMotion) return;
    P.push(p);
    if (P.length > 600) P.splice(0, P.length - 600); // Chromebook負荷抑制
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  // 星型パス描画
  function drawStar(c, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5 - Math.PI / 2;
      const rad = i % 2 ? r * 0.42 : r;
      c.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
    }
    c.closePath();
    c.fill();
  }

  // 宝石（ダイヤモンド型）パス描画
  function drawGem(c, r) {
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r * 0.75, -r * 0.3);
    c.lineTo(0, r);
    c.lineTo(-r * 0.75, -r * 0.3);
    c.closePath();
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1;
    c.stroke();
  }

  // 光のリング（円形衝撃波）描画
  function drawRing(c, r, lw, color, alpha) {
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.strokeStyle = color;
    c.lineWidth = lw;
    c.globalAlpha = alpha;
    c.stroke();
  }

  // メインアニメーションループ
  function loop() {
    ctx.clearRect(0, 0, W, H);
    P = P.filter(p => p.life > 0);

    for (const p of P) {
      p.life -= 1;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      const alpha = Math.min(1, p.life / p.maxLifeFade);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.glow ? 8 : 0;
        drawStar(ctx, p.size);
      } else if (p.kind === 'gem') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        drawGem(ctx, p.size);
      } else if (p.kind === 'ring') {
        drawRing(ctx, p.size, p.lineWidth, p.color, alpha);
        p.size += p.expand;
      } else if (p.kind === 'spark') {
        // 光の筋（速度方向に伸びる線）
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-p.vx * 3.5, -p.vy * 3.5);
        ctx.stroke();
      } else if (p.kind === 'emoji') {
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.ch, 0, 0);
      } else if (p.kind === 'dot') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 紙吹雪 / ネオンリボン
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
      }
      ctx.restore();
    }

    if (P.length > 0) {
      requestAnimationFrame(loop);
    } else {
      running = false;
      ctx.clearRect(0, 0, W, H);
    }
  }

  /* ==============================================================
   * 演出API (FX オブジェクト)
   * ============================================================== */
  const FX = {
    // 要素の中心座標取得
    center(el) {
      if (!el) return [W / 2, H / 2];
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    },

    // 一致率・倍率に応じた光の炸裂バースト
    burst(x, y, tier = 'blue', count = 50, power = 12) {
      const colors = PALETTES[tier] || PALETTES.blue;
      // 衝撃波リング
      addParticle({
        x, y, vx: 0, vy: 0, g: 0, drag: 1, life: 25, maxLifeFade: 10,
        rot: 0, vr: 0, size: 10, expand: power * 1.8, lineWidth: 3,
        color: colors[0], kind: 'ring'
      });

      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const spd = rand(power * 0.25, power);
        const col = pick(colors);
        const isGem = Math.random() < 0.25;
        const isStar = Math.random() < 0.35;
        addParticle({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - rand(1, 3.5),
          g: 0.32, drag: 0.965,
          life: rand(45, 80), maxLifeFade: 25,
          rot: rand(0, 6), vr: rand(-0.25, 0.25),
          size: isGem ? rand(5, 9) : isStar ? rand(5, 8) : rand(3, 6),
          color: col,
          glow: true,
          kind: isGem ? 'gem' : isStar ? 'star' : 'spark'
        });
      }
    },

    // 華やかな花火 (指定座標に炸裂)
    firework(x, y, tier = 'gold', count = 65) {
      const colors = PALETTES[tier] || PALETTES.gold;
      const baseCol = pick(colors);

      // 中心の閃光リング
      addParticle({
        x, y, vx: 0, vy: 0, g: 0, drag: 1, life: 20, maxLifeFade: 8,
        rot: 0, vr: 0, size: 6, expand: 9, lineWidth: 2.5,
        color: '#ffffff', kind: 'ring'
      });

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
        const spd = rand(4.5, 9.5);
        const col = Math.random() < 0.2 ? '#ffffff' : baseCol;
        addParticle({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          g: 0.12, drag: 0.965,
          life: rand(50, 75), maxLifeFade: 25,
          rot: 0, vr: 0,
          size: rand(2.5, 4.5),
          color: col,
          kind: 'spark'
        });
      }
    },

    // 祝賀の紙吹雪 (画面上部から舞い降りる)
    confetti(count = 140) {
      const allColors = PALETTES.rainbow;
      for (let i = 0; i < count; i++) {
        addParticle({
          x: rand(0, W),
          y: rand(-H * 0.25, -10),
          vx: rand(-2.5, 2.5),
          vy: rand(2, 6.5),
          g: 0.065, drag: 0.995,
          life: rand(120, 200), maxLifeFade: 40,
          rot: rand(0, 6), vr: rand(-0.2, 0.2),
          size: rand(5, 9),
          color: pick(allColors),
          kind: Math.random() < 0.3 ? 'star' : 'paper'
        });
      }
    },

    // 祝賀絵文字バースト
    emoji(x, y, list, count = 10) {
      for (let i = 0; i < count; i++) {
        const angle = rand(-Math.PI * 0.9, -Math.PI * 0.1);
        const spd = rand(6, 13);
        addParticle({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          g: 0.32, drag: 0.98,
          life: rand(55, 85), maxLifeFade: 25,
          rot: rand(-0.5, 0.5), vr: rand(-0.08, 0.08),
          size: rand(26, 40),
          ch: pick(list),
          kind: 'emoji'
        });
      }
    },

    // FEVER中の画面端の光の粒子・きらめき
    sparks(count = 5, tier = 'gold') {
      const colors = PALETTES[tier] || PALETTES.gold;
      for (let i = 0; i < count; i++) {
        const isLeft = Math.random() < 0.5;
        addParticle({
          x: isLeft ? rand(0, 35) : rand(W - 35, W),
          y: rand(H * 0.25, H),
          vx: isLeft ? rand(0.8, 2.5) : rand(-2.5, -0.8),
          vy: rand(-6, -2),
          g: -0.03, drag: 0.988,
          life: rand(35, 65), maxLifeFade: 20,
          rot: rand(0, 6), vr: rand(-0.2, 0.2),
          size: rand(3, 6),
          color: pick(colors),
          kind: Math.random() < 0.5 ? 'star' : 'dot'
        });
      }
    },

    // 画面揺れ (CSSアニメーション)
    shake(el, cls = 'fx-shake') {
      if (!el || reduceMotion) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    },

    // 全画面フラッシュ (金・虹・白)
    flash(color = '#fff') {
      if (reduceMotion) return;
      const f = document.createElement('div');
      f.style.cssText = `position:fixed;inset:0;background:${color};pointer-events:none;z-index:40;animation:fxFlash .35s ease-out forwards;`;
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 400);
    },

    // 得点・文字が要素から要素へ飛ぶ
    fly(text, fromEl, toEl, colorTier = 'gold') {
      if (!fromEl || !toEl) return;
      const [x0, y0] = FX.center(fromEl);
      const [x1, y1] = FX.center(toEl);
      const d = document.createElement('div');
      d.className = `fx-fly fx-fly-${colorTier}`;
      d.textContent = text;
      d.style.left = `${x0}px`;
      d.style.top = `${y0}px`;
      document.body.appendChild(d);
      requestAnimationFrame(() => {
        d.style.transform = `translate(${x1 - x0}px,${y1 - y0}px) scale(0.6)`;
        d.style.opacity = '0.2';
      });
      setTimeout(() => d.remove(), 750);
    },

    // 数字のカウントアップ (木琴音連動)
    countUp(el, to, ms = 600, from = null) {
      if (!el) return;
      const f0 = from ?? (+String(el.textContent).replace(/[^\d]/g, '') || 0);
      const t0 = performance.now();
      cancelAnimationFrame(el._cu);

      let lastTickProgress = 0;

      const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        const currentVal = Math.round(f0 + (to - f0) * eased);
        el.textContent = currentVal.toLocaleString();

        // 10% 刻みで木琴サウンドを鳴らす
        if (k - lastTickProgress >= 0.08 && window.SFX && window.SFX.countTick) {
          window.SFX.countTick(k);
          lastTickProgress = k;
        }

        if (k < 1) {
          el._cu = requestAnimationFrame(step);
        } else {
          el.textContent = to.toLocaleString();
          if (window.SFX && window.SFX.countEnd) {
            window.SFX.countEnd();
          }
        }
      };
      el._cu = requestAnimationFrame(step);
    },

    // 書く枠周りのネオンフレーム発光パルス
    pulsePadFrame(tier = 'blue') {
      const padEl = document.querySelector('.wpad');
      if (!padEl) return;
      padEl.classList.remove('pad-glow-blue', 'pad-glow-green', 'pad-glow-red', 'pad-glow-gold', 'pad-glow-rainbow');
      void padEl.offsetWidth;
      padEl.classList.add(`pad-glow-${tier}`);
      setTimeout(() => {
        padEl.classList.remove(`pad-glow-${tier}`);
      }, 1200);
    },
  };

  window.FX = FX;
})();
