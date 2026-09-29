// ───────────────────── Theme toggle ─────────────────────
// Three states: light · system · dark. "system" follows prefers-color-scheme.
(() => {
  const group = document.getElementById("theme-toggle");
  if (!group) return;
  const radios = [...group.querySelectorAll('[role="radio"]')];
  const META = { light: "#f5f7fa", dark: "#1e293b" };
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const originals = metas.map((m) => m.content);

  function apply(mode, save) {
    const root = document.documentElement;
    if (mode === "system") delete root.dataset.theme; else root.dataset.theme = mode;
    metas.forEach((m, i) => (m.content = mode === "system" ? originals[i] : META[mode]));
    group.dataset.mode = mode;
    radios.forEach((r) => {
      const on = r.dataset.mode === mode;
      r.setAttribute("aria-checked", String(on));
      r.tabIndex = on ? 0 : -1;
    });
    if (save) try { mode === "system" ? localStorage.removeItem("cardea-theme") : localStorage.setItem("cardea-theme", mode); } catch {}
  }

  let initial = "system";
  try { initial = localStorage.getItem("cardea-theme") || "system"; } catch {}
  apply(["light", "system", "dark"].includes(initial) ? initial : "system", false);

  group.addEventListener("click", (e) => {
    const r = e.target.closest('[role="radio"]');
    if (r) apply(r.dataset.mode, true);
  });
  group.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = radios.findIndex((r) => r.getAttribute("aria-checked") === "true");
    const next = radios[(i + step + radios.length) % radios.length];
    apply(next.dataset.mode, true);
    next.focus();
  });
})();

