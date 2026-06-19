import { useState } from 'react';
import { accountPlays, roadmap, segments, signals, stats, workflow } from './content';

function App() {
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
  const selectedAccount = accountPlays[selectedAccountIndex];

  return (
    <main>
      <header className="site-header" aria-label="Tact navigation">
        <a className="brand" href="#top" aria-label="Tact home">
          <span className="brand-mark">T</span>
          <span>Tact</span>
        </a>
        <nav>
          <a href="#motion">GTM</a>
          <a href="#workflow">Workflow</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <a className="header-cta" href="#contact">
          Pilot plan
        </a>
      </header>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AI Team GTM Prototype</p>
          <h1>営業戦略を、毎日の実行に変える。</h1>
          <p className="hero-lead">
            Tact は、ターゲット仮説、商談準備、提案、学習ループをひとつに束ねる
            GTM オペレーティングボードです。Cursor と AI エージェントで、営業の
            勝ちパターンを素早く作り込みます。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#workflow">
              体験を見る
            </a>
            <a className="secondary-button" href="#motion">
              営業戦略を確認
            </a>
          </div>
        </div>

        <aside className="hero-panel" aria-label="Tact execution board preview">
          <div className="panel-topline">
            <span>Execution Board</span>
            <strong>Live</strong>
          </div>
          <div className="signal-card active">
            <span>Target</span>
            <strong>AI導入を急ぐB2B組織</strong>
            <p>意思決定者の課題と現場の運用負荷を同時に捉える。</p>
          </div>
          <div className="signal-grid">
            {signals.slice(0, 4).map((signal) => (
              <span key={signal}>{signal}</span>
            ))}
          </div>
          <div className="momentum">
            <span>Next action</span>
            <strong>初回商談の仮説メールを生成</strong>
          </div>
        </aside>
      </section>

      <section className="stats section-shell" aria-label="Prototype metrics">
        {stats.map((stat) => (
          <div className="stat" key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>

      <section className="section-shell split-section" id="motion">
        <div>
          <p className="eyebrow">GTM Motion</p>
          <h2>最初の市場検証に必要な営業モーションを、少数に絞る。</h2>
        </div>
        <div className="cards">
          {segments.map((segment) => (
            <article className="card" key={segment.title}>
              <h3>{segment.title}</h3>
              <p>{segment.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell workflow-section" id="workflow">
        <div className="section-heading">
          <p className="eyebrow">Sales Workflow</p>
          <h2>営業担当が毎日使える、4ステップの実行画面。</h2>
          <p>
            戦略資料で終わらせず、商談前後の行動へつなげることを最優先にした
            プロトタイプです。
          </p>
        </div>
        <div className="workflow-list">
          {workflow.map((item) => (
            <article className="workflow-item" key={item.step}>
              <span>{item.step}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell workspace-demo" aria-label="Interactive Tact workspace">
        <div className="section-heading">
          <p className="eyebrow">Interactive Prototype</p>
          <h2>ターゲットを選ぶと、商談準備がその場で切り替わる。</h2>
          <p>
            営業担当が朝の準備で見る画面を想定し、AI が扱うべき仮説、問い、
            次アクション、メール下書きを一画面にまとめています。
          </p>
        </div>
        <div className="workspace-grid">
          <div className="account-list" role="list" aria-label="Target accounts">
            {accountPlays.map((account, index) => (
              <button
                className={index === selectedAccountIndex ? 'account-button selected' : 'account-button'}
                key={account.company}
                onClick={() => setSelectedAccountIndex(index)}
                type="button"
              >
                <span>{account.segment}</span>
                <strong>{account.company}</strong>
                <small>Fit score {account.score}</small>
              </button>
            ))}
          </div>
          <article className="workspace-panel">
            <div className="workspace-panel-header">
              <div>
                <span className="mini-label">Selected account</span>
                <h3>{selectedAccount.company}</h3>
              </div>
              <strong>{selectedAccount.score}</strong>
            </div>
            <div className="insight-grid">
              <div>
                <span>仮説</span>
                <p>{selectedAccount.hypothesis}</p>
              </div>
              <div>
                <span>初回で聞く問い</span>
                <p>{selectedAccount.question}</p>
              </div>
              <div>
                <span>次の一手</span>
                <p>{selectedAccount.nextAction}</p>
              </div>
            </div>
            <div className="email-draft">
              <span>AI email draft</span>
              <p>{selectedAccount.email}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="section-shell product-preview" aria-label="Product preview">
        <div className="preview-card large">
          <p className="eyebrow">Today&apos;s Account</p>
          <h2>株式会社サンプルテック</h2>
          <dl>
            <div>
              <dt>仮説</dt>
              <dd>営業企画が AI 活用を進めたいが、現場展開の型が不足している。</dd>
            </div>
            <div>
              <dt>刺さる切り口</dt>
              <dd>提案準備の標準化と、失注理由を学習する週次レビュー。</dd>
            </div>
            <div>
              <dt>次の一手</dt>
              <dd>15分の業務棚卸しを提案し、PoC の成功条件を合意する。</dd>
            </div>
          </dl>
        </div>
        <div className="preview-column">
          <div className="preview-card">
            <span className="mini-label">AI Draft</span>
            <p>初回メール、商談アジェンダ、提案骨子を同じ仮説から生成。</p>
          </div>
          <div className="preview-card">
            <span className="mini-label">Learning Loop</span>
            <p>勝ち筋と失注理由を営業チームのプレイブックへ戻す。</p>
          </div>
        </div>
      </section>

      <section className="section-shell roadmap-section" id="roadmap">
        <div className="section-heading">
          <p className="eyebrow">Cursor Build Plan</p>
          <h2>Netlify 配信から、CRM 連携まで拡張できる設計。</h2>
        </div>
        <div className="roadmap">
          {roadmap.map((phase) => (
            <article className="roadmap-card" key={phase.title}>
              <h3>{phase.title}</h3>
              <ul>
                {phase.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="cta section-shell" id="contact">
        <p className="eyebrow">Next Sprint</p>
        <h2>Obsidian の戦略メモを受け取ったら、文言と機能優先度を即反映できます。</h2>
        <p>
          まずは LP と営業ストーリーを公開し、反応の良い訴求から入力フォーム、
          CRM 連携、AI 生成機能へ広げます。
        </p>
        <a className="primary-button" href="mailto:hello@example.com?subject=Tact%20Pilot">
          Pilot を相談する
        </a>
      </section>
    </main>
  );
}

export default App;
