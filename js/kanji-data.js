/* 漢字の字形・書き順データ（animCJK graphicsJa）の読み込み
 * data/ja-index.js と学年別ファイル（data/ja-*.js）を必要なときだけ <script> で読む（file:// でも動く）。
 * 座標: animCJK は 1024 四方・y 上向き（基準線 900）。lines は 0..1・y 下向きに変換した中心線。 */
(function () {
  'use strict';
  const HWJA = {
    base: 'data/', data: {}, idx: {}, loading: {},
    add(d) { Object.assign(this.data, d); },
    index(m) { for (const [f, cs] of Object.entries(m)) for (const c of cs) this.idx[c] = f; },
    script(src) {
      return this.loading[src] ||= new Promise((ok, ng) => {
        const s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = () => { delete this.loading[src]; ng(new Error('load ' + src)); };
        document.head.appendChild(s);
      });
    },
    ensureIndex() { return this.script(this.base + 'ja-index.js'); },
    async has(ch) { await this.ensureIndex(); return !!(this.data[ch] || this.idx[ch]); },
    // { ch, strokes: SVGパス文字列[], medians: 元データ, lines: [[{x,y}]] } / データが無ければ null
    async get(ch) {
      if (!this.data[ch]) {
        await this.ensureIndex();
        const f = this.idx[ch];
        if (!f) return null;
        await this.script(`${this.base}${f}.js`);
        if (!this.data[ch]) return null;
      }
      const d = this.data[ch];
      if (!d.lines) d.lines = d.medians.map(m => m.map(([x, y]) => ({ x: x / 1024, y: (900 - y) / 1024 })));
      return { ch, strokes: d.strokes, medians: d.medians, lines: d.lines };
    },
  };
  const isKanji = ch => /\p{Script=Han}/u.test(ch) || ch === '々';
  // 「確かめる」→ [{type:'kanji',ch:'確'},{type:'kana',text:'かめる'}]
  function parseWord(word) {
    const segs = [];
    for (const ch of word) {
      if (isKanji(ch)) segs.push({ type: 'kanji', ch });
      else if (segs.length && segs[segs.length - 1].type === 'kana') segs[segs.length - 1].text += ch;
      else segs.push({ type: 'kana', text: ch });
    }
    return segs;
  }
  window.HWJA = HWJA;
  window.KanjiData = { HWJA, isKanji, parseWord, get: ch => HWJA.get(ch), has: ch => HWJA.has(ch) };
})();
