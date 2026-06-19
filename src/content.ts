export const stats = [
  { value: '14日', label: '初回検証までの目標リードタイム' },
  { value: '3本', label: '初期GTMモーション' },
  { value: '7件', label: '営業現場で追う主要シグナル' },
];

export const segments = [
  {
    title: 'Founder-led Sales',
    description:
      '代表・事業責任者が商談仮説、提案ストーリー、勝ち筋を高速に検証する初期市場開拓。',
  },
  {
    title: 'AI Team Enablement',
    description:
      'Cursor と AI エージェントを使い、営業資料、調査、提案、フォローを標準化する運用設計。',
  },
  {
    title: 'Partner Motion',
    description:
      '導入支援会社や業界ネットワークを活用し、紹介からPoCまでの再現性を高める協業導線。',
  },
];

export const workflow = [
  {
    step: '01',
    title: 'ターゲット仮説を作る',
    body: '業界、部門、課題、予算タイミングを整理し、営業が最初に聞くべき問いへ落とし込みます。',
  },
  {
    step: '02',
    title: '商談前リサーチを束ねる',
    body: '企業情報、公開ニュース、過去接点、想定課題をカード化して、初回接触の精度を上げます。',
  },
  {
    step: '03',
    title: '提案ストーリーを組む',
    body: '顧客の現状、理想、障害、次の一手を一枚にまとめ、AI が資料・メール・議事録へ展開します。',
  },
  {
    step: '04',
    title: '勝ちパターンを更新する',
    body: '失注理由、反応が良かった切り口、導入障壁を蓄積し、プレイブックを毎週更新します。',
  },
];

export const signals = [
  '営業仮説の鮮度',
  '初回返信率',
  '課題一致度',
  'PoC移行率',
  '意思決定者接触',
  '提案後フォロー速度',
  '失注理由の学習量',
];

export const roadmap = [
  {
    title: 'Prototype',
    items: ['静的LP', 'GTMメッセージ', '営業ワークフロー', 'Netlify配信'],
  },
  {
    title: 'Pilot',
    items: ['企業リサーチ入力', '提案テンプレート', '議事録サマリー', 'Slack/Notion連携'],
  },
  {
    title: 'Scale',
    items: ['CRM連携', '勝ち筋分析', 'チーム別プレイブック', '権限管理'],
  },
];

export const accountPlays = [
  {
    company: '株式会社サンプルテック',
    segment: 'B2B SaaS / Sales Ops',
    score: '92',
    hypothesis:
      '営業企画が AI 活用を進めたいが、現場に展開する型と週次の改善ループが不足している。',
    question: '提案準備や商談後フォローで、いま一番ばらついている工程はどこですか？',
    nextAction: '15分の業務棚卸しを提案し、PoC の成功条件を合意する。',
    email:
      '営業準備の標準化と失注理由の学習ループを、既存の商談運用を崩さずに2週間で検証する進め方をご提案したいです。',
  },
  {
    company: '東都ロジスティクス',
    segment: 'Logistics / DX',
    score: '84',
    hypothesis:
      '拠点ごとの営業資料と提案品質に差があり、優秀な担当者の勝ち筋が共有資産になっていない。',
    question: '受注率が高い担当者の提案準備は、チーム内でどこまで再利用されていますか？',
    nextAction: '成功商談の型を1件分分解し、拠点横断の提案テンプレートへ変換する。',
    email:
      '拠点ごとの営業ノウハウを Tact 上で整理し、提案資料と初回商談アジェンダに即展開する小さな検証から始められます。',
  },
  {
    company: 'Northstar HR',
    segment: 'HR Tech / Enterprise',
    score: '78',
    hypothesis:
      '大手商談で関係者が増え、意思決定者ごとの関心と反論を追い切れず提案後の停滞が起きている。',
    question: '提案後に止まる案件では、誰の懸念が最後まで残ることが多いですか？',
    nextAction: '関係者別の懸念メモとフォロー文面を生成し、次回商談の合意事項を明確にする。',
    email:
      '複数関係者がいる商談で、部門ごとの懸念・合意・次アクションを1枚に集約する Tact の使い方をご紹介します。',
  },
];
