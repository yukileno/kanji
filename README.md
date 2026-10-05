# 漢字チャレンジ

小学生向けの漢字書き取り練習ウェブアプリ。Chromebook（16:9）＋タッチペンでの利用を想定しています。

- 公開URL: https://yukileno.github.io/kanji/
- 単元ごとに かんたん／ふつう／むずかしい の3コース。全問正解でクリア（1問でも まちがえたら そこで おわり）。クリアしたコースの数で称号が上がる。
- 判定: 形（画数・書き順・向き・だいたいの形）は全コース共通の「激激甘」。そのうえで ふつうは一致率65%以上、むずかしいは75%以上で⭕。
- `sensei.html` … 先生用の判定確認ページ（同じ字をコースごとに⭕❌で確認できる）
- 記録は端末のブラウザ（localStorage）に保存されます。

## ファイル

- `index.html` … アプリ本体
- `js/judge.js` … 書き終わってからの正誤判定（画数・形・向き・書き順・長さ関係）と一致率
- `js/pad.js` … ペンで書く枠
- `js/kanji-data.js` … 字形・書き順データの読み込み
- `js/fx.js` … 演出（光・花火・紙吹雪など）
- `js/sound.js` … 効果音（Web Audio API で合成）
- `assets/` … 背景・単元イラスト・バッジ・称号エンブレムの画像
- `data/tests-g5-t2.js` … 出題データ
- `data/ja-*.js` … 字形・書き順データ

## 使用しているデータ

- 字形・書き順データ（`data/ja-*.js`）: [animCJK](https://github.com/parsimonhi/animCJK) の `graphicsJa.txt` を学年別に分割したもの。
  Arphic Public License に従って再配布しています（`data/licenses/` を参照）。
