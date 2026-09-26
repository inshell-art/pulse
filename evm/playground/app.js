const STORAGE_KEY = "pulse-core-playground/v1";
const SIX_HOURS = 360;
const WEI = 10n ** 18n;
const presetValues = {
  balanced: { target: "1.00", floor: "0.20", decay: "45", rebound: "0.24" },
  slow: { target: "1.50", floor: "0.35", decay: "110", rebound: "0.18" },
  lively: { target: "0.75", floor: "0.10", decay: "15", rebound: "0.76" }
};
const controls = Object.fromEntries(["target", "floor", "decay", "rebound"].map((name) => [name, document.getElementById(name)]));
const timeSlider = document.getElementById("time-slider");
const networkStatus = document.getElementById("network-status");
const networkDot = document.getElementById("network-dot");
const askValue = document.getElementById("ask-value");
const askLabel = document.getElementById("ask-label");
const readoutSub = document.getElementById("readout-sub");
const floorReadout = document.getElementById("floor-readout");
const epochChip = document.getElementById("epoch-chip");
const timeValue = document.getElementById("time-value");
const buyButton = document.getElementById("buy-button");
const actionHelp = document.getElementById("action-help");
const chart = document.getElementById("chart");
const storyList = document.getElementById("story-list");
const saleCount = document.getElementById("sale-count");
const pulseSummary = document.getElementById("pulse-summary");
const historyDetails = document.getElementById("history-details");
const projectionMode = document.getElementById("projection-mode");
const waitReadout = document.getElementById("wait-readout");
const pumpReadout = document.getElementById("pump-readout");
const actualPumpReadout = document.getElementById("actual-pump-readout");
const nextAskReadout = document.getElementById("next-ask-readout");
const svgNS = "http://www.w3.org/2000/svg";
let scenario;
let ready = false;
let busy = false;
let generation = 0;
let quoteTimer;

function ethWei(decimal) {
  const [whole, fraction = ""] = String(decimal).split(".");
  return BigInt(whole) * WEI + BigInt((fraction + "0".repeat(18)).slice(0, 18));
}

function ethNumber(wei) {
  return Number(BigInt(wei)) / 1e18;
}

function ethText(wei, digits = 4) {
  return ethNumber(wei).toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function selectedControls() {
  return Object.fromEntries(Object.entries(controls).map(([name, input]) => [name, input.value]));
}

function setControls(values) {
  for (const [name, input] of Object.entries(controls)) {
    const candidate = Number(values?.[name]);
    input.value = Number.isFinite(candidate) && candidate >= Number(input.min) && candidate <= Number(input.max)
      ? String(candidate) : presetValues.balanced[name];
  }
  normalizePrices();
  updateControlLabels();
}

function normalizePrices(changed) {
  const target = Number(controls.target.value);
  const floor = Number(controls.floor.value);
  if (target <= floor) {
    if (changed === "floor") controls.target.value = Math.min(2.5, floor + 0.05).toFixed(2);
    else controls.floor.value = Math.max(0, target - 0.05).toFixed(2);
  }
}

function updateControlLabels() {
  document.getElementById("target-value").textContent = `${Number(controls.target.value).toFixed(2)} ETH`;
  document.getElementById("floor-value").textContent = `${Number(controls.floor.value).toFixed(2)} ETH`;
  document.getElementById("decay-value").textContent = `${controls.decay.value} min`;
  document.getElementById("rebound-value").textContent = `${Number(controls.rebound.value).toFixed(2)} ETH / hr`;
  const values = selectedControls();
  for (const button of document.querySelectorAll(".preset")) {
    const preset = presetValues[button.dataset.preset];
    button.classList.toggle("active", Object.keys(preset).every((name) => Number(preset[name]) === Number(values[name])));
  }
}

function configFrom(values) {
  const target = ethWei(values.target);
  const floor = ethWei(values.floor);
  const gap = target - floor;
  if (gap <= 0n) throw new Error("Genesis price must exceed the genesis floor");
  return {
    k: (gap * BigInt(values.decay) * 60n).toString(),
    genesisPrice: target.toString(),
    genesisFloor: floor.toString(),
    pts: (ethWei(values.rebound) / 3600n).toString()
  };
}

async function callCore(body) {
  const response = await fetch("/api/call", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Pulse-Playground": "1" },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Sepolia calculation failed");
  return value;
}

function save() {
  if (!scenario) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
  } catch {
    actionHelp.textContent = "This browser could not save your scenario locally.";
  }
}

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value?.schema !== 1 || !value.initialState || !Array.isArray(value.steps) || value.steps.length > 100) return null;
    if (!Number.isInteger(value.cursorMinute) || value.cursorMinute < 0 || value.cursorMinute > SIX_HOURS) return null;
    if (!/^\d{10,20}$/.test(value.startTime)) return null;
    setControls(value.controls);
    if (JSON.stringify(configFrom(selectedControls())) !== JSON.stringify(value.config)) return null;
    return value;
  } catch {
    return null;
  }
}

