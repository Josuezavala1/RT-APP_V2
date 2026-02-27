(function () {
  // Locked isotope constants in mR/hr per Ci @ 1 ft.
  const ISOTOPE_CONSTANTS = {
    IR192: 5200,
    "Co-60": 14000,
    "Se-75": 2200,
  };

  const STORAGE_KEY = "rt-shot-safety-v2-state";

  const dom = {
    unitSite: document.getElementById("unitSite"),
    jobDate: document.getElementById("jobDate"),
    drawingNumber: document.getElementById("drawingNumber"),
    cml: document.getElementById("cml"),
    isotope: document.getElementById("isotope"),
    isotopeConstant: document.getElementById("isotopeConstant"),
    focusSpot: document.getElementById("focusSpot"),
    sourceActivity: document.getElementById("sourceActivity"),
    exposureTimeUnit: document.getElementById("exposureTimeUnit"),
    timePerExposure: document.getElementById("timePerExposure"),
    numberOfExposures: document.getElementById("numberOfExposures"),
    totalExposureMinutesOverride: document.getElementById("totalExposureMinutesOverride"),
    tungstenCollimatorHvl: document.getElementById("tungstenCollimatorHvl"),
    beamMinutesPerHour: document.getElementById("beamMinutesPerHour"),
    timeFraction: document.getElementById("timeFraction"),
    boundary2: document.getElementById("boundary2"),
    boundary100: document.getElementById("boundary100"),
    distanceNoShield: document.getElementById("distanceNoShield"),
    distanceWithShield: document.getElementById("distanceWithShield"),
    distanceEmergency: document.getElementById("distanceEmergency"),
    layersContainer: document.getElementById("layersContainer"),
    addLayerButton: document.getElementById("addLayerButton"),
    attenuationFactor: document.getElementById("attenuationFactor"),
    shotCardsContainer: document.getElementById("shotCardsContainer"),
    addShotButton: document.getElementById("addShotButton"),
    exposureDistance: document.getElementById("exposureDistance"),
    targetIntensity: document.getElementById("targetIntensity"),
    exposureTime: document.getElementById("exposureTime"),
    warningsList: document.getElementById("warningsList"),
    generatePdfButton: document.getElementById("generatePdfButton"),
  };

  let materialLayers = [];
  let shotCards = [];

  function numberValue(el) {
    const value = Number(el.value);
    return Number.isFinite(value) ? value : 0;
  }

  function requiredMissing() {
    return !dom.unitSite.value || !dom.jobDate.value || !dom.drawingNumber.value || numberValue(dom.focusSpot) <= 0 || numberValue(dom.sourceActivity) <= 0;
  }

  function getAttenuationFactor() {
    if (!materialLayers.length) {
      return 1;
    }

    return materialLayers.reduce((factor, layer) => {
      const hvlCount = Number(layer.hvlCount) || 0;
      const layerFactor = Math.pow(0.5, hvlCount);
      return factor * layerFactor;
    }, 1);
  }

  function getTimeFraction() {
    const totalMinutes = getTotalExposureMinutes();
    return totalMinutes > 0 ? totalMinutes / 60 : 0;
  }

  function getBeamMinutesPerHour() {
    return getTotalExposureMinutes();
  }

  function getTotalExposureMinutes() {
    const timePerExposureRaw = dom.timePerExposure.value;
    const numberOfExposuresRaw = dom.numberOfExposures.value;
    const overrideRaw = dom.totalExposureMinutesOverride.value;

    const overrideValue = Number(overrideRaw);
    if (overrideRaw !== "" && Number.isFinite(overrideValue) && overrideValue >= 0) {
      return overrideValue;
    }

    if (timePerExposureRaw === "" || numberOfExposuresRaw === "") {
      return 0;
    }

    const timePerExposure = Number(timePerExposureRaw);
    const numberOfExposures = Number(numberOfExposuresRaw);

    if (!Number.isFinite(timePerExposure) || !Number.isFinite(numberOfExposures) || timePerExposure < 0 || numberOfExposures < 0) {
      return 0;
    }

    const minutesPerExposure = dom.exposureTimeUnit.value === "seconds" ? timePerExposure / 60 : timePerExposure;
    return minutesPerExposure * numberOfExposures;
  }

  function getMaterialStackHvlTotal() {
    if (!materialLayers.length) {
      return 0;
    }

    return materialLayers.reduce((total, layer) => total + (Number(layer.hvlCount) || 0), 0);
  }

  function getDistanceWithoutShield(limit = 2) {
    const ci = numberValue(dom.sourceActivity);
    const constant = ISOTOPE_CONSTANTS[dom.isotope.value] || 0;
    const dutyCycle = getTimeFraction();

    if (limit <= 0 || ci <= 0 || constant <= 0 || dutyCycle <= 0) {
      return 0;
    }

    return Math.sqrt((ci * constant * dutyCycle) / limit);
  }

  function getDistanceWithAllShielding(limit = 2) {
    const ci = numberValue(dom.sourceActivity);
    const constant = ISOTOPE_CONSTANTS[dom.isotope.value] || 0;
    const dutyCycle = getTimeFraction();
    const totalHvl = numberValue(dom.tungstenCollimatorHvl) + getMaterialStackHvlTotal();
    const attenuation = Math.pow(0.5, totalHvl);

    if (limit <= 0 || ci <= 0 || constant <= 0 || dutyCycle <= 0 || attenuation <= 0) {
      return 0;
    }

    return Math.sqrt((ci * constant * attenuation * dutyCycle) / limit);
  }

  function getEmergencyDistance(limit = 2) {
    const ci = numberValue(dom.sourceActivity);
    const constant = ISOTOPE_CONSTANTS[dom.isotope.value] || 0;

    if (limit <= 0 || ci <= 0 || constant <= 0) {
      return 0;
    }

    return Math.sqrt((ci * constant) / limit);
  }

  function getBoundaryDistance(limit) {
    const ci = numberValue(dom.sourceActivity);
    const constant = ISOTOPE_CONSTANTS[dom.isotope.value] || 0;
    const timeFraction = getTimeFraction();
    const attenuation = getAttenuationFactor();

    if (limit <= 0 || ci <= 0 || constant <= 0 || timeFraction <= 0 || attenuation <= 0) {
      return 0;
    }

    return Math.sqrt((ci * constant * timeFraction * attenuation) / limit);
  }

  function getShotResult(shot) {
    const d = numberValue(dom.focusSpot);
    const pdd = Number(shot.pdd) || 0;
    const spd = Number(shot.spd) || 0;

    if (d <= 0 || pdd <= 0 || spd <= 0) {
      return {
        spd,
        ug: 0,
        magnification: 0,
        blowUpPercent: 0,
        requiredSpdForUg: 0,
        requiredSpdForBlowUp: 0,
        requiredSpdFinal: 0,
      };
    }

    const ug = (d * pdd) / spd;
    const magnification = (spd + pdd) / spd;
    const blowUpPercent = (pdd / spd) * 100;
    const requiredSpdForUg = (d * pdd) / 0.024;
    const requiredSpdForBlowUp = pdd / 0.2;
    const requiredSpdFinal = Math.max(requiredSpdForUg, requiredSpdForBlowUp);

    return {
      spd,
      ug,
      magnification,
      blowUpPercent,
      requiredSpdForUg,
      requiredSpdForBlowUp,
      requiredSpdFinal,
    };
  }

  function getExposureMinutes() {
    const ci = numberValue(dom.sourceActivity);
    const constant = ISOTOPE_CONSTANTS[dom.isotope.value] || 0;
    const distance = numberValue(dom.exposureDistance);
    const attenuation = getAttenuationFactor();
    const targetIntensity = numberValue(dom.targetIntensity);

    if (ci <= 0 || constant <= 0 || distance <= 0 || attenuation <= 0 || targetIntensity <= 0) {
      return 0;
    }

    // Intensity at distance with attenuation in mR/hr.
    const intensity = (ci * constant * attenuation) / (distance * distance);
    // Time in hours needed for target intensity ratio, then convert to minutes.
    const hours = targetIntensity / intensity;
    return Math.max(hours * 60, 0);
  }

  function renderLayers() {
    dom.layersContainer.innerHTML = "";

    materialLayers.forEach((layer, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "layer-card";

      wrapper.innerHTML = `
        <div class="card-row-title">
          <span>Layer ${index + 1}</span>
          <button type="button" class="btn-remove" data-remove-layer="${layer.id}">Remove</button>
        </div>
        <div class="field-grid">
          <label>Material</label>
          <select data-layer-field="material" data-layer-id="${layer.id}">
            <option value="Steel" ${layer.material === "Steel" ? "selected" : ""}>Steel</option>
            <option value="Concrete" ${layer.material === "Concrete" ? "selected" : ""}>Concrete</option>
            <option value="Lead" ${layer.material === "Lead" ? "selected" : ""}>Lead</option>
            <option value="Tungsten" ${layer.material === "Tungsten" ? "selected" : ""}>Tungsten</option>
          </select>
          <label>Thickness (inches)</label>
          <input type="number" min="0" step="0.001" data-layer-field="thickness" data-layer-id="${layer.id}" value="${layer.thickness}" />
          <label>HVL count</label>
          <input type="number" min="0" step="0.001" data-layer-field="hvlCount" data-layer-id="${layer.id}" value="${layer.hvlCount}" />
        </div>
      `;

      dom.layersContainer.appendChild(wrapper);
    });
  }

  function renderShots() {
    dom.shotCardsContainer.innerHTML = "";

    shotCards.forEach((shot, index) => {
      const result = getShotResult(shot);
      const wrapper = document.createElement("div");
      wrapper.className = "shot-card";

      wrapper.innerHTML = `
        <div class="card-row-title">
          <span>Shot ${index + 1}</span>
          <button type="button" class="btn-remove" data-remove-shot="${shot.id}">Remove</button>
        </div>
        <div class="field-grid">
          <label>PDD (Pipe-Detector Distance) (in)</label>
          <input type="number" min="0" step="0.001" data-shot-field="pdd" data-shot-id="${shot.id}" value="${shot.pdd}" />
          <label>SPD (Source-Pipe Distance) (in)</label>
          <input type="number" min="0" step="0.001" data-shot-field="spd" data-shot-id="${shot.id}" value="${shot.spd}" />
        </div>
        <div class="result-grid">
          <div class="result-item"><strong>Computed UG:</strong> ${result.ug.toFixed(4)}</div>
          <div class="result-item"><strong>Computed Magnification:</strong> ${result.magnification.toFixed(4)}</div>
          <div class="result-item"><strong>Blow-up %:</strong> ${result.blowUpPercent.toFixed(1)}%</div>
          <div class="result-item"><strong>Required SPD for UG limit:</strong> ${result.requiredSpdForUg.toFixed(3)} in</div>
          <div class="result-item"><strong>Required SPD for 20% mag:</strong> ${result.requiredSpdForBlowUp.toFixed(3)} in</div>
          <div class="result-item"><strong>Required SPD final:</strong> ${result.requiredSpdFinal.toFixed(3)} in</div>
          ${result.ug > 0.024 ? '<div class="result-item warning-red">Warning: UG exceeds 0.024.</div>' : ""}
          ${result.blowUpPercent > 20 ? '<div class="result-item warning-red">Warning: Magnification exceeds 20%.</div>' : ""}
        </div>
      `;

      dom.shotCardsContainer.appendChild(wrapper);
    });
  }

  function renderWarnings() {
    const warnings = [];
    if (requiredMissing()) {
      warnings.push({ text: "Missing required inputs in Job Information or Source Information.", css: "warning-yellow" });
    }

    shotCards.forEach((shot, index) => {
      const result = getShotResult(shot);
      if (result.ug > 0.024) {
        warnings.push({ text: `Shot ${index + 1}: UG exceeds 0.024.`, css: "warning-red" });
      }
      if (result.blowUpPercent > 20) {
        warnings.push({ text: `Shot ${index + 1}: Magnification exceeds 20%.`, css: "warning-red" });
      }
    });

    if (!warnings.length) {
      warnings.push({ text: "No active warnings.", css: "" });
    }

    dom.warningsList.innerHTML = warnings.map((warning) => `<li class="${warning.css}">${warning.text}</li>`).join("");
  }

  function saveState() {
    const state = {
      unitSite: dom.unitSite.value,
      jobDate: dom.jobDate.value,
      drawingNumber: dom.drawingNumber.value,
      cml: dom.cml.value,
      isotope: dom.isotope.value,
      focusSpot: dom.focusSpot.value,
      sourceActivity: dom.sourceActivity.value,
      exposureTimeUnit: dom.exposureTimeUnit.value,
      timePerExposure: dom.timePerExposure.value,
      numberOfExposures: dom.numberOfExposures.value,
      totalExposureMinutesOverride: dom.totalExposureMinutesOverride.value,
      tungstenCollimatorHvl: dom.tungstenCollimatorHvl.value,
      layers: materialLayers,
      shots: shotCards,
      exposureDistance: dom.exposureDistance.value,
      targetIntensity: dom.targetIntensity.value,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const state = JSON.parse(raw);
      dom.unitSite.value = state.unitSite || "";
      dom.jobDate.value = state.jobDate || "";
      dom.drawingNumber.value = state.drawingNumber || "";
      dom.cml.value = state.cml || "";
      dom.isotope.value = state.isotope || "IR192";
      dom.focusSpot.value = state.focusSpot || "";
      dom.sourceActivity.value = state.sourceActivity || "";
      dom.exposureTimeUnit.value = state.exposureTimeUnit || "minutes";
      dom.timePerExposure.value = state.timePerExposure || state.minutesPerExposure || ((Number(state.secondsPerExposure) || 0) / 60);
      dom.numberOfExposures.value = state.numberOfExposures || state.exposuresPerHour || 0;
      dom.totalExposureMinutesOverride.value = state.totalExposureMinutesOverride || "";
      dom.tungstenCollimatorHvl.value = state.tungstenCollimatorHvl || 0;
      materialLayers = Array.isArray(state.layers) ? state.layers : [];
      shotCards = Array.isArray(state.shots)
        ? state.shots.map((shot) => ({
            ...shot,
            spd: shot.spd ?? 0,
          }))
        : [];
      dom.exposureDistance.value = state.exposureDistance || 0;
      dom.targetIntensity.value = state.targetIntensity || 2;
    } catch (_e) {
      // If stored JSON is malformed, ignore it and proceed with defaults.
    }
  }

  function updateAll() {
    dom.isotopeConstant.value = ISOTOPE_CONSTANTS[dom.isotope.value];

    const timeFraction = getTimeFraction();
    dom.beamMinutesPerHour.textContent = getBeamMinutesPerHour().toFixed(1);
    dom.timeFraction.textContent = timeFraction.toFixed(4);

    dom.attenuationFactor.textContent = getAttenuationFactor().toFixed(6);
    dom.boundary2.textContent = `${getBoundaryDistance(2).toFixed(1)} ft`;
    dom.boundary100.textContent = `${getBoundaryDistance(100).toFixed(1)} ft`;
    dom.distanceNoShield.textContent = `${getDistanceWithoutShield(2).toFixed(1)} ft`;
    dom.distanceWithShield.textContent = `${getDistanceWithAllShielding(2).toFixed(1)} ft`;
    dom.distanceEmergency.textContent = `${getEmergencyDistance(2).toFixed(1)} ft`;
    dom.exposureTime.textContent = `${getExposureMinutes().toFixed(1)} minutes`;

    renderLayers();
    renderShots();
    renderWarnings();
    saveState();
  }

  function addLayer() {
    materialLayers.push({
      id: crypto.randomUUID(),
      material: "Steel",
      thickness: 0,
      hvlCount: 0,
    });
    updateAll();
  }

  function addShot() {
    shotCards.push({
      id: crypto.randomUUID(),
      pdd: 0,
      spd: 0,
    });
    updateAll();
  }

  function onContainerChange(event) {
    const layerId = event.target.getAttribute("data-layer-id");
    const layerField = event.target.getAttribute("data-layer-field");
    if (layerId && layerField) {
      const layer = materialLayers.find((item) => item.id === layerId);
      if (layer) {
        layer[layerField] = event.target.value;
        updateAll();
        return;
      }
    }

    const shotId = event.target.getAttribute("data-shot-id");
    const shotField = event.target.getAttribute("data-shot-field");
    if (shotId && shotField) {
      const shot = shotCards.find((item) => item.id === shotId);
      if (shot) {
        shot[shotField] = event.target.value;
        updateAll();
      }
    }
  }

  function onContainerClick(event) {
    const removeLayerId = event.target.getAttribute("data-remove-layer");
    if (removeLayerId) {
      materialLayers = materialLayers.filter((layer) => layer.id !== removeLayerId);
      updateAll();
      return;
    }

    const removeShotId = event.target.getAttribute("data-remove-shot");
    if (removeShotId) {
      shotCards = shotCards.filter((shot) => shot.id !== removeShotId);
      updateAll();
    }
  }

  function generatePdf() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "letter" });
    let y = 40;

    function line(text, gap = 16) {
      pdf.text(text, 40, y);
      y += gap;
      if (y > 740) {
        pdf.addPage();
        y = 40;
      }
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    line("RT Shot & Safety Calculator v2 Report", 22);
    pdf.setFontSize(10);

    pdf.setFont("helvetica", "bold");
    line("Section 1 — Job Information");
    pdf.setFont("helvetica", "normal");
    line(`Unit / Site: ${dom.unitSite.value || "-"}`);
    line(`Date: ${dom.jobDate.value || "-"}`);
    line(`Drawing Number: ${dom.drawingNumber.value || "-"}`);
    line(`CML: ${dom.cml.value || "-"}`);

    pdf.setFont("helvetica", "bold");
    line("Section 2 — Source Information");
    pdf.setFont("helvetica", "normal");
    line(`Isotope: ${dom.isotope.value}`);
    line(`Constant (mR/hr per Ci @ 1 ft): ${ISOTOPE_CONSTANTS[dom.isotope.value]}`);
    line(`Focus Spot (d): ${dom.focusSpot.value || "0"}`);
    line(`Source Activity (Ci): ${dom.sourceActivity.value || "0"}`);

    pdf.setFont("helvetica", "bold");
    line("Section 3 — Boundary Distances");
    pdf.setFont("helvetica", "normal");
    line(`Time Fraction: ${getTimeFraction().toFixed(4)}`);
    line(`2 mR/hr Boundary: ${getBoundaryDistance(2).toFixed(1)} ft`);
    line(`100 mR/hr Boundary: ${getBoundaryDistance(100).toFixed(1)} ft`);

    pdf.setFont("helvetica", "bold");
    line("Section 4 — Material Layers");
    pdf.setFont("helvetica", "normal");
    if (materialLayers.length === 0) {
      line("No material layers entered.");
    } else {
      materialLayers.forEach((layer, index) => {
        line(`Layer ${index + 1}: ${layer.material}, Thickness ${layer.thickness} in, HVL ${layer.hvlCount}`);
      });
    }
    line(`Total attenuation factor: ${getAttenuationFactor().toFixed(6)}`);

    pdf.setFont("helvetica", "bold");
    line("Section 5 — Shot Cards");
    pdf.setFont("helvetica", "normal");
    if (shotCards.length === 0) {
      line("No shots entered.");
    } else {
      shotCards.forEach((shot, index) => {
        const result = getShotResult(shot);
        line(`Shot ${index + 1}: PDD ${Number(shot.pdd || 0).toFixed(3)} in | SPD ${Number(shot.spd || 0).toFixed(3)} in`);
        line(`  UG ${result.ug.toFixed(4)} | Mag ${result.magnification.toFixed(4)} | Blow-up ${result.blowUpPercent.toFixed(1)}%`);
        line(`  Req SPD (UG): ${result.requiredSpdForUg.toFixed(3)} in | Req SPD (20%): ${result.requiredSpdForBlowUp.toFixed(3)} in | Req SPD Final: ${result.requiredSpdFinal.toFixed(3)} in`);
      });
    }

    pdf.setFont("helvetica", "bold");
    line("Section 6 — Exposure Time");
    pdf.setFont("helvetica", "normal");
    line(`Estimated exposure time: ${getExposureMinutes().toFixed(1)} minutes`);

    pdf.save("RT_Shot_Safety_Report_v2.pdf");
  }

  loadState();

  if (!materialLayers.length) {
    addLayer();
  }
  if (!shotCards.length) {
    addShot();
  }

  [
    dom.unitSite,
    dom.jobDate,
    dom.drawingNumber,
    dom.cml,
    dom.isotope,
    dom.focusSpot,
    dom.sourceActivity,
    dom.exposureTimeUnit,
    dom.timePerExposure,
    dom.numberOfExposures,
    dom.totalExposureMinutesOverride,
    dom.tungstenCollimatorHvl,
    dom.exposureDistance,
    dom.targetIntensity,
  ].forEach((element) => {
    element.addEventListener("input", updateAll);
    element.addEventListener("change", updateAll);
  });

  dom.addLayerButton.addEventListener("click", addLayer);
  dom.addShotButton.addEventListener("click", addShot);
  dom.layersContainer.addEventListener("input", onContainerChange);
  dom.layersContainer.addEventListener("change", onContainerChange);
  dom.layersContainer.addEventListener("click", onContainerClick);
  dom.shotCardsContainer.addEventListener("input", onContainerChange);
  dom.shotCardsContainer.addEventListener("change", onContainerChange);
  dom.shotCardsContainer.addEventListener("click", onContainerClick);
  dom.generatePdfButton.addEventListener("click", generatePdf);

  updateAll();
})();
