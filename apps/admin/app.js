const content = document.querySelector("#admin-content"),
  nav = document.querySelector("#admin-nav"),
  message = document.querySelector("#message");
let dashboard,
  tab = "Dashboard",
  editing = null;
let extra = { steps: [], evaluations: [], dependencies: [], appeals: [] },
  moduleHealth = { manifests: [], health: [], history: [] },
  users = null;
const selectedIdeas = new Set();
function allowed(permission) {
  return dashboard.admin.permissions.includes(permission);
}
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
async function api(url, method = "GET", body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const r = await fetch("/api/admin/" + url, opts);
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401) login();
    throw new Error(data.error || "Anfrage fehlgeschlagen.");
  }
  return data;
}
function field(form, name, label, type = "text", value = "", choices = []) {
  const box = el("label", undefined, "field");
  box.append(el("span", label));
  const input = el(
    type === "textarea" ? "textarea" : type === "select" ? "select" : "input",
  );
  input.name = name;
  if (type !== "textarea" && type !== "select") input.type = type;
  for (const [v, text] of choices) {
    const option = el("option", text);
    option.value = v;
    input.append(option);
  }
  input.value = value;
  input.required = true;
  box.append(input);
  form.append(box);
  return input;
}
function action(label, fn, primary = false) {
  const b = el("button", label, primary ? "primary" : "secondary");
  b.type = "button";
  b.onclick = async () => {
    message.textContent = "";
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      message.textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
async function reload() {
  dashboard = await api("dashboard");
  if (allowed("operations.manage"))
    extra = { ...(await api("workflow")), operations: await api("operations") };
  else if (allowed("ideas.read")) extra.appeals = await api("appeals");
  if (allowed("modules.read")) moduleHealth = await api("modules/health");
  document.querySelector("#logout").hidden = false;
  draw();
}
function login() {
  nav.replaceChildren();
  document.querySelector("#logout").hidden = true;
  content.replaceChildren();
  const form = el("form", undefined, "panel");
  form.append(
    el("h2", "Anmelden"),
    el(
      "p",
      "Passwort und zeitbasierter Code aus deiner Authenticator-App.",
      "hint",
    ),
  );
  field(form, "email", "E-Mail", "email").autocomplete = "username";
  field(form, "password", "Passwort", "password").autocomplete =
    "current-password";
  const code = field(form, "token", "Zwei-Faktor-Code");
  code.pattern = "[0-9]{6}";
  code.inputMode = "numeric";
  code.autocomplete = "one-time-code";
  const b = el("button", "Anmelden", "primary");
  b.type = "submit";
  form.append(b);
  form.onsubmit = async (e) => {
    e.preventDefault();
    b.disabled = true;
    try {
      await api("login", "POST", Object.fromEntries(new FormData(form)));
      await reload();
    } catch (err) {
      message.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
  content.append(form);
}
function draw() {
  nav.replaceChildren();
  for (const name of [
    "Dashboard",
    "Umfragen",
    "Ideen",
    "Entscheidungen",
    "Entwicklung",
    "Module",
    "Betrieb",
    "Benutzer",
  ]) {
    const permission = {
      Umfragen: "polls.read",
      Ideen: "ideas.read",
      Entscheidungen: "decisions.read",
      Entwicklung: "planning.read",
      Module: "modules.read",
      Betrieb: "operations.manage",
      Benutzer: "users.manage",
    }[name];
    if (permission && !allowed(permission)) continue;
    const b = action(name, () => {
      tab = name;
      draw();
    });
    if (tab === name) b.setAttribute("aria-current", "page");
    nav.append(b);
  }
  content.replaceChildren();
  if (tab === "Dashboard") {
    const stats = el("div", undefined, "stats");
    for (const [value, label] of [
      [
        dashboard.polls.filter((p) => p.status === "active").length,
        "Aktive Hauptumfrage",
      ],
      [
        dashboard.ideas.filter((i) => i.status === "pending").length,
        "Ideen zur Prüfung",
      ],
      [dashboard.decisions.length, "Erfasste Entscheidungen"],
    ]) {
      const s = el("div", undefined, "stat");
      s.append(el("strong", value), el("span", label));
      stats.append(s);
    }
    content.append(
      stats,
      el(
        "p",
        "Umfragen, Moderation, Entscheidungen und Freigaben zentral verwalten. Der produktive Hostingnachweis steht noch aus.",
        "panel",
      ),
    );
  }
  if (tab === "Umfragen") polls();
  if (tab === "Ideen") {
    ideas();
    ideaTools();
  }
  if (tab === "Entscheidungen") {
    decisions();
    decisionTools();
    githubTools();
  }
  if (tab === "Entwicklung") {
    tasks();
    taskTools();
  }
  if (tab === "Module") {
    modules();
    moduleTools();
  }
  if (tab === "Betrieb") {
    operations();
    operationTools();
    githubSettings();
  }
  if (tab === "Benutzer") userManagement();
}
function polls() {
  for (const p of dashboard.polls) {
    const box = el("article", undefined, "panel");
    box.append(
      el("h2", p.title),
      el(
        "p",
        `${p.status} · ${p.rules.type} · ${new Date(p.startsAt).toLocaleString("de-DE")} bis ${new Date(p.endsAt).toLocaleString("de-DE")}`,
        "hint",
      ),
    );
    const controls = el("div", undefined, "row");
    if (p.status === "draft" && allowed("polls.manage")) {
      controls.append(
        action("Bearbeiten", () => {
          editing = p;
          pollsForm();
        }),
        action("Zeitplan freigeben", async () => {
          if (!confirm("Diesen Zeitplan und die Regeln verbindlich freigeben?"))
            return;
          await api(`polls/${p.id}/schedule`, "POST");
          await reload();
        }),
      );
    }
    if (allowed("polls.manage") && ["active", "scheduled"].includes(p.status))
      controls.append(
        action("Beenden", async () => {
          if (!confirm("Umfrage jetzt beenden?")) return;
          await api(`polls/${p.id}/close`, "POST");
          await reload();
        }),
      );
    controls.append(
      action("Auswertung", async () => {
        const r = await api(`polls/${p.id}/results`);
        const pre = el("pre", JSON.stringify(r, null, 2));
        box.append(pre);
      }),
    );
    if (p.status === "closed" && allowed("polls.manage")) {
      if (!p.released)
        controls.append(
          action("Gültigkeit der Stimmen prüfen", () => ballotForm(p)),
        );
      if (!p.released)
        controls.append(
          action("Ergebnis freigeben", async () => {
            if (
              !confirm(
                "Auswertung als unveränderliche Entscheidung erfassen und gemäß Sichtbarkeitsregel freigeben?",
              )
            )
              return;
            await api(`polls/${p.id}/release`, "POST");
            await reload();
          }),
        );
      controls.append(
        action("Archivieren", async () => {
          await api(`polls/${p.id}/archive`, "POST");
          await reload();
        }),
      );
    }
    if (allowed("polls.manage") && ["active", "scheduled"].includes(p.status))
      controls.append(action("Zeitplanung ändern", () => rescheduleForm(p)));
    box.append(controls);
    content.append(box);
  }
  if (allowed("polls.manage"))
    content.append(
      action(
        "Neue Umfrage vorbereiten",
        () => {
          editing = null;
          pollsForm();
        },
        true,
      ),
    );
}
function pollsForm() {
  content.replaceChildren();
  const p = editing;
  const form = el("form", undefined, "panel");
  form.append(el("h2", p ? "Entwurf bearbeiten" : "Neue Hauptumfrage"));
  field(form, "title", "Frage", "text", p?.title || "");
  field(
    form,
    "description",
    "Einordnung",
    "textarea",
    p?.description || "",
  ).required = false;
  field(form, "type", "Fragetyp", "select", p?.rules.type || "single", [
    ["single", "Eine Antwort"],
    ["multiple", "Mehrere Antworten"],
    ["ranking", "Prioritäten-Ranking"],
    ["text", "Freitext-Ideensammlung"],
  ]);
  field(
    form,
    "options",
    "Antwortoptionen (eine je Zeile)",
    "textarea",
    p?.rules.options.join("\n") || "",
  ).required = false;
  const now = new Date(Date.now() + 60000);
  const local = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  field(
    form,
    "startsAt",
    "Start (lokale Zeit)",
    "datetime-local",
    local(p ? new Date(p.startsAt) : now),
  );
  field(
    form,
    "endsAt",
    "Ende (lokale Zeit)",
    "datetime-local",
    local(p ? new Date(p.endsAt) : new Date(now.getTime() + 604800000)),
  );
  field(
    form,
    "visibility",
    "Ergebnisse sichtbar",
    "select",
    p?.rules.visibility || "after_release",
    [
      ["hidden", "Nie öffentlich"],
      ["after_vote", "Nach eigener Stimmabgabe"],
      ["after_close", "Nach Ende"],
      ["after_release", "Nach Product-Owner-Freigabe"],
    ],
  );
  field(
    form,
    "participation",
    "Teilnahmeverfahren",
    "select",
    p?.rules.participation || "anonymous",
    [
      ["anonymous", "Anonym je Browser"],
      ["email", "E-Mail je Umfrage verifizieren"],
      ["account", "Verifiziertes Konto (E-Mail-Anmeldung)"],
    ],
  );
  field(
    form,
    "minChoices",
    "Minimale Auswahl (Multiple-Choice)",
    "number",
    p?.rules.minChoices || 1,
  ).min = 1;
  field(
    form,
    "maxChoices",
    "Maximale Auswahl (Multiple-Choice)",
    "number",
    p?.rules.maxChoices || 1,
  ).min = 1;
  field(
    form,
    "quorum",
    "Mindestanzahl gültiger Stimmen",
    "number",
    p?.rules.quorum || 0,
  ).min = 0;
  field(
    form,
    "tieRule",
    "Gleichstand",
    "select",
    p?.rules.tieRule || "shared",
    [
      ["shared", "Gleiche Priorität"],
      ["runoff", "Stichwahl vorbereiten"],
    ],
  );
  form.append(
    el(
      "p",
      "Das gewählte Teilnahmeverfahren gilt für diese Umfrage. Regeln sind nach Freigabe des Zeitplans nicht mehr editierbar. Rankings verwenden Borda-Punkte von N−1 bis 0; Prozentwerte beziehen sich auf maximal mögliche Punkte. Mehrfachauswahl-Prozentwerte beziehen sich auf Teilnehmende.",
      "hint",
    ),
  );
  const submit = el("button", "Entwurf speichern", "primary");
  submit.type = "submit";
  form.append(submit);
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    const f = Object.fromEntries(new FormData(form));
    const data = {
      title: f.title,
      description: f.description,
      startsAt: new Date(f.startsAt).toISOString(),
      endsAt: new Date(f.endsAt).toISOString(),
      rules: {
        type: f.type,
        options:
          f.type === "text"
            ? []
            : f.options
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
        visibility: f.visibility,
        participation: f.participation,
        minChoices: Number(f.minChoices),
        maxChoices: Number(f.maxChoices),
        quorum: Number(f.quorum),
        tieRule: f.tieRule,
        version: 1,
      },
    };
    try {
      await api(p ? "polls/" + p.id : "polls", p ? "PATCH" : "POST", data);
      editing = null;
      await reload();
    } catch (err) {
      message.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  };
  content.append(form);
}
function ideas() {
  if (!dashboard.ideas.length)
    content.append(
      el("p", "Freitextbeiträge erscheinen hier zur Prüfung.", "panel"),
    );
  for (const idea of dashboard.ideas) {
    if (!allowed("ideas.moderate")) {
      const box = el("article", undefined, "panel");
      box.append(
        el("h2", "Eingereichte Idee"),
        el("p", idea.content),
        el("p", "Status: " + idea.status),
      );
      content.append(box);
      continue;
    }
    const form = el("form", undefined, "panel");
    form.append(
      el("h2", "Eingereichte Idee"),
      el(
        "p",
        `Status: ${idea.status}${idea.spam_flag ? " · Spamverdacht (manuell prüfen)" : ""}${idea.duplicate_of ? " · Mögliches Duplikat" : ""}`,
        "hint",
      ),
      el("p", "Original: " + idea.original),
    );
    field(form, "content", "Bearbeitete Fassung", "textarea", idea.content);
    field(form, "category", "Kategorie", "text", idea.category).required =
      false;
    field(form, "status", "Prüfstatus", "select", idea.status, [
      ["pending", "Offen"],
      ["approved", "Freigegeben"],
      ["rejected", "Abgelehnt"],
    ]);
    field(form, "reason", "Begründung");
    const b = el("button", "Prüfung dokumentieren", "primary");
    b.type = "submit";
    form.append(
      b,
      action("Bearbeitungshistorie", async () =>
        form.append(
          el(
            "pre",
            JSON.stringify(await api(`ideas/${idea.id}/history`), null, 2),
          ),
        ),
      ),
    );
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(
          "ideas/" + idea.id,
          "PATCH",
          Object.fromEntries(new FormData(form)),
        );
        await reload();
      } catch (err) {
        message.textContent = err.message;
      }
    };
    content.append(form);
  }
}
function decisions() {
  if (!dashboard.decisions.length)
    content.append(
      el(
        "p",
        "Freigegebene Auswertungen erscheinen hier als Entscheidungen.",
        "panel",
      ),
    );
  for (const d of dashboard.decisions) {
    const box = el("article", undefined, "panel");
    box.append(
      el("h2", d.title),
      el("p", `Status: ${d.status} · Herkunft: Umfrage ${d.poll_id}`, "hint"),
      el(
        "pre",
        JSON.stringify(
          typeof d.result === "string" ? JSON.parse(d.result) : d.result,
          null,
          2,
        ),
      ),
    );
    if (d.issue_url) {
      const a = el("a", "GitHub Issue öffnen ↗");
      a.href = d.issue_url;
      a.target = "_blank";
      a.rel = "noopener";
      box.append(
        a,
        action("GitHub-Status abrufen", async () => {
          const s = await api(`decisions/${d.id}/github-sync`, "POST");
          box.append(
            el("p", "GitHub: " + s.state + " · Keine Produktionsfreigabe."),
          );
        }),
      );
    } else if (d.github_state)
      box.append(
        el(
          "p",
          "GitHub-Erstellung: " +
            d.github_state +
            ". Manuell auf GitHub abgleichen; keine automatische Wiederholung.",
        ),
      );
    else if (allowed("github.manage"))
      box.append(action("GitHub-Issue vorbereiten", async () => githubForm(d)));
    content.append(box);
  }
}
async function githubForm(d) {
  const p = await api(`decisions/${d.id}/github-preview`);
  const form = el("form", undefined, "panel");
  form.append(
    el("h2", "GitHub-Issue: Vorschau und Freigabe"),
    el(
      "p",
      "Die folgenden Inhalte werden öffentlich auf GitHub veröffentlicht. Private Angaben entfernen.",
      "hint",
    ),
  );
  field(form, "title", "Titel", "text", p.title);
  field(form, "body", "Beschreibung & Anforderungen", "textarea", p.body);
  field(form, "labels", "Labels (kommagetrennt)").required = false;
  const label = el("label", undefined, "option"),
    check = el("input");
  check.type = "checkbox";
  check.required = true;
  label.append(
    check,
    el(
      "span",
      "Ich habe die Inhalte geprüft und genehmige die öffentliche Issue-Erstellung.",
    ),
  );
  form.append(label);
  const b = el("button", "Issue ausdrücklich erstellen", "primary");
  b.type = "submit";
  form.append(b);
  form.onsubmit = async (e) => {
    e.preventDefault();
    b.disabled = true;
    try {
      const f = Object.fromEntries(new FormData(form));
      await api(`decisions/${d.id}/github`, "POST", {
        title: f.title,
        body: f.body,
        labels: f.labels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        confirmed: check.checked,
      });
      await reload();
    } catch (err) {
      message.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
  content.replaceChildren(form);
}
function tasks() {
  for (const t of dashboard.tasks) {
    const box = el("article", undefined, "panel");
    box.append(
      el("h2", t.title),
      el(
        "p",
        `Priorität ${t.priority} · ${t.status} · Tests: ${t.test_status}`,
      ),
    );
    content.append(box);
  }
  if (!allowed("planning.manage")) return;
  if (!dashboard.decisions.length) {
    content.append(
      el("p", "Zuerst eine offizielle Entscheidung erfassen.", "panel"),
    );
    return;
  }
  const form = el("form", undefined, "panel");
  form.append(el("h2", "Entwicklungsaufgabe planen"));
  field(
    form,
    "decisionId",
    "Zugeordnete Entscheidung",
    "select",
    dashboard.decisions[0].id,
    dashboard.decisions.map((d) => [d.id, d.title]),
  );
  field(form, "title", "Aufgabe");
  field(form, "priority", "Priorität", "number", 0);
  const b = el("button", "Aufgabe anlegen", "primary");
  b.type = "submit";
  form.append(b);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    try {
      await api("tasks", "POST", { ...f, priority: Number(f.priority) });
      await reload();
    } catch (err) {
      message.textContent = err.message;
    }
  };
  content.append(form);
}
function modules() {
  content.append(
    el(
      "p",
      "Es werden ausschließlich geprüfte, mit dem Quellcode ausgelieferte Module zugelassen. Weitere öffentliche Module benötigen eine Communityentscheidung und Product-Owner-Freigabe.",
      "panel",
    ),
  );
  for (const m of dashboard.modules)
    content.append(
      el(
        "p",
        `${m.id} · ${m.version} · ${m.enabled ? "aktiv" : "inaktiv"}`,
        "panel",
      ),
    );
  content.append(
    el(
      "p",
      "Es werden ausschließlich mit der Anwendung ausgelieferte kompatible Modulversionen verwendet. Programmcode wird über geprüfte Releases aktualisiert; Konfigurationen können im Panel wiederhergestellt werden.",
      "hint",
    ),
  );
}
function operations() {
  const form = el("form", undefined, "panel");
  form.append(el("h2", "Zwischen zwei Umfragen"));
  field(form, "mode", "Anzeige", "select", dashboard.state.transition_mode, [
    ["waiting", "Wartezustand"],
    ["results", "Letzte Umfrage und erlaubte Ergebnisse"],
  ]);
  field(
    form,
    "message",
    "Wartetext",
    "textarea",
    dashboard.state.waiting_message,
  );
  const pauseLabel = el("label", undefined, "option");
  const pauseInput = el("input");
  pauseInput.type = "checkbox";
  pauseInput.checked = Boolean(dashboard.state.paused);
  pauseLabel.append(
    pauseInput,
    el("span", "Teilnahme und neue Umfragestarts pausieren"),
  );
  form.append(
    pauseLabel,
    el(
      "p",
      "Während einer Pause laufen konfigurierte Zeitfenster weiter; Termine werden nicht heimlich verschoben.",
      "hint",
    ),
  );
  const b = el("button", "Speichern", "primary");
  b.type = "submit";
  form.append(b);
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("settings", "POST", {
        ...Object.fromEntries(new FormData(form)),
        paused: pauseInput.checked,
      });
      await reload();
    } catch (err) {
      message.textContent = err.message;
    }
  };
  content.append(form);
  const box = el("section", undefined, "panel");
  box.append(el("h2", "Auditprotokoll"));
  const table = el("table"),
    head = el("tr");
  for (const t of ["Zeit", "Aktion", "Referenz"]) head.append(el("th", t));
  table.append(head);
  for (const a of dashboard.audit) {
    const row = el("tr");
    row.append(
      el("td", a.created_at),
      el("td", a.action),
      el("td", a.target_id),
    );
    table.append(row);
  }
  box.append(table);
  content.append(
    box,
    el(
      "p",
      "Backups, Wiederherstellung und Hostingdiagnose erfolgen gemäß Betriebshandbuch. Adminrollen werden derzeit per kontrolliertem Datenbankprozess verwaltet.",
      "hint",
    ),
  );
}
document.querySelector("#logout").onclick = async () => {
  try {
    await api("logout", "POST");
    login();
  } catch (e) {
    message.textContent = e.message;
  }
};
function submitForm(form, label, handler) {
  const submit = el("button", label, "primary");
  submit.type = "submit";
  form.append(submit);
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    message.textContent = "";
    try {
      await handler(new FormData(form));
      await reload();
    } catch (err) {
      message.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  };
  return form;
}
function selectMany(form, name, label, items, selected = []) {
  const s = field(form, name, label, "select", "", items);
  s.multiple = true;
  s.required = false;
  s.size = Math.min(6, items.length);
  for (const o of s.options) o.selected = selected.includes(o.value);
  return s;
}
function ideaTools() {
  if (!allowed("ideas.moderate")) return;
  const choices = dashboard.ideas
    .filter((i) => i.status !== "merged")
    .map((i) => [i.id, i.content.slice(0, 70)]);
  if (choices.length) {
    const f = el("form", undefined, "panel");
    f.append(el("h2", "Mehrere Ideen prüfen"));
    selectMany(f, "ids", "Ideen auswählen", choices);
    field(f, "status", "Neuer Prüfstatus", "select", "approved", [
      ["approved", "Freigeben"],
      ["rejected", "Ablehnen"],
      ["pending", "Erneut prüfen"],
    ]);
    field(f, "reason", "Begründung");
    content.append(
      submitForm(f, "Auswahl bearbeiten", (d) =>
        api("ideas/batch", "POST", {
          ids: d.getAll("ids"),
          status: d.get("status"),
          reason: d.get("reason"),
        }),
      ),
    );
    const merge = el("form", undefined, "panel");
    merge.append(el("h2", "Ähnliche Ideen zusammenführen"));
    field(
      merge,
      "source",
      "Ursprüngliche Idee",
      "select",
      choices[0][0],
      choices,
    );
    field(
      merge,
      "target",
      "Mit dieser Idee zusammenführen",
      "select",
      choices[0][0],
      choices,
    );
    field(merge, "reason", "Begründung");
    content.append(
      submitForm(merge, "Zusammenführung protokollieren", (d) =>
        api("ideas/" + d.get("source") + "/merge", "POST", {
          targetId: d.get("target"),
          reason: d.get("reason"),
        }),
      ),
    );
  }
  const approved = dashboard.ideas
    .filter((i) => i.status === "approved")
    .map((i) => [i.id, i.content.slice(0, 70)]);
  if (approved.length >= 2) {
    const f = el("form", undefined, "panel");
    f.append(el("h2", "Abstimmung aus geprüften Ideen vorbereiten"));
    selectMany(f, "ids", "Freigegebene Ideen", approved);
    field(f, "title", "Frage");
    field(f, "type", "Verfahren", "select", "ranking", [
      ["single", "Eine Antwort"],
      ["multiple", "Mehrere Antworten"],
      ["ranking", "Prioritäten-Ranking"],
    ]);
    field(f, "start", "Start", "datetime-local");
    field(f, "end", "Ende", "datetime-local");
    content.append(
      submitForm(f, "Umfrageentwurf erstellen", (d) =>
        api("ideas/prepare-poll", "POST", {
          ideaIds: d.getAll("ids"),
          title: d.get("title"),
          type: d.get("type"),
          startsAt: new Date(d.get("start")).toISOString(),
          endsAt: new Date(d.get("end")).toISOString(),
        }),
      ),
    );
  }
  for (const a of extra.appeals.filter((a) => a.status === "pending")) {
    const f = el("form", undefined, "panel");
    f.append(el("h2", "Offener Einspruch"), el("p", a.content));
    field(f, "status", "Prüfergebnis", "select", "accepted", [
      ["accepted", "Einspruch angenommen"],
      ["rejected", "Einspruch abgelehnt"],
    ]);
    field(f, "response", "Nachvollziehbare Antwort", "textarea");
    content.append(
      submitForm(f, "Einspruch beantworten", (d) =>
        api("appeals/" + a.id, "PATCH", Object.fromEntries(d)),
      ),
    );
  }
}
function decisionTools() {
  if (!allowed("decisions.manage")) return;
  for (const d of dashboard.decisions) {
    const f = el("form", undefined, "panel");
    f.append(el("h2", "Anforderungen & Prozess: " + d.title));
    field(
      f,
      "step",
      "Prozessschritt",
      "select",
      d.workflow_step,
      extra.steps.map((s) => [s, s]),
    );
    field(
      f,
      "requirements",
      "Anforderungen",
      "textarea",
      d.requirements || "",
    ).required = false;
    field(f, "reason", "Begründung für Änderung");
    f.append(
      action("Prozesshistorie", async () =>
        f.append(
          el(
            "pre",
            JSON.stringify(
              await api("decisions/" + d.id + "/history"),
              null,
              2,
            ),
          ),
        ),
      ),
    );
    content.append(
      submitForm(f, "Prozess dokumentieren", (v) =>
        api("decisions/" + d.id, "PATCH", Object.fromEntries(v)),
      ),
    );
  }
  if (dashboard.decisions.length) {
    const f = el("form", undefined, "panel");
    f.append(el("h2", "Vorhandene Bewertung erfassen"));
    field(
      f,
      "decisionId",
      "Zugeordnete Entscheidung",
      "select",
      dashboard.decisions[0].id,
      dashboard.decisions.map((d) => [d.id, d.title]),
    );
    field(f, "sentiment", "Bewertung", "select", "neutral", [
      ["positive", "Positiv"],
      ["neutral", "Neutral"],
      ["negative", "Negativ"],
    ]);
    field(f, "content", "Inhalt", "textarea");
    field(f, "origin", "Herkunft / Referenz");
    content.append(
      submitForm(f, "Bewertung intern erfassen", (d) =>
        api("evaluations", "POST", Object.fromEntries(d)),
      ),
    );
  }
  for (const e of extra.evaluations) {
    const f = el("form", undefined, "panel");
    f.append(
      el("h2", e.sentiment + " · " + e.origin),
      el("p", e.content),
      el("p", "Status: " + e.status, "hint"),
    );
    field(f, "status", "Prüfstatus", "select", "reviewed", [
      ["reviewed", "Geprüft"],
      ["accepted", "Angenommen"],
      ["rejected", "Abgelehnt"],
    ]);
    f.append(evaluationGithub(e));
    content.append(
      submitForm(f, "Bewertung prüfen", (d) =>
        api("evaluations/" + e.id, "PATCH", Object.fromEntries(d)),
      ),
    );
  }
}
function taskTools() {
  if (!allowed("planning.manage")) return;
  for (const t of dashboard.tasks) {
    const f = el("form", undefined, "panel");
    f.append(el("h2", "Aufgabe bearbeiten: " + t.title));
    field(
      f,
      "requirements",
      "Anforderungsstand",
      "textarea",
      t.requirements || "",
    ).required = false;
    field(f, "priority", "Priorität", "number", t.priority);
    field(f, "status", "Entwicklungsstatus", "select", t.status, [
      ["requirements", "Anforderungen klären"],
      ["planned", "Geplant"],
      ["implementation", "Umsetzung"],
      ["review", "Prüfung"],
      ["ready", "Bereit"],
      ["released", "Veröffentlicht"],
    ]);
    field(f, "testStatus", "Teststatus", "select", t.test_status, [
      ["pending", "Offen"],
      ["passed", "Bestanden"],
      ["failed", "Fehlgeschlagen"],
    ]);
    field(f, "version", "Version", "text", t.version || "").required = false;
    selectMany(
      f,
      "dependencies",
      "Abhängigkeiten",
      dashboard.tasks.filter((x) => x.id !== t.id).map((x) => [x.id, x.title]),
      extra.dependencies
        .filter((x) => x.task_id === t.id)
        .map((x) => x.depends_on),
    );
    const label = el("label", undefined, "option"),
      check = el("input");
    check.type = "checkbox";
    check.checked = Boolean(t.release_approved);
    label.append(
      check,
      el(
        "span",
        "Ich genehmige die Veröffentlichung dieser Aufgabe ausdrücklich.",
      ),
    );
    f.append(label);
    content.append(
      submitForm(f, "Entwicklungsstand speichern", (d) =>
        api("tasks/" + t.id, "PATCH", {
          ...Object.fromEntries(d),
          priority: Number(d.get("priority")),
          dependencies: d.getAll("dependencies"),
          releaseApproved: check.checked,
        }),
      ),
    );
  }
}
function moduleTools() {
  const health = el("section", undefined, "panel");
  health.append(el("h2", "Modulzustand"));
  for (const h of moduleHealth.health)
    health.append(
      el(
        "p",
        `${h.id}: ${h.healthy ? "funktionsfähig" : "Prüfung fehlgeschlagen"}`,
      ),
    );
  content.append(health);
  if (!allowed("modules.manage")) return;
  for (const m of dashboard.modules) {
    const manifest = moduleHealth.manifests.find((x) => x.id === m.id);
    if (!manifest) continue;
    const f = el("form", undefined, "panel");
    f.append(
      el("h2", "Modul steuern: " + m.id),
      el(
        "p",
        "Installierte Version: " +
          m.version +
          " · Mit Anwendung ausgeliefert: " +
          manifest.version,
        "hint",
      ),
    );
    field(f, "version", "Kompatible Version", "select", manifest.version, [
      [manifest.version, manifest.version],
    ]);
    const label = el("label", undefined, "option"),
      check = el("input");
    check.type = "checkbox";
    check.checked = Boolean(m.enabled);
    label.append(check, el("span", "Modul aktivieren"));
    f.append(label);
    content.append(
      submitForm(f, "Moduländerung freigeben", (d) => {
        if (!confirm("Diese Modulkonfiguration ausdrücklich freigeben?"))
          return;
        return api("modules/" + m.id + "/configure", "POST", {
          version: d.get("version"),
          enabled: check.checked,
          decisionId: null,
          confirmed: true,
        });
      }),
    );
    const previous = moduleHealth.history.find(
      (h) => h.module_id === m.id && h.previous_version === manifest.version,
    );
    if (previous)
      f.append(
        action("Vorherige Konfiguration wiederherstellen", async () => {
          if (
            !confirm("Vorherige geprüfte Modulkonfiguration wiederherstellen?")
          )
            return;
          await api("modules/" + m.id + "/configure", "POST", {
            version: previous.previous_version,
            enabled: Boolean(previous.previous_enabled),
            decisionId: null,
            confirmed: true,
          });
          await reload();
        }),
      );
  }
}
function operationTools() {
  const box = el("section", undefined, "panel");
  box.append(el("h2", "Konfiguration und Hintergrundaufgaben"));
  if (extra.operations) {
    for (const [key, value] of Object.entries(extra.operations.checks))
      box.append(el("p", key + ": " + value));
    box.append(el("p", "Aktive Adminsitzungen: " + extra.operations.sessions));
    for (const job of extra.operations.mail)
      box.append(
        el(
          "p",
          `${job.status} · ${job.created_at}${job.last_error ? " · " + job.last_error : ""}`,
        ),
      );
  }
  for (const event of extra.operations?.security || [])
    box.append(
      el("p", event.created_at + " · " + event.status + " · " + event.path),
    );
  content.append(box);
  const f = el("form", undefined, "panel");
  f.append(el("h2", "Entscheidungsprozess konfigurieren"));
  field(
    f,
    "steps",
    "Schritte (einer je Zeile)",
    "textarea",
    extra.steps.join("\n"),
  );
  content.append(
    submitForm(f, "Prozesskonfiguration freigeben", (d) => {
      if (!confirm("Diese Prozessschritte verbindlich konfigurieren?")) return;
      return api("workflow", "PUT", {
        steps: d
          .get("steps")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        confirmed: true,
      });
    }),
  );
}
function githubTools() {
  if (!allowed("github.manage")) return;
  for (const d of dashboard.decisions) {
    const box = el("section", undefined, "panel");
    box.append(
      el("h2", "GitHub-Verknüpfungen: " + d.title),
      action("Verknüpfungen und Konflikte anzeigen", async () => {
        const detail = await api("decisions/" + d.id + "/github-detail");
        box.append(el("pre", JSON.stringify(detail, null, 2)));
        if (detail.issue?.state === "created") {
          box.append(
            action("Aktuelle GitHub-Fassung abrufen", async () => {
              const remote = await api(
                "decisions/" + d.id + "/github-refresh",
                "POST",
              );
              const form = el("form", undefined, "panel");
              form.append(
                el("h3", "Änderungsvorschau: GitHub Issue " + remote.number),
                el(
                  "p",
                  "Vertrauliche Informationen entfernen; Änderungen werden öffentlich veröffentlicht.",
                  "hint",
                ),
              );
              field(form, "title", "Titel", "text", remote.title);
              field(
                form,
                "body",
                "Beschreibung",
                "textarea",
                remote.body || "",
              );
              box.append(
                submitForm(
                  form,
                  "Änderungen ausdrücklich veröffentlichen",
                  (f) => {
                    if (
                      !confirm(
                        "Diese Inhalte ausdrücklich auf GitHub veröffentlichen?",
                      )
                    )
                      return;
                    return api("decisions/" + d.id + "/github-update", "POST", {
                      ...Object.fromEntries(f),
                      expectedUpdatedAt: remote.updated_at,
                      confirmed: true,
                    });
                  },
                ),
              );
            }),
          );
        }
      }),
    );
    const link = el("form");
    field(link, "number", "Vorhandene Issue-Nummer", "number");
    field(link, "reason", "Begründung für Zuordnung");
    box.append(
      submitForm(link, "Bestehendes Issue manuell verknüpfen", (f) => {
        if (
          !confirm(
            "Dieses bestehende Issue verbindlich zuordnen? Bei ungeklärter Erstellung zuerst den Entscheidungsmarker prüfen.",
          )
        )
          return;
        return api("decisions/" + d.id + "/github-link", "POST", {
          number: Number(f.get("number")),
          reason: f.get("reason"),
          confirmed: true,
        });
      }),
    );
    const pull = el("form");
    field(pull, "number", "Pull-Request-Nummer", "number");
    box.append(
      submitForm(pull, "Pull Request verknüpfen", (f) =>
        api("decisions/" + d.id + "/github-pull", "POST", {
          number: Number(f.get("number")),
          confirmed: true,
        }),
      ),
    );
    content.append(box);
  }
}
function githubSettings() {
  const f = el("form", undefined, "panel");
  f.append(el("h2", "GitHub-Synchronisierung"));
  const label = el("label", undefined, "option"),
    check = el("input");
  check.type = "checkbox";
  check.checked = Boolean(dashboard.state.github_sync_enabled);
  label.append(
    check,
    el("span", "Status alle 15 Minuten über den Cronjob abrufen"),
  );
  f.append(
    label,
    el(
      "p",
      "Fehlgeschlagene Statusabrufe werden begrenzt wiederholt. Neue Issues oder kritische Änderungen werden dadurch nicht automatisch erstellt.",
      "hint",
    ),
  );
  content.append(
    submitForm(f, "Synchronisierung konfigurieren", () =>
      api("github/settings", "POST", {
        syncEnabled: check.checked,
        confirmed: true,
      }),
    ),
  );
}
function evaluationGithub(e) {
  return action("Issue zu dieser Bewertung vorbereiten", async () => {
    const p = await api("evaluations/" + e.id + "/github-preview");
    const f = el("form", undefined, "panel");
    f.append(el("h2", "GitHub-Vorschau: Bewertung"));
    if (p.link) {
      f.append(el("p", "Verknüpfung: " + p.link.state));
      if (p.link.issue_url) {
        const a = el("a", "GitHub Issue öffnen");
        a.href = p.link.issue_url;
        a.rel = "noopener";
        a.target = "_blank";
        f.append(a);
      }
      content.replaceChildren(f);
      return;
    }
    field(f, "title", "Titel", "text", p.title);
    field(f, "body", "Öffentliche Beschreibung", "textarea", p.body);
    f.append(
      el("p", "Private Angaben vor der Veröffentlichung entfernen.", "hint"),
    );
    content.replaceChildren(
      submitForm(f, "Bewertungs-Issue ausdrücklich erstellen", (d) => {
        if (
          !confirm(
            "Diese Bewertung mit den sichtbaren Inhalten öffentlich auf GitHub veröffentlichen?",
          )
        )
          return;
        return api("evaluations/" + e.id + "/github", "POST", {
          ...Object.fromEntries(d),
          confirmed: true,
        });
      }),
    );
  });
}
async function ballotForm(p) {
  try {
    const ballots = await api("polls/" + p.id + "/ballots");
    content.replaceChildren(
      el("h2", "Stimmenprüfung: " + p.title),
      el(
        "p",
        "Anonyme Stimmen lassen sich nicht zuverlässig einzelnen Personen zuordnen. Eine Ungültigerklärung braucht einen konkreten, dokumentierten Grund.",
        "hint",
      ),
    );
    for (const v of ballots) {
      const f = el("form", undefined, "panel");
      f.append(
        el("h3", "Stimme " + v.id.slice(0, 8)),
        el("p", "Eingang: " + v.created_at),
      );
      field(f, "valid", "Prüfergebnis", "select", v.valid ? "true" : "false", [
        ["true", "Gültig"],
        ["false", "Ungültig"],
      ]);
      field(
        f,
        "reason",
        "Nachvollziehbare Begründung",
        "textarea",
        v.invalid_reason || "",
      );
      content.append(
        submitForm(f, "Stimmenprüfung bestätigen", (d) =>
          api("polls/" + p.id + "/ballots/" + v.id, "PATCH", {
            valid: d.get("valid") === "true",
            reason: d.get("reason"),
            confirmed: true,
          }),
        ),
      );
    }
  } catch (err) {
    message.textContent = err.message;
  }
}
function rescheduleForm(p) {
  content.replaceChildren();
  const f = el("form", undefined, "panel");
  f.append(el("h2", "Zeitplanung transparent ändern: " + p.title));
  field(f, "startsAt", "Start (UTC)", "text", p.startsAt).readOnly =
    p.status === "active";
  field(f, "endsAt", "Ende (UTC)", "text", p.endsAt);
  field(f, "reason", "Öffentliche Begründung", "textarea");
  content.append(
    submitForm(f, "Zeitänderung ausdrücklich freigeben", (d) =>
      api("polls/" + p.id + "/reschedule", "POST", {
        ...Object.fromEntries(d),
        confirmed: true,
      }),
    ),
  );
}
async function userManagement() {
  try {
    const data = await api("users");
    content.replaceChildren();
    content.append(
      el(
        "p",
        "Neue administrative Konten werden mit einem sicheren Offlineverfahren eingerichtet. Product-Owner-Rechte sind im Web nicht übertragbar.",
        "panel",
      ),
    );
    for (const u of data.admins) {
      const f = el("form", undefined, "panel");
      f.append(el("h2", u.email));
      if (u.role === "owner") {
        f.append(el("p", "Product Owner · geschützte Rechte"));
        content.append(f);
        continue;
      }
      field(f, "role", "Rolle", "select", u.role, [
        ["moderator", "Moderation"],
        ["viewer", "Lesender Zugriff"],
      ]);
      selectMany(
        f,
        "permissions",
        "Zusätzliche granulare Berechtigungen",
        data.permissions.map((p) => [p, p]),
        data.grants.filter((g) => g.admin_id === u.id).map((g) => g.permission),
      );
      const label = el("label", undefined, "option"),
        check = el("input");
      check.type = "checkbox";
      check.checked = Boolean(u.disabled);
      label.append(check, el("span", "Konto sperren"));
      f.append(label);
      content.append(
        submitForm(f, "Berechtigungen speichern", (d) =>
          api("users/" + u.id, "PATCH", {
            role: d.get("role"),
            disabled: check.checked,
            permissions: d.getAll("permissions"),
          }),
        ),
      );
    }
    content.append(
      el(
        "p",
        data.participants.length +
          " verifizierte Teilnehmerkonten (private E-Mail-Adressen werden hier nicht angezeigt).",
        "hint",
      ),
    );
  } catch (err) {
    message.textContent = err.message;
  }
}
reload().catch((e) => {
  if (!e.message.includes("Anmeldung")) message.textContent = e.message;
});
