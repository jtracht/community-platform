(() => {
  const panel = document.querySelector("#donation-panel"),
    open = document.querySelector("#donate-open"),
    close = document.querySelector("#donate-close"),
    form = document.querySelector("#support-form"),
    message = document.querySelector("#support-message");
  let config,
    checkout,
    loadingScript,
    initializing = false;
  async function request(url, body) {
    const response = await fetch(
      url,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Zahlung ist gerade nicht erreichbar.");
    return data;
  }
  function hide() {
    panel.hidden = true;
    open.setAttribute("aria-expanded", "false");
    open.focus();
  }
  close.onclick = hide;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) hide();
  });
  open.onclick = async () => {
    if (!panel.hidden) {
      hide();
      return;
    }
    panel.hidden = false;
    open.setAttribute("aria-expanded", "true");
    close.focus();
    if (config || checkout) return;
    try {
      config = await request("/api/support");
      form.hidden = !config.embedded;
      message.textContent = config.embedded
        ? "Freiwillige Unterstützung. Du bestimmst den Betrag."
        : "Die Zahlung direkt auf dieser Seite wird noch eingerichtet.";
    } catch (error) {
      message.textContent = error.message;
    }
  };
  function loadStripe() {
    if (window.Stripe) return Promise.resolve();
    if (!loadingScript)
      loadingScript = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/endive/stripe.js";
        script.onload = resolve;
        script.onerror = () => {
          loadingScript = null;
          script.remove();
          reject(new Error("Stripe konnte nicht geladen werden."));
        };
        document.head.append(script);
      });
    return loadingScript;
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (initializing || checkout) return;
    const amount = Math.round(
      Number(document.querySelector("#support-amount").value) * 100,
    );
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100000) {
      message.textContent =
        "Bitte wähle einen Betrag zwischen 1 und 1.000 Euro.";
      return;
    }
    initializing = true;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      message.textContent = "Zahlungsformular wird geladen.";
      await loadStripe();
      const session = await request("/api/support/session", {
        amount,
        requestId: crypto.randomUUID(),
      });
      checkout = await window
        .Stripe(config.publishableKey)
        .createEmbeddedCheckoutPage({
          clientSecret: session.clientSecret,
          onComplete: async () => {
            try {
              const status = await request("/api/support/status", {
                id: session.id,
                expires: session.expires,
                proof: session.proof,
              });
              message.textContent = status.paid
                ? "Danke für deine Unterstützung. Stripe hat die Zahlung bestätigt."
                : "Stripe hat die Zahlung noch nicht bestätigt.";
            } catch (error) {
              message.textContent = error.message;
            }
          },
        });
      checkout.mount("#stripe-checkout");
      form.hidden = true;
      message.textContent = "";
    } catch (error) {
      message.textContent = error.message;
      checkout?.destroy();
      checkout = null;
    } finally {
      initializing = false;
      button.disabled = false;
    }
  };
})();
