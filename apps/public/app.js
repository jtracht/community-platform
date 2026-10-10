const root = document.querySelector("#poll"),
  message = document.querySelector("#message");
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
async function api(url, options) {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
  return data;
}
function showResults(data, type) {
  const box = el("section", undefined, "panel");
  box.append(
    el("h2", "Ergebnis"),
    el(
      "p",
      `${data.total} gültige Stimmen · Mindestbeteiligung ${data.quorumReached ? "erreicht" : "noch nicht erreicht"}`,
      "hint",
    ),
  );
  if (type === "ranking")
    box.append(
      el(
        "p",
        "Borda-Auswertung: N−1 Punkte für Platz 1 bis 0 für den letzten Platz. Prozentwerte beziehen sich je Option auf die maximal möglichen Punkte.",
        "hint",
      ),
    );
  if (type === "multiple")
    box.append(
      el(
        "p",
        "Prozentwerte beziehen sich auf gültige Teilnehmende. Bei Mehrfachauswahl kann ihre Summe über 100 % liegen.",
        "hint",
      ),
    );
  for (const item of [...data.items].sort((a, b) => b.score - a.score)) {
    const row = el("div", undefined, "result");
    const line = el("div", undefined, "result-line");
    line.append(el("span", item.label), el("strong", `${item.percent} %`));
    const bar = el("div", undefined, "bar"),
      fill = el("div", undefined, "bar-fill");
    fill.style.setProperty("--value", item.percent + "%");
    bar.append(fill);
    row.append(line, bar);
    box.append(row);
  }
  if (data.tie)
    box.append(
      el(
        "p",
        data.runoffRequired
          ? "Gleichstand: Eine Stichwahl muss vom Product Owner vorbereitet werden."
          : "Gleichstand: gleiche Priorität.",
        "hint",
      ),
    );
  if (!data.items.length)
    box.append(
      el(
        "p",
        "Freitextbeiträge werden geschützt geprüft. Die Anzahl eingegangener Beiträge wird angezeigt.",
      ),
    );
  return box;
}
function render(data) {
  root.replaceChildren();
  root.append(
    el(
      "p",
      data.mode === "waiting"
        ? "ZWISCHEN ZWEI ENTSCHEIDUNGEN"
        : "COMMUNITY-UMFRAGE",
      "eyebrow",
    ),
  );
  if (data.mode === "waiting") {
    root.append(
      el("h1", "Der nächste Schritt entsteht gemeinsam."),
      el("p", data.message, "description"),
    );
    return;
  }
  const p = data.poll;
  root.append(el("h1", p.title), el("p", p.description, "description"));
  const meta = el("div", undefined, "meta");
  meta.append(
    el(
      "span",
      p.status === "active"
        ? "● Abstimmung geöffnet"
        : "Abstimmung abgeschlossen",
    ),
    el("span", "Ende: " + new Date(p.endsAt).toLocaleString("de-DE")),
    el("span", "Regelversion " + p.rules.version),
  );
  root.append(meta);
  const scheduleBox = el("section", undefined, "panel");
  root.append(scheduleBox);
  scheduleBox.hidden = true;
  api("/api/poll/" + p.id + "/schedule")
    .then((changes) => {
      if (!changes.length || !scheduleBox.isConnected) return;
      scheduleBox.hidden = false;
      scheduleBox.append(el("h2", "Änderungen der Zeitplanung"));
      for (const c of changes)
        scheduleBox.append(
          el(
            "p",
            new Date(c.changed_at.replace(" ", "T") + "Z").toLocaleString(
              "de-DE",
            ) +
              ": " +
              c.reason,
          ),
        );
    })
    .catch(() => {});
  if (p.rules.participation !== "anonymous" && data.verified) {
    const logout = el("button", "Teilnahme abmelden", "secondary");
    logout.onclick = async () => {
      await api("/api/participation/logout", { method: "POST" });
      render(await api("/api/poll"));
    };
    root.append(logout);
  }
  const ruleBox = el("details", undefined, "panel");
  ruleBox.append(el("summary", "Abstimmungsregeln"));
  const visibility = {
    hidden: "Ergebnisse werden nicht öffentlich angezeigt.",
    after_vote: "Ergebnisse nach der eigenen Stimmabgabe.",
    after_close: "Ergebnisse nach Ende der Umfrage.",
    after_release: "Ergebnisse nach ausdrücklicher Auswertungsfreigabe.",
  };
  ruleBox.append(
    el("p", visibility[p.rules.visibility]),
    el(
      "p",
      "Mindestbeteiligung: " +
        p.rules.quorum +
        " gültige Stimmen. " +
        (p.rules.tieRule === "runoff"
          ? "Bei Gleichstand wird eine Stichwahl vorbereitet."
          : "Bei Gleichstand gilt gleiche Priorität."),
    ),
  );
  root.append(ruleBox);
  if (data.results) {
    if (!p.released)
      root.append(
        el(
          "p",
          "Vorläufiger Stand: Die Auswertung ist noch nicht abschließend freigegeben.",
          "hint",
        ),
      );
    root.append(showResults(data.results, p.rules.type));
  }
  if (data.voted) {
    root.append(
      el("section", "Danke. Deine Stimme wurde gespeichert.", "panel"),
    );
    if (!data.results)
      root.append(
        el(
          "p",
          "Ergebnisse werden gemäß den festgelegten Sichtbarkeitsregeln angezeigt.",
          "hint",
        ),
      );
    return;
  }
  if (data.mode !== "poll") {
    if (!data.results)
      root.append(
        el("p", "Die Ergebnisse sind derzeit nicht freigegeben.", "panel"),
      );
    return;
  }
  if (p.rules.participation !== "anonymous" && !data.verified) {
    const form = el("form", undefined, "panel");
    const label = el("label", undefined, "field");
    label.append(el("span", "E-Mail-Adresse zur Teilnahme"));
    const input = el("input");
    input.type = "email";
    input.required = true;
    input.autocomplete = "email";
    input.maxLength = 254;
    label.append(input);
    form.append(
      el(
        "h2",
        p.rules.participation === "account"
          ? "Mit verifiziertem Konto teilnehmen"
          : "Teilnahme per E-Mail bestätigen",
      ),
      label,
      el(
        "p",
        "Wir senden einen einmaligen Anmeldelink. Deine Adresse wird nicht veröffentlicht und nicht für Werbung verwendet.",
        "hint",
      ),
    );
    const submit = el("button", "Bestätigungslink anfordern", "primary");
    submit.type = "submit";
    form.append(submit);
    form.onsubmit = async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const data = await api("/api/participation/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pollId: p.id, email: input.value }),
        });
        form.append(el("p", data.message, "hint"));
      } catch (err) {
        message.textContent = err.message;
        submit.disabled = false;
      }
    };
    root.append(form);
    return;
  }
  const form = el("form", undefined, "panel"),
    fs = el("fieldset");
  fs.append(
    el(
      "legend",
      p.rules.type === "ranking"
        ? "Bringe alle Optionen in deine Reihenfolge."
        : p.rules.type === "text"
          ? "Welche Idee möchtest du einbringen?"
          : "Wähle deine Antwort.",
    ),
  );
  let order = p.rules.options.map((_, i) => i);
  if (p.rules.type === "text") {
    const input = el("textarea");
    input.name = "answer";
    input.required = true;
    input.minLength = 3;
    input.maxLength = 2000;
    input.setAttribute("aria-label", "Deine Idee");
    fs.append(
      input,
      el(
        "p",
        "Bitte keine persönlichen oder vertraulichen Informationen eintragen.",
        "hint",
      ),
    );
    const label = el("label", undefined, "option"),
      check = el("input");
    check.type = "checkbox";
    check.name = "terms";
    check.required = true;
    label.append(
      check,
      el(
        "span",
        "Ich stimme den verlinkten Bedingungen für Beiträge und der dort beschriebenen Nutzungserlaubnis zu.",
      ),
    );
    fs.append(label);
  } else if (p.rules.type === "ranking") {
    const list = el("ol", undefined, "ranking");
    function draw() {
      list.replaceChildren();
      order.forEach((id, index) => {
        const li = el("li", undefined, "rank-row");
        li.append(el("span", `${index + 1}. ${p.rules.options[id]}`));
        for (const [direction, label] of [
          [-1, "Nach oben"],
          [1, "Nach unten"],
        ]) {
          const b = el("button", direction === -1 ? "↑" : "↓", "secondary");
          b.type = "button";
          b.setAttribute("aria-label", p.rules.options[id] + ": " + label);
          b.disabled =
            index + direction < 0 || index + direction >= order.length;
          b.onclick = () => {
            [order[index], order[index + direction]] = [
              order[index + direction],
              order[index],
            ];
            draw();
            const moved = list.children[index + direction];
            let target = moved.querySelector(
              direction === -1 ? "button" : "button:last-child",
            );
            if (target.disabled)
              target = moved.querySelector("button:not(:disabled)");
            target?.focus();
          };
          li.append(b);
        }
        list.append(li);
      });
    }
    draw();
    fs.append(list);
  } else {
    p.rules.options.forEach((option, id) => {
      const label = el("label", undefined, "option"),
        input = el("input");
      input.type = p.rules.type === "single" ? "radio" : "checkbox";
      input.name = "choice";
      input.value = id;
      if (input.type === "radio") input.required = true;
      label.append(input, el("span", option));
      fs.append(label);
    });
    if (p.rules.type === "multiple")
      fs.append(
        el(
          "p",
          `${p.rules.minChoices} bis ${p.rules.maxChoices} Antworten auswählen.`,
          "hint",
        ),
      );
  }
  fs.append(
    el(
      "p",
      "Anonyme Teilnahme: Eine Stimme je Browser. Das Löschen von Cookies oder weitere Geräte können technisch nicht zuverlässig ausgeschlossen werden.",
      "hint",
    ),
  );
  form.append(fs);
  const submit = el("button", "Stimme abgeben →", "primary");
  submit.type = "submit";
  form.append(submit);
  form.onsubmit = async (e) => {
    e.preventDefault();
    message.textContent = "";
    submit.disabled = true;
    try {
      const fd = new FormData(form);
      const answer =
        p.rules.type === "text"
          ? fd.get("answer")
          : p.rules.type === "ranking"
            ? order
            : fd.getAll("choice").map(Number);
      render(
        await api("/api/poll/" + p.id + "/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answer,
            termsAccepted: fd.get("terms") === "on",
          }),
        }),
      );
    } catch (err) {
      message.textContent = err.message;
      submit.disabled = false;
    }
  };
  root.append(form);
}
document.querySelectorAll("[data-legal]").forEach(
  (button) =>
    (button.onclick = async (event) => {
      event.preventDefault();
      try {
        const data = await api("/api/legal");
        const key = button.dataset.legal;
        document.querySelector("#legal-title").textContent = button.textContent;
        document.querySelector("#legal-text").textContent =
          key === "imprint"
            ? [data.operator, data.address, data.email]
                .filter(Boolean)
                .join("\n") ||
              "Betreiberangaben werden vor dem Livegang ergänzt."
            : data[key] ||
              "Dieser Text wird vor dem Livegang rechtlich geprüft und konfiguriert.";
        document.querySelector("#legal").showModal();
      } catch (e) {
        message.textContent = e.message;
      }
    }),
);
document.querySelectorAll("[data-legal]").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelector("#privacy-actions").hidden =
      button.dataset.legal !== "privacy";
    document.querySelector("#privacy-details").hidden =
      button.dataset.legal !== "privacy";
  }),
);
document.querySelector("#delete-data").onclick = async () => {
  if (
    !confirm(
      "Deine zuordenbaren Stimmen und Rohbeiträge löschen? Bereits freigegebene aggregierte Ergebnisse bleiben erhalten.",
    )
  )
    return;
  try {
    const data = await api("/api/privacy/data", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    document.querySelector("#legal-text").textContent = data.message;
    document.querySelector("#privacy-actions").hidden = true;
    document.querySelector("#privacy-details").replaceChildren();
    render(await api("/api/poll"));
  } catch (e) {
    document.querySelector("#legal-text").textContent = e.message;
  }
};
document.querySelector("#close-legal").onclick = () =>
  document.querySelector("#legal").close();
document
  .querySelector('[data-legal="privacy"]')
  .addEventListener("click", async () => {
    const box = document.querySelector("#privacy-details");
    box.replaceChildren();
    try {
      const data = await api("/api/privacy/export");
      for (const e of data.entries)
        for (const idea of e.ideas) {
          const form = el("form", undefined, "panel");
          form.append(
            el("h3", "Dein Beitrag: " + e.poll),
            el("p", idea.content),
            el("p", "Prüfstatus: " + idea.status, "hint"),
          );
          const label = el("label", undefined, "field");
          label.append(el("span", "Begründung eines Einspruchs"));
          const input = el("textarea");
          input.required = true;
          input.minLength = 10;
          input.maxLength = 2000;
          label.append(input);
          form.append(label);
          const b = el("button", "Einspruch einreichen", "secondary");
          b.type = "submit";
          form.append(b);
          form.onsubmit = async (event) => {
            event.preventDefault();
            b.disabled = true;
            try {
              await api("/api/privacy/appeal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ideaId: idea.id, content: input.value }),
              });
              form.append(
                el("p", "Der Einspruch wurde zur Prüfung gespeichert."),
              );
            } catch (err) {
              form.append(el("p", err.message));
              b.disabled = false;
            }
          };
          box.append(form);
        }
    } catch {
      /* no attributable identity */
    }
  });
async function loadPoll() {
  const token = new URLSearchParams(location.hash.slice(1)).get("verify");
  if (token) {
    history.replaceState(null, "", location.pathname);
    await api("/api/participation/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  }
  return api("/api/poll");
}
function refreshPoll() {
  return loadPoll()
    .then(render)
    .catch((e) => {
      root.replaceChildren(
        el("h1", "Kurz nicht erreichbar."),
        el("p", "Bitte versuche es später erneut."),
      );
      message.textContent = e.message;
    });
}
refreshPoll();
window.addEventListener("hashchange", () => {
  if (location.hash.includes("verify=")) refreshPoll();
});
