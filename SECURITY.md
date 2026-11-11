# 公開プレビューのセキュリティ運用

対象は架空サンプルの静的プレビューです。ブラウザへ外部依存や通信処理を追加せず、実データは公開リポジトリへ入れません。

## 自動チェック

| タイミング | 内容 |
|---|---|
| push・PR | `Verify` がデータ検証、生成物の一致、セキュリティ・プライバシーの回帰テストを実行 |
| main への push・PRと週次 | GitHub 標準設定の CodeQL が JavaScript と GitHub Actions を解析。結果は Security → Code scanning に表示 |
| 毎週月曜 10:23 JST・Pages デプロイ成功後・手動実行 | `Published Security` が回帰テストと、HTTPS・HTTP 200・公開 HTML の一致・CSP を確認 |
| 毎月1日 10:23 JST | Dependabot が公式 GitHub Actions の更新を確認し、1件のグループ PR にまとめる。自動マージはしない |
| push時・GitHub側でのスキャン | GitHub の secret scanning と push protection で認証情報の混入を検出 |

CodeQL はリポジトリ設定で有効化するため、別の CodeQL YAML は置きません。標準クエリを使い、検出結果の確認先を Security タブに集約します。

`Published Security` は最後に成功した `Deploy Pages` のコミットにある `index.html` と公開内容を比較します。未デプロイの main と比較しないため、更新直後の不要な警告を減らせます。リダイレクトを追わず、一時的なネットワーク障害や CDN 反映待ちは最大4回まで再試行します。GitHub Actions 内の読み取り専用トークンを使い、追加の認証情報や外部監視サービスは不要です。公開 HTML を CI ログへ出力しません。

チェックには公開リポジトリ向けの標準 `ubuntu-latest` runner を使用します。検査用 artifact や cache は保存せず、Pages の配布 artifact は1日だけ保持します。公式 Actions は完全なコミット SHA に固定し、Dependabot で更新します。npm 依存がないため `npm audit` の定期実行は追加しません。

## 通知と月次確認

- GitHub の個人設定 → Notifications → Actions で `Only notify for failed workflows` を選ぶと成功通知を抑えられます。これはアカウント全体の設定であり、リポジトリの workflow では変更できません。
- 月1回、Actions で `Published Security` と CodeQL の最終成功日時、Security タブの未解決警告、Dependabot の更新 PR を確認します。Node.js の LTS サポート状況も確認してください。
- 更新 PR は CI の成功と差分を確認してからマージします。CodeQL の正常終了は「脆弱性ゼロ」を意味しないため、Security タブの結果も確認します。
- 公開内容の不一致は、意図した Pages デプロイと公開内容を確認して対処します。通信障害だけなら復旧後に `Published Security` を手動実行できます。検出だけで自動公開停止や自動マージは行いません。

GitHub の通常の定期 workflow は60日間リポジトリに活動がないと自動停止します。止まった場合は Actions から再有効化してください。CodeQL 標準設定の週次解析は、有効化後の push または PR による解析を起点とし、対象の活動が180日間ないと止まります。無期限の無人監視を保証する構成ではありません。スケジュールは GitHub 側の混雑で遅れることもあります。

## 検出できる範囲

自動テストや CodeQL は未知の脆弱性、すべての個人情報、GitHub アカウントの侵害を完全には検出しません。公開前にサンプルが架空であることを確認してください。公開 HTML の CSP は meta 方式のため、外部サイトによるフレーム埋め込みの制限は対象外です。

参考: [Actions の無料枠](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[定期実行の制限](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[CodeQL 標準設定](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types)、[通知設定](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)。
