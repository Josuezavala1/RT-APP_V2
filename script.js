(function () {
  const storageKey = "rt-app-v2-draft-inputs";
  const inputs = document.querySelectorAll("input");

  function loadSavedInputs() {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      return;
    }

    let savedValues;
    try {
      savedValues = JSON.parse(raw);
    } catch (_error) {
      return;
    }

    inputs.forEach((input) => {
      if (savedValues[input.id] !== undefined) {
        input.value = savedValues[input.id];
      }
    });
  }

  function persistInputs() {
    const payload = {};
    inputs.forEach((input) => {
      payload[input.id] = input.value;
    });
    sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }

  loadSavedInputs();
  inputs.forEach((input) => {
    input.addEventListener("input", persistInputs);
  });
})();
