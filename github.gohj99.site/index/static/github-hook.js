(() => {
  // Content-blocking starter list. Keep entries specific to reduce false positives.
  // This is a site policy configuration, not an exhaustive or official legal list.
  const BLOCKED_TERMS = {
    nationalSecurity: [
      "8964",
      "六四事件",
      "六四天安门",
      "天安门事件",
      "天安门屠杀",
      "六四屠杀",
      "白纸革命",
      "白纸运动",
      "白纸抗议",
      "习近平",
      "习禁评",
      "习包子",
      "法轮功",
      "法輪功",
      "法轮大法",
      "法輪大法",
      "falun gong",
      "falun dafa",
      "tiananmen massacre",
      "tiananmen square protests",
      "xi jinping",
      "时政",
      "政治新闻",
      "国内新闻",
      "国际新闻",
      "新闻时事",
      "新闻评论",
      "政治评论",
      "政治敏感",
      "维权",
      "抗议活动",
      "社会事件",
      "government news",
      "political news",
      "current affairs",
      "共产党下台",
      "推翻共产党",
      "煽动颠覆国家政权",
      "煽动分裂国家",
      "宣扬恐怖主义",
      "宣扬极端主义",
      "恐怖主义招募",
      "暴恐视频",
      "terrorist propaganda",
      "terrorist recruitment",
    ],
    sexualContent: [
      "儿童色情",
      "未成年人色情",
      "幼女色情",
      "成人视频下载",
      "色情直播",
      "招嫖",
      "招妓",
      "卖淫",
      "卖淫嫖娼",
      "嫖娼",
      "援交",
      "色情服务",
      "上门服务",
      "同城约炮",
      "裸聊",
      " prostitution ",
      "prostitute for hire",
      "escort service",
      "卖淫服务",
      "嫖娼服务",
      "child pornography",
      "child sexual abuse material",
    ],
    gambling: [
      "网络赌博",
      "赌博网站",
      "博彩平台",
      "线上赌场",
      "赌博代理",
      "代充博彩",
      "online gambling platform",
      "online casino agent",
    ],
    drugsAndWeapons: [
      "毒品交易",
      "冰毒出售",
      "海洛因出售",
      "制毒教程",
      "枪支买卖",
      "枪支出售",
      "爆炸物制作教程",
      "自制炸弹教程",
      "buy heroin",
      "meth for sale",
      "guns for sale",
      "how to make a bomb",
    ],
    fraudAndIllegalTrade: [
      "电信诈骗教程",
      "洗钱服务",
      "跑分平台",
      "银行卡四件套",
      "盗刷教程",
      "买卖身份证",
      "假证办理",
      "代开假发票",
      "出售公民信息",
      "个人信息买卖",
      "勒索软件出售",
      "恶意软件出售",
      "stolen credit cards for sale",
      "ransomware for sale",
      "money laundering service",
    ],
  };

  // Exact repository denylist. An empty repo blocks the user's entire
  // namespace; a non-empty repo requires a complete repository-name match.
  const BLOCKED_REPOSITORIES = [
    { user: "bannedbook", repo: "" },
    { user: "htcc", repo: "" },
  ];

  const normalizeText = (value) => {
    const text = String(value || "");

    try {
      const separators = new RegExp("[\\s\\p{P}\\p{S}]+", "gu");

      return text
        .normalize("NFKC")
        .toLowerCase()
        .replace(separators, "");
    } catch (_) {
      // Older browsers may not support Unicode property escapes. Keep a
      // conservative fallback that also removes common punctuation/symbols,
      // whitespace and zero-width characters before matching.
      return text
        .normalize ? text.normalize("NFKC").toLowerCase().replace(/[\s\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\ufeff.,!?;:'"`~@#$%^&*()_+=[\]{}\\|<>/\-]+/g, "")
          : text.toLowerCase().replace(/[\s\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\ufeff.,!?;:'"`~@#$%^&*()_+=[\]{}\\|<>/\-]+/g, "");
    }
  };

  const normalizedBlockedTerms = Object.keys(BLOCKED_TERMS)
    .reduce((terms, category) => terms.concat(BLOCKED_TERMS[category]), [])
    .map((term) => ({ original: term, normalized: normalizeText(term) }));

  let blocked = false;
  let scanTimer = null;

  const getPageText = () => {
    const description = document.querySelector('meta[name="description"]');

    return [
      // Include the complete current URL so disallowed terms in repository
      // paths, query parameters or fragments are also checked.
      window.location ? window.location.href : "",
      (() => {
        if (!window.location) return "";
        try {
          return decodeURIComponent(window.location.href);
        } catch (_) {
          return "";
        }
      })(),
      document.title,
      description ? description.content : "",
      document.body ? document.body.innerText : "",
    ].join("\n");
  };

  const isBlockedRepositoryUrl = () => {
    if (!window.location || !BLOCKED_REPOSITORIES.length) return false;

    let url;
    try {
      url = new URL(window.location.href);
    } catch (_) {
      return false;
    }

    if (url.hostname.toLowerCase() !== "github.gohj99.site") return false;

    const segments = url.pathname.split("/").filter(Boolean);
    if (!segments.length) return false;

    const user = decodeURIComponent(segments[0]).toLowerCase();

    return BLOCKED_REPOSITORIES.some((entry) => {
      if (!entry || String(entry.user).toLowerCase() !== user) return false;

      const blockedRepo = String(entry.repo || "").replace(/\.git$/i, "").toLowerCase();
      if (!blockedRepo) return true;
      if (segments.length < 2) return false;

      const repo = decodeURIComponent(segments[1]).replace(/\.git$/i, "").toLowerCase();
      return blockedRepo === repo;
    });
  };

  const blockPage = (matchedTerm) => {
    if (blocked) return;
    blocked = true;

    // Keep the in-page overlay as the immediate response, then move to the
    // standalone local page. This prevents a visible gap while redirecting.
    const blockedPageUrl = "/static/content-blocked.html";
    const shouldRedirect = window.location && window.location.pathname !== blockedPageUrl;

    const host = document.createElement("div");
    host.id = "github-proxy-content-blocked";
    host.tabIndex = -1;
    host.setAttribute("role", "alert");
    host.setAttribute("aria-live", "assertive");
    host.style.cssText = [
      "all:initial",
      "position:fixed!important",
      "inset:0!important",
      "z-index:2147483647!important",
      "display:block!important",
    ].join(";");

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: light; }
        .page {
          box-sizing: border-box;
          width: 100vw;
          height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          overflow: hidden;
          background: #f6f8fa;
          color: #1f2328;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .message { width: min(520px, 100%); text-align: center; }
        .icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 20px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #cf222e;
          color: #fff;
          font: 700 28px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        h1 { margin: 0 0 12px; font-size: 24px; line-height: 1.35; font-weight: 600; }
        p { margin: 0; color: #59636e; font-size: 15px; line-height: 1.7; }
      </style>
      <main class="page">
        <section class="message">
          <div class="icon" aria-hidden="true">!</div>
          <h1>此页面无法访问</h1>
          <p>页面内容不符合本站内容安全规则。</p>
        </section>
      </main>
    `;

    document.documentElement.style.setProperty("overflow", "hidden", "important");
    document.body.style.setProperty("overflow", "hidden", "important");
    document.body.appendChild(host);
    host.focus();

    const stopInteraction = (event) => {
      if (!host.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    [
      "click",
      "dblclick",
      "contextmenu",
      "keydown",
      "submit",
      "touchstart",
      "touchmove",
      "wheel",
      "dragstart",
    ].forEach(
      (eventName) => document.addEventListener(eventName, stopInteraction, true),
    );

    console.warn("[GitHub Proxy] Page blocked by content policy:", matchedTerm);

    if (shouldRedirect) {
      window.setTimeout(() => window.location.replace(blockedPageUrl), 0);
    }
  };

  const scanPage = () => {
    if (blocked || !document.body) return;

    if (isBlockedRepositoryUrl()) {
      blockPage("blocked repository");
      return;
    }

    const pageText = normalizeText(getPageText());
    const match = normalizedBlockedTerms.find(
      (term) => term.normalized && pageText.includes(term.normalized),
    );

    if (match) blockPage(match.original);
  };

  const scheduleScan = () => {
    if (blocked) return;
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanPage, 250);
  };

  const startContentGuard = () => {
    scanPage();

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    ["popstate", "hashchange", "pjax:end", "turbo:load"].forEach((eventName) => {
      window.addEventListener(eventName, scheduleScan);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startContentGuard, { once: true });
  } else {
    startContentGuard();
  }

  // microsoft clarity
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "yi86qtfbfq");
})();
