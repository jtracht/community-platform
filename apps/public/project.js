fetch("/api/project")
  .then(async (response) => {
    if (!response.ok) throw new Error();
    return response.json();
  })
  .then((data) => {
    const format = new Intl.NumberFormat("de-DE");
    document.querySelector("#stat-polls").textContent = format.format(
      data.polls,
    );
    document.querySelector("#stat-votes").textContent = format.format(
      data.votes,
    );
    document.querySelector("#project-operator").textContent = data.operator
      ? "Ein Projekt von " + data.operator + "."
      : "";
    document.querySelector("#stats-note").textContent =
      "Entwürfe zählen nicht mit. Freigegebene Auswertungen bleiben auch nach Löschung der Rohdaten erhalten.";
  })
  .catch(() => {
    document.querySelector("#stats-note").textContent =
      "Statistiken sind gerade nicht erreichbar.";
  });
