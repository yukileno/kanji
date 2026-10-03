# かんじドリル

小学生向けの漢字書き取り練習ウェブアプリ（開発中）。タブレット＋ペンでの利用を想定しています。

- `index.html` … かんじドリル フィーバー（現行版）
- `practice.html` … 漢字テスト練習（単元ごと／全単元シャッフル、書き終わり判定、一致率メダル）
- `m1-test.html` … 書き終わり判定のテストページ（書き順・向き・形・画数・長さ関係を判定、一致率メダル・自己ベスト、書き順アニメ）
- `judge-proto.html` / `judge-proto2.html` … 判定方式の試作

## 使用しているデータ・ライブラリ

- 字形・書き順データ（`data/ja-*.js`）: [animCJK](https://github.com/parsimonhi/animCJK) の `graphicsJa.txt` を学年別に分割したもの。
  Arphic Public License に従って再配布しています（`data/licenses/` を参照）。
- [Hanzi Writer](https://github.com/chanind/hanzi-writer)（MIT License）… `judge-proto2.html` で使用
- [KanjiVG](https://kanjivg.tagaini.net/)（CC BY-SA 3.0）… `judge-proto.html` で使用
