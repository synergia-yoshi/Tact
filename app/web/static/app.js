const viewTitles = {
  home: "ホーム",
  campaigns: "キャンペーン",
  tasks: "タスク",
  creative: "クリエイティブ",
  audit: "監査",
  settings: "設定",
};

const modalCopy = {
  evidence: {
    title: "根拠を見る",
    body: `
      <p>この画面はサーバー接続前の下書き状態です。接続後は生成結果と媒体配分の根拠をサーバーから取得して表示します。</p>
      <div class="reason-box"><strong>信頼モデル</strong><p>publish、予算変更、実停止は承認制。予測値は幅と信頼度を併記し、実測とは混同させません。</p></div>
    `,
  },
  creative: {
    title: "クリエイティブ根拠",
    body: `
      <p>コピー、媒体、バナーはreferenceの見た目を踏襲した下書きです。接続後は生成結果、媒体配分、法務チェック結果を表示します。</p>
      <div class="reason-box"><strong>表示ルール</strong><p>配信前の数値はすべて「予測 / シミュレーション」として扱います。</p></div>
    `,
  },
};

function setView(view) {
  document.querySelectorAll(".view").forEach((element) => {
    element.classList.toggle("active", element.id === `view-${view}`);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  document.getElementById("page-title").textContent = viewTitles[view] || "Tact";
}

function openModal(key) {
  const modal = document.getElementById("evidence-modal");
  const title = document.getElementById("modal-title");
  const body = document.getElementById("modal-body");
  const copy = modalCopy[key] || modalCopy.evidence;
  title.textContent = copy.title;
  body.innerHTML = copy.body;
  modal.showModal();
}

function closeModal() {
  document.getElementById("evidence-modal").close();
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

document.querySelectorAll("[data-open-modal]").forEach((button) => {
  button.addEventListener("click", () => openModal(button.dataset.openModal));
});

document.querySelector("[data-close-modal]").addEventListener("click", closeModal);

document.getElementById("evidence-modal").addEventListener("click", (event) => {
  if (event.target.id === "evidence-modal") {
    closeModal();
  }
});

document.getElementById("budget-range").addEventListener("input", (event) => {
  const value = Number(event.target.value) * 10000;
  document.getElementById("budget-value").textContent = `¥${value.toLocaleString("ja-JP")}`;
});

document.querySelectorAll(".chip, .goal-pill, .choice-card").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.parentElement;
    group.querySelectorAll(".selected").forEach((selected) => selected.classList.remove("selected"));
    button.classList.add("selected");
  });
});
