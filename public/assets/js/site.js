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

// ───────────────────── Platform preview: live records ─────────────────────
// Sample records for the design preview.

const AGENTS = {
  "build-bot":     { model: "claude-opus-5",    session: "header",     tools: ["Bash", "Read", "Edit", "Grep", "Glob"] },
  "support-bot":   { model: "claude-sonnet-5",  session: "baggage",    tools: ["search_tickets", "get_customer", "draft_reply"] },
  "claims-triage": { model: "claude-haiku-4-5", session: "body_field", tools: ["lookup_policy", "ocr_document", "flag_claim"] },
};
const STAGES = ["identification", "policies", "filtering", "rate_limiting", "tracing"];
const STAGE_LABEL = { identification: "identify", policies: "policy", filtering: "filter", rate_limiting: "limit", tracing: "audit" };
const DENIALS = [
  { agent: null,            stage: "identification", status: 401, message: "could not identify caller", reason: "no credential matches a registered agent" },
  { agent: "support-bot",   stage: "filtering",      status: 403, message: "request denied",            reason: "tool result contains an IBAN (get_customer)" },
  { agent: "build-bot",     stage: "filtering",      status: 403, message: "request denied",            reason: "tool result contains an AWS access key (Read .env)" },
  { agent: "claims-triage", stage: "policies",       status: 403, message: "request denied",            reason: "claims policy: model not allowed for this agent" },
  { agent: "build-bot",     stage: "rate_limiting",  status: 429, message: "rate limit exceeded",       reason: "per-agent quota 600 calls/10m" },
];

const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");
const pick = (a) => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
const sessions = {};
const sessionFor = (agent) => (sessions[agent] ??= `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`);

function makeRecord(t) {
  const denied = Math.random() < 0.12;
  if (denied) {
    const d = pick(DENIALS);
    const idx = STAGES.indexOf(d.stage);
    return {
      t, record: "request", call_id: `ak_${hex(16)}`, agent_id: d.agent,
      model: d.agent ? AGENTS[d.agent].model : "claude-opus-5",
      session: d.agent ? { id: sessionFor(d.agent), status: "claimed", source: AGENTS[d.agent].session } : { id: null, status: "absent", source: null },
      tools: [], tokens: null, duration_us: rnd(180, 900),
      outcome: { result: "denied", status: d.status, stage: d.stage, reason: d.reason },
      stages: STAGES.map((name, i) => ({ name, decision: i < idx ? "allowed" : i === idx ? "denied" : "not_run", duration_us: i <= idx ? rnd(40, 400) : null })),
      findings: d.stage === "filtering" ? ["secret_detected"] : [],
    };
  }
  const agent = pick(Object.keys(AGENTS));
  const a = AGENTS[agent];
  const isResponse = Math.random() < 0.5;
  const tools = Array.from({ length: rnd(isResponse ? 0 : 1, 3) }, () => pick(a.tools));
  return {
    t, record: isResponse ? "response" : "request", call_id: `ak_${hex(16)}`, agent_id: agent, model: a.model,
    session: { id: sessionFor(agent), status: "claimed", source: a.session },
    tools, tokens: isResponse ? { sent: rnd(2000, 90000), received: rnd(40, 2400) } : null,
    duration_us: isResponse ? rnd(600000, 9000000) : rnd(300, 1200),
    first_byte_us: isResponse ? rnd(300000, 1800000) : null,
    outcome: isResponse ? { result: "delivered", status: 200 } : { result: "forwarded" },
    stages: isResponse
      ? [{ name: "tracing", observation: "completed", duration_us: rnd(90, 400) }]
      : STAGES.map((name) => ({ name, decision: "allowed", duration_us: rnd(30, 420) })),
    stop_reason: isResponse ? (tools.length ? "tool_use" : "end_turn") : null,
    findings: [],
  };
}

