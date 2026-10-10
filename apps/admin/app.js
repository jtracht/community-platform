const content = document.querySelector("#admin-content"),
  nav = document.querySelector("#admin-nav"),
  message = document.querySelector("#message");
let dashboard,
  tab = "Dashboard",
  editing = null;
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
async function api(url, method = "GET", body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
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
  ]) {
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
        "MVP: Anonyme Umfragen, geschützte Auswertung und manuelle GitHub-Freigabe. Hostingabnahme und weitere Startfunktionen sind noch offen.",
        "panel",
      ),
    );
  }
  if (tab === "Umfragen") polls();
  if (tab === "Ideen") ideas();
  if (tab === "Entscheidungen") decisions();
  if (tab === "Entwicklung") tasks();
  if (tab === "Module") modules();
  if (tab === "Betrieb") operations();
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
    if (p.status === "draft") {
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
    if (["active", "scheduled"].includes(p.status))
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
    if (p.status === "closed") {
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
    box.append(controls);
    content.append(box);
  }
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
      "Teilnahme: anonym. Regeln sind nach Freigabe des Zeitplans nicht mehr editierbar. Rankings verwenden Borda-Punkte von N−1 bis 0; Prozentwerte beziehen sich auf maximal mögliche Punkte. Mehrfachauswahl-Prozentwerte beziehen sich auf Teilnehmende.",
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
        participation: "anonymous",
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
    else
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
      "Kontrollierte Updates, Rollback und Aktivierung weiterer Module sind noch nicht vollständig implementiert.",
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
  const b = el("button", "Speichern", "primary");
  b.type = "submit";
  form.append(b);
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("settings", "POST", Object.fromEntries(new FormData(form)));
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
reload().catch((e) => {
  if (!e.message.includes("Anmeldung")) message.textContent = e.message;
});
