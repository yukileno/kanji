/* 一致率のゲーム要素
 * - 点数（一致率）が付くのは ⭕ のときだけ（❌ に点数を出すと「間違いは❌」がぼやけるため）
 * - お手本・書き順アニメを見たあとの書字は「練習」扱いで点数なし（なぞりで稼がせない。検索練習を優先）
 * - メダル: 90%以上 金 / 80%以上 銀 / それ未満 銅
 * - 熟語ごとに自己ベストと直近の記録を保存（localStorage） */
(function () {
  'use strict';
  const KEY = 'kanjiScore.v1';
  const RANKS = [
    { id: 'gold', min: 90, emoji: '🥇', label: '金のはなまる' },
    { id: 'silver', min: 80, emoji: '🥈', label: '銀のはなまる' },
    { id: 'bronze', min: 0, emoji: '🥉', label: '銅のはなまる' },
  ];
  const HISTORY = 10;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { words: {} }; } catch (e) { return { words: {} }; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  const rank = score => RANKS.find(r => score >= r.min);

  // 判定結果を記録する。戻り値で画面に出す内容を決める
  // opt.assisted: この語でお手本・アニメを見たか
  function record(word, result, opt = {}) {
    if (!result.ok) return { counted: false, reason: 'ng' };
    if (opt.assisted) return { counted: false, reason: 'assisted', score: result.score };
    const d = load(), w = d.words[word] || (d.words[word] = { best: 0, medals: { gold: 0, silver: 0, bronze: 0 }, hist: [] });
    const prevBest = w.best, r = rank(result.score);
    w.best = Math.max(w.best, result.score);
    w.medals[r.id]++;
    w.hist.push({ s: result.score, t: Date.now() }); if (w.hist.length > HISTORY) w.hist.shift();
    save(d);
    return { counted: true, score: result.score, rank: r, best: w.best, prevBest, newBest: result.score > prevBest && prevBest > 0, first: prevBest === 0 };
  }
  const best = word => (load().words[word] || {}).best || 0;
  // 全体のメダル数（ホーム画面などで使う）
  function totals() {
    const t = { gold: 0, silver: 0, bronze: 0 };
    for (const w of Object.values(load().words)) for (const k in t) t[k] += w.medals[k] || 0;
    return t;
  }
  function reset() { save({ words: {} }); }

  window.ScoreGame = { record, best, totals, rank, reset, RANKS };
})();