const fmtTime = (d) => d.toISOString().slice(11, 23);
const fmtDur = (us) => (us >= 1e6 ? `${(us / 1e6).toFixed(2)} s` : us >= 1000 ? `${(us / 1000).toFixed(1)} ms` : `${us} µs`);
const fmtNum = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const isDenied = (r) => r.outcome.result === "denied" || r.outcome.result === "failed";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function rowHTML(r) {
  const outcome = isDenied(r)
    ? `<span class="text-deny">✕ ${r.outcome.status}</span> <span class="text-ink-400">${STAGE_LABEL[r.outcome.stage]}</span>`
    : r.record === "response"
      ? `<span class="text-allow">✓ ${r.outcome.status}</span> <span class="text-ink-500">delivered</span>`
      : `<span class="text-allow">✓</span> <span class="text-ink-500">forwarded</span>`;
  const tools = r.tools.length
    ? r.tools.map((t) => `<span class="rounded bg-ink-800 px-1.5 py-0.5 text-ink-200">${t}</span>`).join(" ")
    : `<span class="text-ink-600">—</span>`;
  return `<tr class="rec-row ${isDenied(r) ? "bg-deny/[0.04]" : ""}" data-id="${r.call_id}" tabindex="0">
    <td class="px-5 py-2 text-ink-500">${fmtTime(r.t)}</td>
    <td class="py-2"><span class="${r.record === "request" ? "text-keeper-300" : "text-ink-300"}">${r.record === "request" ? "REQ" : "RES"}</span></td>
    <td class="truncate py-2 ${r.agent_id ? "text-ink-100" : "text-deny"}">${r.agent_id ?? "unknown"}</td>
    <td class="truncate py-2 text-ink-400">${r.call_id.slice(0, 11)}…</td>
    <td class="truncate py-2">${tools}</td>
    <td class="py-2 text-right text-ink-300">${r.tokens ? `${fmtNum(r.tokens.sent)} / ${fmtNum(r.tokens.received)}` : `<span class="text-ink-600">—</span>`}</td>
    <td class="py-2 text-right text-ink-300">${fmtDur(r.duration_us)}</td>
    <td class="truncate py-2 pr-5 pl-4">${outcome}</td>
  </tr>`;
}

function detailHTML(r) {
  const row = (k, v) => `<div class="flex justify-between gap-3 py-1"><dt class="text-ink-500">${k}</dt><dd class="truncate text-right text-ink-100">${v}</dd></div>`;
  const stageColor = { allowed: "bg-allow", completed: "bg-allow", denied: "bg-deny", failed: "bg-deny", not_run: "bg-ink-700" };
  const stages = r.stages.map((s) => {
    const d = s.decision ?? s.observation;
    return `<li class="flex items-center justify-between gap-2 py-1">
      <span class="flex items-center gap-2"><span class="size-1.5 rounded-full ${stageColor[d]}"></span><span class="${d === "not_run" ? "text-ink-500" : "text-ink-200"}">${STAGE_LABEL[s.name]}</span></span>
      <span class="${d === "denied" ? "text-deny" : "text-ink-500"}">${{ allowed: "passed", completed: "passed", denied: "blocked", failed: "failed", not_run: "skipped" }[d]}</span></li>`;
  }).join("");
  const tools = r.tools.length
    ? `<p class="mt-5 text-[10px] tracking-widest text-ink-500 uppercase">${r.record === "response" ? "tools requested" : "tool results"}</p>
       <ul class="mt-2 space-y-1.5">${r.tools.map((t) => `<li class="rounded border border-ink-800 bg-ink-950 px-2.5 py-1.5"><div class="flex justify-between"><span class="text-ink-100">${t}</span><span class="text-ink-500">${rnd(120, 9000)} B</span></div></li>`).join("")}</ul>`
    : "";
  const reason = isDenied(r)
    ? `<div class="mt-4 rounded border border-deny/30 bg-deny/10 p-2.5"><p class="text-[10px] tracking-widest text-deny uppercase">reason · operators only</p><p class="mt-1 text-ink-100">${esc(r.outcome.reason)}</p></div>`
    : "";
  return `<div class="font-mono text-[11px]">
    <div class="flex items-center justify-between"><span class="text-ink-500">${r.record}</span>
      <span class="${isDenied(r) ? "text-deny" : "text-allow"}">${isDenied(r) ? "denied" : r.outcome.result}</span></div>
    <p class="mt-1 truncate text-[13px] text-ink-50">${r.call_id}</p>
    ${reason}
    <dl class="mt-4 divide-y divide-ink-800">
      ${row("agent", r.agent_id ?? '<span class="text-deny">unknown</span>')}
      ${row("model", r.model)}
      ${row("session", r.session.id ? `${r.session.id.slice(0, 8)}…` : '<span class="text-ink-500">absent</span>')}
      ${row("time", fmtTime(r.t))}
      ${r.tokens ? row("tokens", `${r.tokens.sent.toLocaleString("en")} → ${r.tokens.received.toLocaleString("en")}`) : ""}
      ${r.first_byte_us ? row("first response", fmtDur(r.first_byte_us)) : ""}
      
    </dl>
    <p class="mt-5 text-[10px] tracking-widest text-ink-500 uppercase">checks</p>
    <ul class="mt-1">${stages}</ul>
    ${tools}
    <p class="mt-5 text-[10px]/4 text-ink-600">No prompt, argument or result content is ever recorded.</p>
  </div>`;
}