function absoluteTime(minute) {
  return (BigInt(scenario.startTime) + BigInt(minute) * 60n).toString();
}

function localQuote(state, minute) {
  const config = scenario.config;
  const timestamp = BigInt(absoluteTime(minute));
  const openTime = BigInt(state.openTime);
  const effective = BigInt(state.epochIndex) === 0n && timestamp < openTime ? openTime : timestamp;
  const anchor = BigInt(state.anchorTime);
  const increment = effective <= anchor ? BigInt(config.k) : BigInt(config.k) / (effective - anchor);
  return BigInt(state.floorPrice) + increment;
}

function localTransition(state, minute) {
  const timestamp = BigInt(absoluteTime(minute));
  const elapsed = timestamp - BigInt(state.curveStartTime);
  const premium = (elapsed > 0n ? elapsed : 1n) * BigInt(scenario.config.pts);
  const ask = localQuote(state, minute);
  const nextState = {
    epochIndex: (BigInt(state.epochIndex) + 1n).toString(),
    openTime: state.openTime,
    curveStartTime: timestamp.toString(),
    anchorTime: (timestamp - BigInt(scenario.config.k) / premium).toString(),
    floorPrice: ask.toString()
  };
  const nextAsk = localQuote(nextState, minute);
  return { elapsed, premium, ask, nextAsk, actualLift: nextAsk - ask, nextState };
}

