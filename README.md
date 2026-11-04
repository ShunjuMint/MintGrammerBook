# MintGrammerBook

人工言語「Tum Rare」の文法書サイト。MintDicに近いデザインで作成したGitHub Pages用の独立サイトです。

## 文法項目の編集

`data/grammar.json` を編集します。配列の各項目が文法ページです。

- `id`: 一意の固定ID（ページへのリンクに使用）
- `chapter`: 左側目次に表示する章
- `title`: 項目名
- `summary`: 概要
- `tags`: タグ配列
- `sections`: `title`, `paragraphs`（文章の配列）, `examples`（例文の配列）
- `examples`: `text`（原文）, `segmented`（形態素分解）, `gloss`（グロス）, `translation`（訳）
- `related`: 関連ページのIDの配列

章や項目は配列の順序で表示されます。現在の項目は機能確認用の仮データです。

## プレビュー

リポジトリ直下で `python -m http.server 8000` を実行し、`http://localhost:8000/` を開きます。HTMLを直接開くとJSONの読み込みに失敗します。

## 公開

GitHubで Settings → Pages → Build and deployment → Source に **GitHub Actions** を指定します。以後mainへのpushで公開されます。

MintDic側のREADMEおよび既存ファイルは変更しません。