function initLiveRecords(root) {
  const tbody = root.querySelector("[data-rows]");
  const detail = root.querySelector("[data-detail]");
  const records = [];
  const agents = new Set(["build-bot", "support-bot", "claims-triage", ""]);
  let filter = "all";
  let live = true;
  let selected = null;

  const visible = (r) => agents.has(r.agent_id ?? "") &&
    (filter === "all" || (filter === "denied") === isDenied(r));

  function render() {
    const shown = records.filter(visible).slice(0, 16);
    tbody.innerHTML = shown.map(rowHTML).join("");
    if (selected) tbody.querySelector(`[data-id="${selected}"]`)?.setAttribute("aria-selected", "true");
    const inAgents = records.filter((r) => agents.has(r.agent_id ?? ""));
    root.querySelector('[data-count="all"]').textContent = inAgents.length;
    root.querySelector('[data-count="allowed"]').textContent = inAgents.filter((r) => !isDenied(r)).length;
    root.querySelector('[data-count="denied"]').textContent = inAgents.filter(isDenied).length;
  }

  function select(id) {
    const r = records.find((x) => x.call_id === id);
    if (!r) return;
    selected = id;
    detail.innerHTML = detailHTML(r);
    render();
  }

  // Seed with a minute of history, including one denial to show in the detail panel.
  let t = Date.now();
  for (let i = 0; i < 30; i++) records.push(makeRecord(new Date((t -= rnd(900, 2400)))));
  const firstDenied = records.find(isDenied) ?? records[0];
  render();
  select(firstDenied.call_id);

  const tick = () => {
    if (!root.isConnected) return clearInterval(timer);
    if (!live) return;
    records.unshift(makeRecord(new Date()));
    records.length = Math.min(records.length, 400);
    render();
    const first = tbody.firstElementChild;
    if (first && !reducedMotion) first.classList.add("rec-new");
  };
  const timer = setInterval(tick, 1400);

  tbody.addEventListener("click", (e) => { const tr = e.target.closest("tr"); if (tr) select(tr.dataset.id); });
  tbody.addEventListener("keydown", (e) => { if (e.key === "Enter") { const tr = e.target.closest("tr"); if (tr) select(tr.dataset.id); } });
  root.querySelectorAll(".agent-chip").forEach((chip) => chip.addEventListener("click", () => {
    const on = chip.getAttribute("aria-pressed") !== "true";
    chip.setAttribute("aria-pressed", String(on));
    on ? agents.add(chip.dataset.agent) : agents.delete(chip.dataset.agent);
    render();
  }));
  root.querySelectorAll(".rec-filter").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    root.querySelectorAll(".rec-filter").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    render();
  }));
  const toggle = root.querySelector("[data-live-toggle]");
  toggle.addEventListener("click", () => {
    live = !live;
    toggle.querySelector("[data-live-label]").textContent = live ? "live" : "paused";
    toggle.classList.toggle("is-paused", !live);
  });
  // Pause while the reader hovers the table, so rows don't move under the cursor.
  tbody.addEventListener("mouseenter", () => { if (live) toggle.click(); });
  tbody.addEventListener("mouseleave", () => { if (!live) toggle.click(); });
}

// ───────────────────── Platform preview: honeycomb host map ─────────────────────

const HEX_SCALES = {
  activity: { steps: [[0, "var(--hx-a0)"], [1, "var(--hx-a1)"], [40, "var(--hx-a2)"], [90, "var(--hx-a3)"], [150, "var(--hx-a4)"]], key: "calls", label: ["idle", "busy"] },
  denials:  { steps: [[0, "var(--hx-a0)"], [1, "var(--hx-d1)"], [3, "var(--hx-d2)"], [6, "var(--hx-d3)"], [10, "var(--hx-d4)"]], key: "denied", label: ["0", "10+"] },
};
const hexColor = (scale, v) => scale.steps.reduce((c, [min, col]) => (v >= min ? col : c), scale.steps[0][1]);

