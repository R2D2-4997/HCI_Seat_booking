// ============================================================
// Actions sur le site : clic sur un siège, bouton de paiement
// Responsable : Personne 3
// ============================================================

// 8. CLIC DIRECT ET CIBLAGE PAIEMENT
function triggerDirectClick(r, c) {
  const key = `${r},${c}`;
  const targetEl = liveSession.seatElements[key];
  const seatInfo = liveSession.seats[key];

  if (seatInfo && seatInfo.id) {
    const selectorBtn = document.querySelector(`[data-seat="${seatInfo.id}"]`) ||
                        document.querySelector(`#seat-${seatInfo.id}`) ||
                        document.querySelector(`button[onclick*='${seatInfo.id}']`);
    if (selectorBtn) {
      selectorBtn.click();
      return;
    }
  }

  const elemToClick = targetEl || liveSession.canvasElem;
  if (elemToClick) {
    const rect = elemToClick.getBoundingClientRect();
    let clickX = rect.left + rect.width / 2;
    let clickY = rect.top + rect.height / 2;

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: clickX,
      clientY: clickY,
      view: window
    };

    const targetNode = document.elementFromPoint(clickX, clickY) || elemToClick;
    targetNode.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
    targetNode.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    targetNode.dispatchEvent(new PointerEvent("pointerup", eventOptions));
    targetNode.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    if (typeof targetNode.click === "function") {
      targetNode.click();
    } else {
      targetNode.dispatchEvent(new MouseEvent("click", eventOptions));
    }
  }
}

function findPaymentButton() {
  const candidates = querySelectorAllDeep("button, a, input[type='button'], input[type='submit'], [role='button']");

  for (const btn of candidates) {
    const text = (btn.textContent || btn.value || "").toLowerCase().trim();
    const dataTestId = (btn.getAttribute("data-test-id") || "").toLowerCase();

    if (
      dataTestId.includes("continue") || 
      dataTestId.includes("confirm") ||
      text.includes("continue") ||
      text.includes("passer au paiement") ||
      text.includes("confirm seats") ||
      text.includes("다음") || text.includes("결제") // Mots-clés coréens ("Suivant" / "Paiement")
    ) {
      return btn;
    }
  }

  return null;
}

function proceedToPayment() {
  const payBtn = findPaymentButton();
  const t = I18N[currentLang];

  if (payBtn) {
    playTone(1000, "sine", 0.4);
    speak(t.payment);
    payBtn.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      const rect = payBtn.getBoundingClientRect();
      const clickX = rect.left + rect.width / 2;
      const clickY = rect.top + rect.height / 2;

      const eventOptions = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: clickX,
        clientY: clickY,
        view: window
      };

      payBtn.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
      payBtn.dispatchEvent(new MouseEvent("mousedown", eventOptions));
      payBtn.dispatchEvent(new PointerEvent("pointerup", eventOptions));
      payBtn.dispatchEvent(new MouseEvent("mouseup", eventOptions));

      if (typeof payBtn.click === "function") {
        payBtn.click();
      } else {
        payBtn.dispatchEvent(new MouseEvent("click", eventOptions));
      }

      // Sur les sites SPA (ex: aller-retour Air France), le trajet suivant charge
      // sans recharger la page : on relance l'analyse automatiquement après transition.
      setTimeout(() => {
        if (typeof startAutoCapture === "function") {
          startAutoCapture();
        }
      }, 1800);
    }, 600);
  } else {
    speak(t.noPayment);
  }
}