function waitText(seconds) {
  const minutes = Number(seconds) / 60;
  if (minutes === 0) return "0 sec";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

function drawPriceTime(state, minute) {
  const saleIndex = scenario.steps.findIndex((step) => step.minute === minute);
  const recordedSale = saleIndex >= 0 ? scenario.steps[saleIndex] : null;
  const previousState = recordedSale
    ? (saleIndex === 0 ? scenario.initialState : scenario.steps[saleIndex - 1].nextState)
    : state;
  const transition = localTransition(previousState, minute);
  const nextAsk = recordedSale ? localQuote(recordedSale.nextState, minute) : transition.nextAsk;
  const actualLift = recordedSale ? nextAsk - BigInt(recordedSale.ask) : transition.actualLift;
  projectionMode.textContent = recordedSale
    ? "Simulated purchase · calculated by Sepolia Core"
    : "If you buy at this moment · local preview";
  if (recordedSale) {
    const marker = document.createElement("sup");
    const noteLink = document.createElement("a");
    noteLink.href = "#sepolia-core-note";
    noteLink.setAttribute("aria-label", "About the Sepolia Core calculation");
    noteLink.textContent = "*";
    marker.append(noteLink);
    projectionMode.append(marker);
    projectionMode.setAttribute("aria-describedby", "sepolia-core-note");
  } else {
    projectionMode.removeAttribute("aria-describedby");
  }
  if (transition.elapsed === 0n) projectionMode.append(" · one-second minimum wait for the price increase");
  askLabel.textContent = recordedSale ? "Next ask after your purchase" : "Ask at this moment";
  waitReadout.textContent = waitText(transition.elapsed);
  pumpReadout.textContent = `+${ethText(transition.premium, 6)} ETH`;
  actualPumpReadout.textContent = `+${ethText(actualLift, 6)} ETH`;
  nextAskReadout.textContent = `${ethText(nextAsk, 6)} ETH`;
  const wait = waitText(transition.elapsed);
  pulseSummary.textContent = recordedSale
    ? `You bought at ${ethText(recordedSale.ask)} ETH after ${wait}. The next ask is ${ethText(nextAsk)} ETH, with a new floor of ${ethText(recordedSale.ask)} ETH.`
    : `After ${wait}, buying at ${ethText(transition.ask)} ETH targets a ${ethText(transition.premium)} ETH price increase. The next ask would be ${ethText(nextAsk)} ETH.`;
}

function stateAt(minute) {
  let state = scenario.initialState;
  for (const step of scenario.steps) {
    if (step.minute > minute) break;
    state = step.nextState;
  }
  return state;
}

function timeText(minute) {
  if (minute === 0) return "at opening";
  if (minute < 60) return `${minute} min after open`;
  const hours = Math.floor(minute / 60);
  const rest = minute % 60;
  return `${hours} hr${rest ? ` ${rest} min` : ""} after open`;
}

function svg(tag, attributes, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawChart() {
  const width = Math.max(230, Math.round(chart.getBoundingClientRect().width));
  const height = Math.round(chart.getBoundingClientRect().height);
  const compact = width < 480;
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const segments = [];
  let currentState = scenario.initialState;
  let from = 0;
  for (const step of scenario.steps) {
    segments.push({ from, to: step.minute, state: currentState, past: true });
    currentState = step.nextState;
    from = step.minute;
  }
  segments.push({ from, to: SIX_HOURS, state: currentState, past: false });
  const paths = segments.map((segment) => {
    const count = Math.max(2, Math.ceil((segment.to - segment.from) / 4));
    const points = Array.from({ length: count + 1 }, (_, index) => {
      const minute = segment.from + Math.round((segment.to - segment.from) * index / count);
      return { minute, price: ethNumber(localQuote(segment.state, minute)) };
    });
    return { ...segment, points };
  });
  const values = paths.flatMap((path) => path.points.map((point) => point.price));
  const max = Math.max(0.1, ...values) * 1.12;
  const left = compact ? 40 : 48;
  const right = width - 12;
  const top = 18;
  const bottom = height - 34;
  const x = (minute) => left + (right - left) * minute / SIX_HOURS;
  const y = (price) => bottom - (bottom - top) * price / max;
  chart.replaceChildren();

  for (let index = 0; index <= 4; index++) {
    const value = max * index / 4;
    const lineY = y(value);
    chart.append(svg("line", { x1: left, x2: right, y1: lineY, y2: lineY, stroke: "var(--chart-grid)", "stroke-width": 1 }));
    chart.append(svg("text", { x: left - 8, y: lineY + 4, "text-anchor": "end", fill: "var(--chart-label)", "font-size": 11, "font-family": "monospace" }, value.toFixed(2)));
  }
  for (let hour = 0; hour <= 6; hour++) {
    if (compact && hour % 2 !== 0) continue;
    const pos = x(hour * 60);
    chart.append(svg("text", { x: pos, y: height - 6, "text-anchor": hour === 0 ? "start" : hour === 6 ? "end" : "middle", fill: "var(--chart-label)", "font-size": 11, "font-family": "monospace" }, `${hour}h`));
  }
  for (const segment of paths) {
    const d = segment.points.map((point, index) => `${index ? "L" : "M"}${x(point.minute).toFixed(2)} ${y(point.price).toFixed(2)}`).join(" ");
    chart.append(svg("path", { d, fill: "none", stroke: segment.past ? "var(--chart-past)" : "var(--chart-active)", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  }
  for (const step of scenario.steps) {
    const pos = x(step.minute);
    const saleY = y(ethNumber(step.ask));
    const nextY = y(ethNumber(localQuote(step.nextState, step.minute)));
    chart.append(svg("line", { x1: pos, x2: pos, y1: saleY, y2: nextY, stroke: "var(--orange)", "stroke-width": 2, "stroke-dasharray": "4 4" }));
    chart.append(svg("circle", { cx: pos, cy: saleY, r: 7, fill: "var(--orange)", stroke: "var(--panel)", "stroke-width": 3 }));
  }
  const selectedState = stateAt(scenario.cursorMinute);
  const selectedY = y(ethNumber(localQuote(selectedState, scenario.cursorMinute)));
  const selectedX = x(scenario.cursorMinute);
  chart.append(svg("line", { x1: selectedX, x2: selectedX, y1: top, y2: bottom, stroke: "var(--chart-cursor)", "stroke-width": 1.5, "stroke-dasharray": "4 5" }));
  chart.append(svg("circle", { cx: selectedX, cy: selectedY, r: 8, fill: "var(--chart-active)", stroke: "var(--panel)", "stroke-width": 4 }));
}

function drawStory() {
  storyList.replaceChildren();
  saleCount.textContent = `(${scenario.steps.length})`;
  historyDetails.hidden = scenario.steps.length === 0;
  for (const [index, step] of scenario.steps.entries()) {
    const item = document.createElement("div");
    item.className = "story-item";
    const badge = document.createElement("div");
    badge.className = "story-index";
    badge.textContent = String(index + 1);
    const copy = document.createElement("div");
    copy.className = "story-copy";
    const title = document.createElement("strong");
    title.textContent = `${ethText(step.ask)} ETH · ${timeText(step.minute)}`;
    const detail = document.createElement("span");
    const previousState = index === 0 ? scenario.initialState : scenario.steps[index - 1].nextState;
    const transition = localTransition(previousState, step.minute);
    const nextAsk = localQuote(step.nextState, step.minute);
    detail.textContent = `Wait ${waitText(transition.elapsed)}${transition.elapsed === 0n ? " (1 sec minimum for the price increase)" : ""} · Target price increase ≈ ${ethText(transition.premium, 6)} ETH (PTS × wait)`;
    const result = document.createElement("span");
    result.textContent = `Actual price increase +${ethText(nextAsk - BigInt(step.ask), 6)} ETH → next ask ${ethText(nextAsk, 6)} ETH · floor price ${ethText(step.nextState.floorPrice)} ETH`;
    copy.append(title, detail, result);
    item.append(badge, copy);
    storyList.append(item);
  }
}

function render() {
  if (!scenario) return;
  const minute = scenario.cursorMinute;
  const state = stateAt(minute);
  const ask = localQuote(state, minute);
  askValue.textContent = ethText(ask);
  floorReadout.textContent = `${ethText(state.floorPrice)} ETH`;
  epochChip.textContent = `Epoch ${state.epochIndex}`;
  timeSlider.value = String(minute);
  timeValue.textContent = waitText(BigInt(minute) * 60n);
  const lastMinute = scenario.steps.at(-1)?.minute ?? -1;
  buyButton.disabled = busy || !ready || minute <= lastMinute;
  actionHelp.textContent = minute <= lastMinute
    ? "Move time forward to try another purchase."
    : "";
  readoutSub.textContent = "Checking this ask with Sepolia Core…";
  drawPriceTime(state, minute);
  drawChart();
  drawStory();
  clearTimeout(quoteTimer);
  const expected = ask.toString();
  const scenarioAtCall = scenario;
  const timestamp = absoluteTime(minute);
  quoteTimer = setTimeout(async () => {
    if (scenario !== scenarioAtCall) return;
    try {
      const result = await callCore({ function: "quote", config: scenarioAtCall.config, state, timestamp });
      if (scenario !== scenarioAtCall || scenario.cursorMinute !== minute) return;
      readoutSub.textContent = result.ask === expected ? "" : "Calculation mismatch — do not rely on this preview";
    } catch {
      if (scenario === scenarioAtCall && scenario.cursorMinute === minute) readoutSub.textContent = "Sepolia unavailable · showing a local preview";
    }
  }, 180);
}

async function createScenario() {
  const token = ++generation;
  busy = true;
  buyButton.disabled = true;
  readoutSub.textContent = "Starting a new curve on Sepolia Core…";
  try {
    const values = selectedControls();
    const config = configFrom(values);
    const startTime = String(Math.floor(Date.now() / 1000));
    const { state } = await callCore({ function: "initialize", config, startTime });
    if (token !== generation) return;
    scenario = { schema: 1, controls: values, config, startTime, initialState: state, steps: [], cursorMinute: 45 };
    busy = false;
    save();
    render();
  } catch (error) {
    if (token !== generation) return;
    busy = false;
    readoutSub.textContent = `Could not start curve: ${error.message}`;
    actionHelp.textContent = "Could not start a new curve. Check your settings or Sepolia connection, then try Start again.";
  }
}

async function simulatePurchase() {
  if (!scenario || busy) return;
  const scenarioAtCall = scenario;
  const minute = scenario.cursorMinute;
  const lastMinute = scenario.steps.at(-1)?.minute ?? -1;
  if (minute <= lastMinute) return;
  busy = true;
  buyButton.disabled = true;
  actionHelp.textContent = "Asking Sepolia Core for the next curve…";
  try {
    const currentState = scenario.steps.at(-1)?.nextState ?? scenario.initialState;
    const expected = localTransition(currentState, minute);
    const result = await callCore({ function: "advance", config: scenario.config, state: currentState, timestamp: absoluteTime(minute) });
    if (scenario !== scenarioAtCall) return;
    if (result.ask !== expected.ask.toString() || Object.entries(expected.nextState).some(([field, value]) => result.nextState[field] !== value)) {
      throw new Error("Calculation mismatch");
    }
    scenario.steps.push({ minute, ask: result.ask, nextState: result.nextState });
    // Keep the clock at the purchase so the immediate price pulse stays visible.
    scenario.cursorMinute = minute;
    busy = false;
    save();
    render();
  } catch (error) {
    busy = false;
    render();
    actionHelp.textContent = `Simulation did not advance: ${error.message}`;
  }
}

async function boot() {
  setControls(presetValues.balanced);
  buyButton.disabled = true;
  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("Cannot reach the Core gateway");
    const status = await response.json();
    if (!status.verified || status.chainId !== 11155111) throw new Error("Core verification failed");
    ready = true;
    networkDot.classList.add("ready");
    networkStatus.textContent = "Sepolia Core verified";
    const saved = load();
    if (saved) {
      try {
        scenario = saved;
        render();
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        await createScenario();
      }
    } else {
      await createScenario();
    }
  } catch (error) {
    networkDot.classList.add("error");
    networkStatus.textContent = "Sepolia unavailable";
    readoutSub.textContent = error.message;
    pulseSummary.textContent = "Sepolia Core is unavailable. Refresh the page to try again.";
  }
}

for (const [name, input] of Object.entries(controls)) {
  input.addEventListener("input", () => {
    normalizePrices(name);
    updateControlLabels();
  });
  input.addEventListener("change", () => { if (ready) createScenario(); });
}
for (const button of document.querySelectorAll(".preset")) {
  button.addEventListener("click", () => {
    setControls(presetValues[button.dataset.preset]);
    if (ready) createScenario();
  });
}
timeSlider.addEventListener("input", () => {
  if (!scenario) return;
  scenario.cursorMinute = Number(timeSlider.value);
  save();
  render();
});
buyButton.addEventListener("click", simulatePurchase);
document.getElementById("reset-button").addEventListener("click", () => { if (ready) createScenario(); });
window.addEventListener("resize", () => { if (scenario) drawChart(); });
boot();