function initHexmap(root) {
  const hosts = JSON.parse(root.querySelector("[data-hosts]").textContent);
  const hexes = [...root.querySelectorAll(".hx")];
  const detail = root.querySelector("[data-hexdetail]");
  const legend = root.querySelector("[data-legend]");
  let mode = "activity";

  function paint() {
    const scale = HEX_SCALES[mode];
    hexes.forEach((el) => {
      const h = hosts[el.dataset.i];
      el.style.fill = h.unknown ? (mode === "denials" ? hexColor(scale, h.denied) : "var(--color-deny-bg)") : hexColor(scale, h[scale.key]);
      el.style.stroke = h.unknown || (h.denied && mode === "activity") ? "var(--color-deny)" : "transparent";
    });
    legend.innerHTML = `<span>${scale.label[0]}</span>${scale.steps.map(([, c]) => `<span class="inline-block h-2 w-4 rounded-sm" style="background:${c}"></span>`).join("")}<span>${scale.label[1]}</span>`
      + (mode === "activity" ? `<span class="ml-3 inline-block size-2.5 rounded-sm border border-deny"></span><span>has denials</span>` : "");
  }

  function show(i) {
    const h = hosts[i];
    hexes.forEach((el) => el.classList.toggle("is-selected", el.dataset.i == i));
    const agents = h.agents.map((a) => `<li class="flex justify-between gap-3 rounded border border-ink-800 bg-ink-950 px-2.5 py-1.5">
        <span class="${a.id === "unidentified" ? "text-deny" : "text-ink-100"}">${a.id}</span>
        <span class="text-ink-400">${h.unknown ? "" : a.calls + " calls"}${a.denied ? ` · <span class="text-deny">${a.denied} denied</span>` : ""}</span></li>`).join("");
    const row = (k, v) => `<div class="flex justify-between gap-3 py-1"><dt class="text-ink-500">${k}</dt><dd class="text-right text-ink-100">${v}</dd></div>`;
    detail.innerHTML = `
      <div class="flex items-center justify-between"><span class="text-ink-500">host</span>
        <span class="${h.unknown ? "text-deny" : h.denied ? "text-alert" : "text-allow"}">${h.unknown ? "unknown" : h.denied ? "attention" : "healthy"}</span></div>
      <p class="mt-1 text-[13px] text-ink-50">${h.host}</p>
      ${h.reason ? `<div class="mt-4 rounded border border-deny/30 bg-deny/10 p-2.5"><p class="text-[10px] tracking-widest text-deny uppercase">last denial</p><p class="mt-1 text-ink-100">${h.reason}</p></div>` : ""}
      <dl class="mt-4 divide-y divide-ink-800">
        ${row("group", h.group)}${row("environment", h.env)}${row("gateway", h.gw)}
        ${row("calls · 15m", h.unknown ? "—" : h.calls)}${row("denied · 15m", h.denied ? `<span class="text-deny">${h.denied}</span>` : "0")}${row("last seen", h.seen)}
      </dl>
      <p class="mt-5 text-[10px] tracking-widest text-ink-500 uppercase">agents on this host</p>
      <ul class="mt-2 space-y-1.5">${agents}</ul>`;
  }

  root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    root.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    paint();
  }));
  root.addEventListener("click", (e) => { const hx = e.target.closest(".hx"); if (hx) show(hx.dataset.i); });
  root.addEventListener("keydown", (e) => { const hx = e.target.closest(".hx"); if (hx && e.key === "Enter") show(hx.dataset.i); });
  paint();
  show(hosts.findIndex((h) => h.host === "10.4.2.19"));
}

document.addEventListener("htmx:afterSettle", (e) => {
  const live = e.detail.target.querySelector("[data-live-records]");
  if (live) initLiveRecords(live);
  const hexmap = e.detail.target.querySelector("[data-hexmap]");
  if (hexmap) initHexmap(hexmap);
  if (reducedMotion) e.detail.target.querySelectorAll(".map-flow").forEach((g) => g.remove());
});

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
