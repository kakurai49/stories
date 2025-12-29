# 実験計画: テンプレート実験計画

ストーリーテンプレート全体でエンゲージメントと完読パフォーマンスを比較する実験。

## hina – Hina Story

新規訪問者向けに調整された、AI ホストのペルソナナラティブ。

### 指標
- **completion_rate**: Hina の最終カードに到達したセッションの割合。 | 目標: コントロールより完了数を増やす。
- **avg_dwell_time**: Hina ストーリーページでの平均滞在秒数。 | 目標: ナラティブ主導セッションの滞在時間を向上。

### イベント
- **story_load**
  - 発生タイミング: Hina ストーリーページが表示されたとき。
  - プロパティ: story_id, template, traffic_source
- **story_complete**
  - 発生タイミング: ユーザーが Hina のナラティブを完了したとき。
  - プロパティ: story_id, template, duration_seconds

## immersive – Immersive Panel

エンゲージ度の高いユーザー向けのスワイプ可能な没入型リーディングフロー。

### 指標
- **scroll_depth**: 没入型パネル全体の中央値スクロール深度。 | 目標: 中央値 75% まで到達。
- **interaction_rate**: スワイプやタップ操作に参加したユーザーの割合。 | 目標: セッションごとのジェスチャー操作率を改善。

### イベント
- **panel_swipe**
  - 発生タイミング: 没入型パネル間の各スワイプ時。
  - プロパティ: story_id, panel_index, direction, template
- **cta_click**
  - 発生タイミング: 没入型 CTA がクリックされたとき。
  - プロパティ: story_id, cta_destination, template

## magazine – Magazine Layout

複数記事を閲覧するユーザー向けの編集レイアウト。

### 指標
- **article_click_through**: マガジングリッドから記事へのクリック率。 | 目標: 従来リストと比較して CTR を向上。
- **session_pages_viewed**: セッションあたりに開かれた記事数の平均。 | 目標: 1 セッション 2.0 記事以上。

### イベント
- **grid_impression**
  - 発生タイミング: マガジングリッドが読み込まれたとき。
  - プロパティ: section, template, story_count
- **article_open**
  - 発生タイミング: ユーザーがグリッドから記事を開いたとき。
  - プロパティ: story_id, position, template
