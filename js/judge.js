/* 書き終わってからの正誤判定（試作1の方式を animCJK の中心線データ用に整理）
 * 入力: 書いた線 [[{x,y}]]（マス内 0..1）、お手本の中心線 [[{x,y}]]（0..1）
 * 判定項目: 画数・各画の形・向き・書き順・長さ関係。どれか1つでも違えば ❌。
 * とめ・はね・はらいは見ない（文化庁 2016 指針に合わせる）。 */
(function () {
  'use strict';
  const N = 32;                                            // 1画あたりのリサンプル点数
  const LEVELS = { ultraEasy: .25, superEasy: .23, easy: .17, normal: .13, strict: .095 };   // superEasy=激甘（入/人・夫/天 は区別できなくなる） // 形のずれの許容量（字の大きさ=約0.8 に対する平均距離）
  // ultraEasy=激激甘（先生の確認用の試験版）: 許容量を少し広げたうえで、線の長さを見ない
  //   ・各画の長さが お手本の 0.4〜2.5倍 なら、長さをそろえてから形を比べる
  //   ・長さ関係（土/士・未/末）のチェックをしない
  //   ・字全体の縦横比のずれは 2倍まで吸収
  //   画数・向き・書き順は きびしく判定する（形の許容量を広げても見のがさないよう、形とは別に調べる）
  const LENGTH_FREE = { ultraEasy: { scale: 2.5, aspect: 2 } };
  const MAX_SHAPE_MSGS = 2;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function resample(pts, n = N) {
    if (pts.length < 2) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const L = cum[cum.length - 1];
    if (L < 1e-6) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
    const out = []; let j = 1;
    for (let i = 0; i < n; i++) {
      const t = L * i / (n - 1);
      while (j < pts.length - 1 && cum[j] < t) j++;
      const k = (t - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
      out.push({ x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * k, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * k });
    }
    return out;
  }
  function bbox(strokes) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // 書いた字をお手本の大きさ・位置にそろえる（縦横比のずれは1.5倍まで吸収）
  function normalizeTo(user, tmpl, aspect = 1.5) {
    const u = bbox(user), t = bbox(tmpl);
    const big = Math.max(t.w, t.h) / Math.max(u.w, u.h, 1e-3);
    let sx = u.w > .05 && t.w > .05 ? t.w / u.w : big;
    let sy = u.h > .05 && t.h > .05 ? t.h / u.h : big;
    const g = Math.sqrt(sx * sy);
    sx = Math.min(Math.max(sx, g / aspect), g * aspect);
    sy = Math.min(Math.max(sy, g / aspect), g * aspect);
    return user.map(s => s.map(p => ({ x: t.cx + (p.x - u.cx) * sx, y: t.cy + (p.y - u.cy) * sy })));
  }
  const meanDist = (a, b) => a.reduce((s, p, i) => s + dist(p, b[i]), 0) / a.length;
  const strokeLen = s => s.reduce((a, p, i) => i ? a + dist(s[i - 1], p) : 0, 0);
  // 書いた画を、その重心を中心に お手本の画と同じ長さへ伸び縮みさせる（倍率は 1/lim〜lim）
  function fitLength(u, t, lim) {
    const k = Math.min(lim, Math.max(1 / lim, strokeLen(t) / Math.max(strokeLen(u), 1e-3)));
    const cx = u.reduce((a, p) => a + p.x, 0) / u.length, cy = u.reduce((a, p) => a + p.y, 0) / u.length;
    return u.map(p => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  }
  const strokeAng = s => Math.atan2(s[s.length - 1].y - s[0].y, s[s.length - 1].x - s[0].x);
  // 画の向きに沿って射影したときの重なり率（短い方に対する割合）
  function overlap(s, t) {
    const g = strokeAng(s), ux = Math.cos(g), uy = Math.sin(g);
    const pr = st => { const v = st.map(p => p.x * ux + p.y * uy); return [Math.min(...v), Math.max(...v)]; };
    const [a0, a1] = pr(s), [b0, b1] = pr(t);
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(Math.min(a1 - a0, b1 - b0), 1e-3);
  }
  // 最長増加部分列に入らない位置 = 書き順がずれている画
  function outOfOrder(seq) {
    const n = seq.length, len = Array(n).fill(1), prev = Array(n).fill(-1);
    for (let i = 0; i < n; i++) for (let k = 0; k < i; k++) if (seq[k] < seq[i] && len[k] + 1 > len[i]) { len[i] = len[k] + 1; prev[i] = k; }
    let best = -1; for (let i = 0; i < n; i++) if (best < 0 || len[i] > len[best]) best = i;
    const keep = new Set(); for (let i = best; i >= 0; i = prev[i]) keep.add(i);
    return seq.map((_, i) => !keep.has(i));
  }

  function judgeChar(userRaw, tmplRaw, opt = {}) {
    const th = LEVELS[opt.tolerance] || LEVELS.normal;
    const T = tmplRaw.map(s => resample(s));
    const res = { ok: false, reasons: [], tmplStatus: T.map(() => 'missing'), userStatus: [], map: T.map(() => -1), debug: [] };
    const user = userRaw.filter(s => s.length);
    if (!user.length) { res.reasons.push({ type: 'empty' }); res.score = 0; return withMsgs(res); }
    const lf = LENGTH_FREE[opt.tolerance];
    const U = normalizeTo(user, tmplRaw, lf ? lf.aspect : 1.5).map(s => resample(s));
    const C0 = U.map(u => T.map(t => meanDist(u, t)));   // 一致率（点数）はこちらで計算する
    const cost = (u, t) => lf ? Math.min(meanDist(u, t), meanDist(fitLength(u, t, lf.scale), t)) : meanDist(u, t);
    const C = U.map(u => T.map(t => cost(u, t)));
    const CR = U.map(u => { const r = u.slice().reverse(); return T.map(t => cost(r, t)); });
    const CR0 = lf && U.map(u => { const r = u.slice().reverse(); return T.map(t => meanDist(r, t)); });
    const best = (i, j) => Math.min(C[i][j], CR[i][j]);

    // 対応づけの候補A: 書いた順そのまま（画数が同じとき）／候補B: 一番近い画どうし
    const cand = [];
    if (U.length === T.length) cand.push(T.map((_, j) => j));
    const pairs = [];
    for (let i = 0; i < U.length; i++) for (let j = 0; j < T.length; j++) pairs.push([best(i, j), i, j]);
    pairs.sort((a, b) => a[0] - b[0]);
    const g = T.map(() => -1), used = new Set();
    for (const [, i, j] of pairs) if (g[j] < 0 && !used.has(i)) { g[j] = i; used.add(i); }
    cand.push(g);
    const badCount = m => m.reduce((n, i, j) => n + (i < 0 || best(i, j) >= th ? 1 : 0), 0);
    // 激激甘: 許容量が広いと書き順を入れ替えても候補Aが通ってしまうので、ずれの合計で選ぶ（Bがはっきり近いときだけB）
    const total = m => m.reduce((n, i, j) => n + (i < 0 ? 1 : best(i, j)), 0);
    const map = lf && cand.length === 2 ? (total(cand[1]) < total(cand[0]) * .75 ? cand[1] : cand[0])
      : cand.reduce((a, b) => badCount(b) < badCount(a) ? b : a);   // 同数なら候補A（書いた順）を優先
    res.map = map;

    if (U.length !== T.length) res.reasons.push({ type: 'count', expected: T.length, got: U.length });
    // 形・向き
    const okIdx = [];
    map.forEach((i, j) => {
      if (i < 0) return;
      let st;
      if (best(i, j) >= th) { st = 'shape'; res.reasons.push({ type: 'shape', stroke: j }); }
      else if (lf ? CR0[i][j] + .04 < C0[i][j] && strokeLen(T[j]) > .12 : CR[i][j] < C[i][j] && C[i][j] >= th) { st = 'dir'; res.reasons.push({ type: 'dir', stroke: j }); }
      else { st = 'ok'; okIdx.push(j); }
      res.tmplStatus[j] = st; res.userStatus[i] = st;
      res.debug.push({ user: i + 1, tmpl: j + 1, cost: C[i][j], costRev: CR[i][j], status: st });
    });
    // 書き順（形が合っている画のうち、順番が前後しているもの）
    const mapped = map.map((i, j) => [i, j]).filter(([i]) => i >= 0);
    const ooo = outOfOrder(mapped.map(([i]) => i));
    const orderJs = mapped.filter((_, k) => ooo[k]).map(([, j]) => j);
    if (orderJs.length) {
      for (const j of orderJs) { if (res.tmplStatus[j] === 'ok') res.tmplStatus[j] = 'order'; if (res.userStatus[map[j]] === 'ok') res.userStatus[map[j]] = 'order'; }
      // 知らせるのは「最初に順番がずれた画」（例: 1画目と2画目を逆に書いたら 1画目）
      const firstOff = mapped.find(([i, j]) => i !== j && res.tmplStatus[j] !== 'shape');
      res.reasons.push({ type: 'order', stroke: U.length === T.length && firstOff ? firstOff[1] : Math.min(...orderJs) });
    }
    U.forEach((_, i) => { if (!res.userStatus[i]) res.userStatus[i] = 'extra'; });
    if (!lf) checkLengths(res, U, T, map);
    res.ok = !res.reasons.length;
    res.score = matchScore(user, tmplRaw, C0, map, U.length, T.length);
    res.debug.sort((a, b) => a.tmpl - b.tmpl);
    return withMsgs(res);
  }

  /* お手本との一致率（0〜100）。正誤とは別の「ゲーム用の点数」。
   * 形 85%: 各画のずれ（大きさ・位置をそろえた後）を点数化。書いていない画は0点、余分な画は割り引く
   * 配置 15%: マスの中での字の大きさ・位置がお手本に近いか
   * とめ・はね・はらいは含まない。 */
  // 実際の手書きで 70%前後に集まりすぎたため、ゆるめに調整（2026-10-04）
  //   ずれ SCORE_FULL 以下で満点、SCORE_ZERO で0点（SCORE_CURVE<1 にするとさらに高めに出る）
  //   目安: ていねい≈99 / ふつう≈90 / やや雑≈84 / 雑≈72（旧設定では 95 / 83 / 76 / 62）
  const SCORE_FULL = .025, SCORE_ZERO = .20, SCORE_CURVE = 1;
  function matchScore(user, tmplRaw, C, map, nU, nT) {
    const sims = map.map((i, j) => {
      if (i < 0) return 0;
      const d = Math.min(1, Math.max(0, (C[i][j] - SCORE_FULL) / (SCORE_ZERO - SCORE_FULL)));
      return 1 - Math.pow(d, 1 / SCORE_CURVE);
    });
    const shape = sims.reduce((a, b) => a + b, 0) / nT * Math.min(1, nT / Math.max(nU, 1));
    const u = bbox(user), t = bbox(tmplRaw);
    // 配置: 大きさは 0.7〜1.4倍、位置は 0.08 までのずれなら減点なし
    const sizePen = Math.min(1, Math.max(0, Math.abs(Math.log(Math.max(u.w, u.h, 1e-3) / Math.max(t.w, t.h))) - Math.log(1.4)) / Math.LN2);
    const posPen = Math.min(1, Math.max(0, Math.hypot(u.cx - t.cx, u.cy - t.cy) - .08) / .3);
    const place = 1 - (sizePen + posPen) / 2;
    return Math.round(100 * (.85 * shape + .15 * place));
  }

  // 土/士・未/末 のように「並んだ同じ向きの画の長短」で区別する字
  function checkLengths(res, U, T, map) {
    for (let a = 0; a < T.length; a++) for (let b = 0; b < T.length; b++) {
      const ua = map[a], ub = map[b];
      if (a === b || ua < 0 || ub < 0) continue;
      if (res.tmplStatus[a] === 'shape' || res.tmplStatus[b] === 'shape') continue;
      let da = Math.abs(strokeAng(T[a]) - strokeAng(T[b])); da = Math.min(da, 2 * Math.PI - da);
      if (da > .35 || overlap(T[a], T[b]) < .6) continue;
      if (strokeLen(T[a]) / strokeLen(T[b]) < 1.25) continue;
      if (strokeLen(U[ua]) / Math.max(strokeLen(U[ub]), 1e-3) < 1.0) {
        res.reasons.push({ type: 'length', stroke: a, other: b });
        for (const j of [a, b]) if (res.tmplStatus[j] === 'ok') { res.tmplStatus[j] = 'length'; res.userStatus[map[j]] = 'length'; }
      }
    }
  }

  function withMsgs(res) {
    let shapes = 0;
    const countWrong = res.reasons.some(r => r.type === 'count');
    res.msgs = res.reasons.flatMap(r => {
      if (countWrong && r.type !== 'count') return [];   // 画数がちがうときは、それだけ伝える
      switch (r.type) {
        case 'empty': return ['まだ書いていないよ'];
        case 'count': return [`画数がちがうよ（正しくは ${r.expected}画、書いたのは ${r.got}画）`];
        case 'shape': return ++shapes > MAX_SHAPE_MSGS ? [] : [`${r.stroke + 1}画目の形がちがうよ`];
        case 'dir': return [`${r.stroke + 1}画目の向きが反対だよ`];
        case 'order': return [`書き順がちがうよ（${r.stroke + 1}画目）`];
        case 'length': return [`${r.stroke + 1}画目は ${r.other + 1}画目より長く書こう`];
      }
      return [];
    });
    return res;
  }

  // 熟語: cells[k] = k番目の漢字マスの線、tmpls[k] = その字のお手本中心線
  function judgeWord(cells, tmpls, opt) {
    const chars = tmpls.map((t, k) => judgeChar(cells[k] || [], t, opt));
    return { ok: chars.every(c => c.ok), chars, score: Math.round(chars.reduce((a, c) => a + c.score, 0) / (chars.length || 1)) };
  }

  window.KanjiJudge = { judgeChar, judgeWord, LEVELS, resample };
})();