// Tabs: HTMX loads the panel; this keeps aria-selected in sync.
document.addEventListener("htmx:beforeRequest", (e) => {
  const tab = e.detail.elt;
  if (tab.getAttribute("role") !== "tab") return;
  tab.closest('[role="tablist"]')
    .querySelectorAll('[role="tab"]')
    .forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ───────────────────── Hero: how-it-works flow ─────────────────────
// Calls travel agent → gateway → provider; responses come back.
// A denied call stops inside the gateway, where a red box marks the check that refused it.

function initFlow(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => svg.querySelector("#" + id);
  const dots = $("fl-dots");
  const cells = [...svg.querySelectorAll(".fl-cell")];
  const logs = [...svg.querySelectorAll(".fl-log")];
  const flag = $("fl-flag");
  const thru = $("fthru");
  const AGENTS = ["claude-code", "review-bot", "support-bot", "claims-triage", "unknown"];
  const PROVIDERS = ["anthropic", "openai", "deepseek"];
  const CELL_X = cells.map((_, k) => 470 + k * 52);

  // [agent, provider, deniedAtStage | null, status, reason]
  const SCRIPT = [
    [0, 0, null, 200], [2, 1, null, 200], [1, 0, null, 200], [3, 2, null, 200],
    [4, 0, 0, 401, "unknown agent"],
    [0, 0, null, 200], [2, 1, 3, 403, "secret in payload"], [3, 0, null, 200],
    [1, 0, null, 200], [3, 2, 1, 403, "model not allowed"], [2, 1, null, 200],
    [0, 0, 4, 429, "quota exceeded"], [1, 0, null, 200], [3, 0, null, 200],
  ];

  let running = true, visible = true, step = 0, timer = null;

  const log = (html) => {
    for (let i = logs.length - 1; i > 0; i--) logs[i].innerHTML = logs[i - 1].innerHTML;
    logs[0].innerHTML = html;
  };
  const flash = (sel, cls, ms = 500) => {
    const el = svg.querySelector(sel);
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  };

  function dot(color, r) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", r);
    c.setAttribute("fill", color);
    dots.appendChild(c);
    return c;
  }

  // Move `el` along a list of [path, fromFraction, toFraction] at `speed` px/ms.
  // Time only advances while the flow is running and on screen.
  function travel(el, legs, speed, onFrame) {
    return new Promise((resolve) => {
      let li = 0, elapsed = 0, last = null;
      const frame = (now) => {
        if (last !== null && running && visible) elapsed += Math.min(now - last, 50);
        last = now;
        const [path, a, b] = legs[li];
        const len = path.getTotalLength();
        const k = Math.min(1, elapsed / ((Math.abs(b - a) * len) / speed || 1));
        const pt = path.getPointAtLength((a + (b - a) * k) * len);
        el.setAttribute("cx", pt.x);
        el.setAttribute("cy", pt.y);
        onFrame?.(pt, path);
        if (k >= 1) {
          if (++li >= legs.length) return resolve();
          elapsed = 0;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  async function send([a, p, deny, status, reason]) {
    const fin = $("fin" + a), fout = $("fout" + p);
    flash(`[data-agent="${a}"]`, "is-active", 600);
    const d = dot(deny === 0 ? "#f87171" : "#7ee8d8", 4.5);
    await travel(d, [[fin, 0, 1]], 0.32);
    if (deny !== null) {
      const stop = (CELL_X[deny] - 440) / 320;
      await travel(d, [[thru, 0, stop]], 0.22);
      d.setAttribute("fill", "#f87171");
      cells[deny].classList.add("deny");
      flag.textContent = `✕ ${status} · ${reason}`;
      flag.setAttribute("x", Math.min(670, Math.max(530, CELL_X[deny])));
      flag.setAttribute("opacity", "1");
      log(`<tspan fill="#f87171">✕ ${status}</tspan> <tspan fill="#eef2f6">${AGENTS[a]}</tspan>  denied · ${reason}`);
      d.classList.add("fl-die");
      setTimeout(() => { cells[deny].classList.remove("deny"); flag.setAttribute("opacity", "0"); d.remove(); }, 1300);
      return;
    }
    await travel(d, [[thru, 0, 1]], 0.22);
    await travel(d, [[fout, 0, 1]], 0.32);
    d.remove();
    flash(`[data-provider="${p}"]`, "is-active", 700);
    await new Promise((r) => setTimeout(r, 380));
    const back = dot("#c3ccd8", 3.5);
    await travel(back, [[fout, 1, 0], [thru, 1, 0], [fin, 1, 0]], 0.5);
    back.remove();
    flash(`[data-agent="${a}"]`, "is-active", 500);
    log(`<tspan fill="#4ade80">✓ ${status}</tspan> <tspan fill="#eef2f6">${AGENTS[a]}</tspan> → ${PROVIDERS[p]}  traced`);
  }

  function loop() {
    if (running && visible) send(SCRIPT[step++ % SCRIPT.length]);
    timer = setTimeout(loop, 1100);
  }

  if (reducedMotion) {
    log(`<tspan fill="#4ade80">✓ 200</tspan> <tspan fill="#eef2f6">claude-code</tspan> → anthropic  traced`);
    log(`<tspan fill="#f87171">✕ 401</tspan> <tspan fill="#eef2f6">unknown</tspan>  denied · unknown agent`);
    log(`<tspan fill="#4ade80">✓ 200</tspan> <tspan fill="#eef2f6">support-bot</tspan> → openai  traced`);
    return;
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(svg);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; });
  const toggle = document.getElementById("flow-toggle");
  toggle?.addEventListener("click", () => {
    running = !running;
    toggle.textContent = running ? "pause" : "play";
    toggle.setAttribute("aria-pressed", String(!running));
  });
  loop();
}

const flowSvg = document.getElementById("flow");
if (flowSvg) initFlow(flowSvg);

// ───────────────────── Pilot form ─────────────────────
// Posted to Web3Forms, which emails contact@cardeahq.com. On failure, offer a mailto link.
const CONTACT_EMAIL = "contact@cardeahq.com";
const PILOT_FIELDS = ["name", "email", "organisation", "sector", "context"];

function pilotMessage(form, cls, html) {
  form.querySelector("#pilot-result").innerHTML =
    `<p class="rounded-md border p-3 text-sm ${cls}">${html}</p>`;
}

function pilotFallback(form) {
  const data = new FormData(form);
  const body = PILOT_FIELDS.map((k) => `${k}: ${data.get(k) ?? ""}`).join("\n");
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Cardea pilot request")}&body=${encodeURIComponent(body)}`;
  pilotMessage(form, "border-alert/30 bg-alert/10 text-alert",
    `The form could not be sent from here. <a class="underline" href="${href}">Send it by email instead</a>.`);
}

async function submitPilot(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const sending = form.querySelector(".pilot-sending");
  button.disabled = true;
  sending.classList.remove("hidden");
  form.querySelector("#pilot-result").innerHTML = "";
  try {
    const res = await fetch(form.action, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || res.statusText);
    form.reset();
    pilotMessage(form, "border-allow/30 bg-allow/10 text-allow",
      "Thank you. We received your request and will get back to you shortly.");
  } catch {
    pilotFallback(form);
  } finally {
    button.disabled = false;
    sending.classList.add("hidden");
  }
}

document.getElementById("pilot-form")?.addEventListener("submit", submitPilot);
