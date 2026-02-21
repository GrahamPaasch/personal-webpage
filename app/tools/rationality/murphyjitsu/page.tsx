'use client';

const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Murphyjitsu</title>
<style>
  :root {
    --bg: #0c0a07;
    --bg2: #17120b;
    --surface: #1b160f;
    --surface-2: #251d13;
    --border: #3a2b17;
    --accent: #d4a44a;
    --accent-2: #f3c465;
    --accent-soft: rgba(212, 164, 74, 0.2);
    --text: #f4ecd8;
    --text-dim: #bcae93;
    --danger: #d26454;
    --good: #6fbe80;
    --warn: #f2b350;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    min-height: 100vh;
    padding: 20px;
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    background:
      radial-gradient(circle at 12% 8%, rgba(212,164,74,0.16), transparent 32%),
      radial-gradient(circle at 86% 2%, rgba(160,106,36,0.14), transparent 30%),
      linear-gradient(165deg, var(--bg) 0%, var(--bg2) 68%, #120f0b 100%);
  }

  .container {
    max-width: 820px;
    margin: 0 auto;
  }

  h1 {
    font-size: 1.9rem;
    margin-bottom: 6px;
    letter-spacing: 0.02em;
  }

  .subtitle {
    color: var(--text-dim);
    font-size: 0.96rem;
    line-height: 1.45;
    margin-bottom: 18px;
  }

  .top-strip {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    margin-bottom: 10px;
  }

  .pill {
    border: 1px solid var(--border);
    background: linear-gradient(145deg, rgba(212,164,74,0.17), rgba(40,31,20,0.72));
    color: var(--accent-2);
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
  }

  .pill.alt {
    background: rgba(37, 29, 19, 0.85);
    color: var(--text-dim);
    font-weight: 600;
  }

  .layer-stack {
    display: flex;
    gap: 6px;
    margin-bottom: 14px;
    min-height: 8px;
  }

  .layer-chip {
    flex: 1;
    height: 8px;
    border-radius: 99px;
    background: rgba(89, 67, 35, 0.55);
    border: 1px solid rgba(212, 164, 74, 0.22);
  }

  .layer-chip.active {
    background: linear-gradient(90deg, #8b5f1f 0%, var(--accent) 100%);
    box-shadow: 0 0 10px rgba(212, 164, 74, 0.45);
  }

  .history-card {
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px;
    background: rgba(27, 22, 15, 0.9);
    margin-bottom: 16px;
  }

  .history-title {
    color: var(--accent-2);
    font-size: 0.86rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    margin-bottom: 10px;
    font-weight: 700;
  }

  .history-empty {
    color: var(--text-dim);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .history-item {
    border: 1px solid rgba(212, 164, 74, 0.2);
    border-radius: 10px;
    background: rgba(37, 29, 19, 0.75);
    padding: 10px;
    margin-bottom: 8px;
  }

  .history-item:last-child { margin-bottom: 0; }

  .history-layer {
    font-size: 0.75rem;
    color: var(--accent-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }

  .history-line {
    font-size: 0.88rem;
    color: var(--text);
    line-height: 1.45;
    margin-bottom: 3px;
  }

  .history-line span {
    color: var(--text-dim);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 6px;
  }

  .step {
    display: none;
    animation: fade 0.24s ease;
  }

  .step.active {
    display: block;
  }

  @keyframes fade {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card {
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 16px;
    background: linear-gradient(180deg, rgba(27,22,15,0.95), rgba(23,18,11,0.95));
  }

  .step-title {
    font-size: 1.15rem;
    font-weight: 700;
    margin-bottom: 5px;
  }

  .step-desc {
    color: var(--text-dim);
    font-size: 0.92rem;
    line-height: 1.45;
    margin-bottom: 16px;
  }

  .loop-callout {
    border: 1px solid rgba(212, 164, 74, 0.3);
    background: rgba(212, 164, 74, 0.1);
    border-radius: 10px;
    padding: 11px 12px;
    color: var(--accent-2);
    font-size: 0.9rem;
    margin-bottom: 14px;
    line-height: 1.4;
  }

  .stage-progress {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 5px;
    margin-bottom: 16px;
  }

  .stage-dot {
    height: 5px;
    border-radius: 999px;
    background: rgba(52, 40, 25, 0.7);
    border: 1px solid rgba(212, 164, 74, 0.16);
    transition: all 0.2s ease;
  }

  .stage-dot.done {
    background: rgba(212, 164, 74, 0.62);
  }

  .stage-dot.current {
    background: linear-gradient(90deg, #8b5f1f, var(--accent));
    box-shadow: 0 0 10px rgba(212, 164, 74, 0.45);
  }

  label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.82rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
  }

  textarea,
  input[type="text"],
  input[type="date"] {
    width: 100%;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    padding: 11px 12px;
    font-size: 0.95rem;
    margin-bottom: 14px;
  }

  textarea {
    min-height: 86px;
    resize: vertical;
    line-height: 1.45;
  }

  textarea:focus,
  input[type="text"]:focus,
  input[type="date"]:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(212, 164, 74, 0.14);
  }

  .btn-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .btn {
    border: none;
    border-radius: 9px;
    cursor: pointer;
    padding: 10px 16px;
    font-size: 0.9rem;
    font-weight: 700;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    color: #1d1306;
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(212, 164, 74, 0.3);
  }

  .btn-secondary {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
  }

  .btn-secondary:hover {
    border-color: var(--accent);
    color: var(--accent-2);
  }

  .btn-danger {
    background: rgba(210, 100, 84, 0.15);
    border: 1px solid rgba(210, 100, 84, 0.45);
    color: #f2a49b;
  }

  .btn-tertiary {
    background: rgba(212, 164, 74, 0.12);
    border: 1px solid rgba(212, 164, 74, 0.35);
    color: var(--accent-2);
  }

  .surprise-wrap {
    border: 1px solid rgba(212, 164, 74, 0.25);
    border-radius: 12px;
    background: rgba(37, 29, 19, 0.8);
    padding: 12px;
    margin-bottom: 12px;
  }

  .surprise-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }

  .surprise-scale {
    color: var(--text-dim);
    font-size: 0.84rem;
  }

  .surprise-value {
    font-size: 2rem;
    line-height: 1;
    font-weight: 800;
    color: var(--warn);
    text-shadow: 0 0 16px rgba(212, 164, 74, 0.38);
  }

  .surprise-label {
    color: var(--text-dim);
    font-size: 0.88rem;
    margin-bottom: 10px;
  }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 12px;
    border-radius: 999px;
    background: linear-gradient(90deg, #d26454 0%, #e5a94c 50%, #6fbe80 100%);
    outline: none;
    margin-bottom: 4px;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid #fdf2d8;
    background: #fff0cd;
    box-shadow: 0 0 14px rgba(255, 228, 175, 0.7);
    cursor: pointer;
  }

  input[type="range"]::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid #fdf2d8;
    background: #fff0cd;
    box-shadow: 0 0 14px rgba(255, 228, 175, 0.7);
    cursor: pointer;
  }

  .hint {
    font-size: 0.88rem;
    line-height: 1.45;
    color: var(--text-dim);
    margin-top: 6px;
  }

  .plan-preview {
    width: 100%;
    min-height: 160px;
    border-radius: 10px;
    border: 1px solid rgba(212, 164, 74, 0.3);
    background: rgba(28, 21, 14, 0.9);
    color: var(--text);
    padding: 12px;
    font-size: 0.92rem;
    line-height: 1.45;
    margin-bottom: 12px;
    white-space: pre-wrap;
  }

  .summary-block {
    border: 1px solid rgba(212, 164, 74, 0.24);
    border-radius: 10px;
    background: rgba(37, 29, 19, 0.72);
    padding: 12px;
    margin-bottom: 10px;
  }

  .summary-title {
    color: var(--accent-2);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
    font-weight: 700;
  }

  .summary-text {
    font-size: 0.92rem;
    color: var(--text);
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .summary-list {
    margin-left: 18px;
    color: var(--text);
    line-height: 1.5;
    font-size: 0.92rem;
  }

  .summary-list li { margin-bottom: 4px; }

  .footer-note {
    color: var(--text-dim);
    font-size: 0.84rem;
    margin-top: 8px;
  }

  .copy-status {
    color: var(--good);
    font-size: 0.84rem;
    min-height: 18px;
    margin-top: 8px;
  }

  @media (max-width: 700px) {
    body { padding: 14px; }
    .top-strip {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    h1 { font-size: 1.6rem; }
    .card { padding: 16px; }
    .surprise-value { font-size: 1.7rem; }
  }
</style>
</head>
<body>
<div class="container">
  <h1>Murphyjitsu</h1>
  <p class="subtitle">Pre-hindsight planning: imagine failure, add a defense layer, and repeat until failure would genuinely shock you.</p>

  <div class="top-strip">
    <div class="pill" id="cycle-pill">Defense Cycle 1</div>
    <div class="pill alt" id="target-pill">Shock target: 8+ / 10</div>
  </div>

  <div class="layer-stack" id="layer-stack"></div>

  <div class="history-card">
    <div class="history-title">Defense Layers Built</div>
    <div id="history-list"></div>
  </div>

  <div class="stage-progress" id="stage-progress"></div>

  <div class="step active" id="step-1">
    <div class="card">
      <div class="step-title">1. Describe Your Plan</div>
      <div class="step-desc">Describe what you will do, when it needs to happen, and how you expect to execute it.</div>

      <label for="plan-input">Plan (what, when, how)</label>
      <textarea id="plan-input" placeholder="Example: Ship the onboarding redesign by March 28 by drafting wireframes this week, running 5 user tests, and implementing by sprint end."></textarea>

      <label for="deadline-input">Deadline (used in simulation prompt)</label>
      <input id="deadline-input" type="text" placeholder="Example: March 28, 2026">

      <div class="btn-row">
        <button class="btn btn-primary" onclick="savePlanAndNext()">Next &rarr;</button>
      </div>
    </div>
  </div>

  <div class="step" id="step-2">
    <div class="card">
      <div class="step-title">2. Failure Simulation</div>
      <div class="step-desc" id="failure-prompt">Close your eyes. It's your deadline. The plan did not work. What went wrong?</div>
      <div class="loop-callout" id="failure-loop-note">Imagine this vividly, not abstractly.</div>

      <label for="failure-input">What went wrong?</label>
      <textarea id="failure-input" placeholder="Write the concrete failure mode."></textarea>

      <label for="likely-input">Single most likely failure point</label>
      <input id="likely-input" type="text" placeholder="Name the key break point.">

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goToStep(1)">&larr; Back</button>
        <button class="btn btn-primary" onclick="saveFailureAndNext()">Next &rarr;</button>
      </div>
    </div>
  </div>

  <div class="step" id="step-3">
    <div class="card">
      <div class="step-title">3. Surprise-O-Meter</div>
      <div class="step-desc">If I told you this plan failed, how surprised would you be?</div>

      <div class="surprise-wrap">
        <div class="surprise-top">
          <div class="surprise-scale">Expected (1) &rarr; Shocked (10)</div>
          <div class="surprise-value" id="surprise-value">5</div>
        </div>
        <div class="surprise-label" id="surprise-label">Borderline surprised.</div>
        <input id="surprise-input" type="range" min="1" max="10" value="5" oninput="updateSurpriseDisplay('surprise-input', 'surprise-value', 'surprise-label')">
      </div>

      <div class="hint" id="surprise-hint">Below 8 means keep looping with another defense layer.</div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goToStep(2)">&larr; Back</button>
        <button class="btn btn-primary" onclick="saveSurpriseAndNext()">Next &rarr;</button>
      </div>
    </div>
  </div>

  <div class="step" id="step-4">
    <div class="card">
      <div class="step-title">4. Add Defense</div>
      <div class="step-desc">Add the simplest defense that could prevent this failure, then add the experienced version.</div>

      <label for="defense-simple-input">Simplest prevention step</label>
      <textarea id="defense-simple-input" placeholder="What is the minimum action that would prevent this?"></textarea>

      <label for="defense-expert-input">What would someone experienced do differently?</label>
      <textarea id="defense-expert-input" placeholder="Add the expert pattern, check, or process."></textarea>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goToStep(3)">&larr; Back</button>
        <button class="btn btn-primary" onclick="saveDefenseAndNext()">Next &rarr;</button>
      </div>
    </div>
  </div>

  <div class="step" id="step-5">
    <div class="card">
      <div class="step-title">5. Updated Plan</div>
      <div class="step-desc">This is your plan with the new defense layer incorporated.</div>

      <div class="plan-preview" id="updated-plan-preview"></div>

      <div class="loop-callout" id="loop-instruction">Now imagine the plan with this defense still failed. What happened this time?</div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goToStep(4)">&larr; Back</button>
        <button class="btn btn-primary" onclick="commitCycleAndContinue()" id="commit-cycle-btn">Add Defense Layer & Continue</button>
      </div>
    </div>
  </div>

  <div class="step" id="step-6">
    <div class="card">
      <div class="step-title">6. Outside View Check</div>
      <div class="step-desc">Take your plan and imagine another person made it. How would it likely fail for them?</div>

      <label for="outside-failure-input">Outside-view failure mode</label>
      <textarea id="outside-failure-input" placeholder="How would this fail for someone else running the same plan?"></textarea>

      <label for="outside-likely-input">Single most likely outside-view failure point</label>
      <input id="outside-likely-input" type="text" placeholder="Most likely break point for them.">

      <label for="outside-defense-simple-input">Defense to recommend</label>
      <textarea id="outside-defense-simple-input" placeholder="What simple defense should they add?"></textarea>

      <label for="outside-defense-expert-input">Experienced adjustment</label>
      <textarea id="outside-defense-expert-input" placeholder="What would an experienced person change?"></textarea>

      <div class="surprise-wrap">
        <div class="surprise-top">
          <div class="surprise-scale">Final surprise rating</div>
          <div class="surprise-value" id="outside-surprise-value">8</div>
        </div>
        <div class="surprise-label" id="outside-surprise-label">Shocked territory.</div>
        <input id="outside-surprise-input" type="range" min="1" max="10" value="8" oninput="updateSurpriseDisplay('outside-surprise-input', 'outside-surprise-value', 'outside-surprise-label')">
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goToStep(5)">&larr; Back</button>
        <button class="btn btn-primary" onclick="saveOutsideAndSummary()">Generate Summary</button>
      </div>
    </div>
  </div>

  <div class="step" id="step-7">
    <div class="card">
      <div class="step-title">7. Murphyjitsu Summary</div>
      <div class="step-desc">Your plan has been stress-tested and hardened with explicit defense layers.</div>

      <div id="summary-content"></div>

      <div class="btn-row">
        <button class="btn btn-tertiary" onclick="copySummary()">Copy Summary</button>
        <button class="btn btn-tertiary" onclick="exportSummary()">Export .txt</button>
        <button class="btn btn-danger" onclick="startOver()">Start Over</button>
      </div>
      <div class="copy-status" id="copy-status"></div>
    </div>
  </div>
</div>

<script>
  var state = {
    originalPlan: '',
    deadline: '',
    cycles: [],
    outsideCycle: null,
    draft: {
      failure: '',
      likely: '',
      surprise: 5,
      defenseSimple: '',
      defenseExpert: ''
    }
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function currentCycleNumber() {
    return state.cycles.length + 1;
  }

  function surpriseLabel(value) {
    if (value <= 3) {
      return 'Expected failure. Major hardening needed.';
    }
    if (value <= 5) {
      return 'Borderline surprised.';
    }
    if (value <= 7) {
      return 'Somewhat surprised, but still plausible.';
    }
    if (value <= 9) {
      return 'Shocked territory. Plan is getting robust.';
    }
    return 'Extremely shocked. Failure now looks unlikely.';
  }

  function updateSurpriseDisplay(inputId, valueId, labelId) {
    var value = parseInt(byId(inputId).value, 10) || 1;
    byId(valueId).textContent = String(value);
    byId(labelId).textContent = surpriseLabel(value);
    if (inputId === 'surprise-input') {
      byId('surprise-hint').textContent = value >= 8
        ? '8+ reached: one more layer can move you to outside-view check.'
        : 'Below 8: continue loop after adding this defense layer.';
    }
  }

  function buildStageProgress(step) {
    var progress = byId('stage-progress');
    progress.innerHTML = '';
    var i;
    for (i = 1; i <= 7; i += 1) {
      var dot = document.createElement('div');
      dot.className = 'stage-dot';
      if (i < step) {
        dot.className += ' done';
      } else if (i === step) {
        dot.className += ' current';
      }
      progress.appendChild(dot);
    }
  }

  function buildLayerStack() {
    var stack = byId('layer-stack');
    stack.innerHTML = '';
    var total = Math.max(state.cycles.length, 1);
    var i;
    for (i = 0; i < total; i += 1) {
      var chip = document.createElement('div');
      chip.className = 'layer-chip';
      if (i < state.cycles.length) {
        chip.className += ' active';
      }
      stack.appendChild(chip);
    }
  }

  function combineDefense(simple, expert) {
    if (simple && expert) {
      return simple + ' Experienced move: ' + expert;
    }
    if (simple) {
      return simple;
    }
    if (expert) {
      return expert;
    }
    return '(no defense recorded)';
  }

  function renderHistory() {
    var history = byId('history-list');
    history.innerHTML = '';

    if (state.cycles.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No layers yet. Run the failure simulation and keep adding defenses until failure would shock you.';
      history.appendChild(empty);
      buildLayerStack();
      return;
    }

    state.cycles.forEach(function (cycle) {
      var item = document.createElement('div');
      item.className = 'history-item';

      var layer = document.createElement('div');
      layer.className = 'history-layer';
      layer.textContent = 'Layer ' + cycle.number;
      item.appendChild(layer);

      var failure = document.createElement('div');
      failure.className = 'history-line';
      failure.innerHTML = '<span>Failure:</span>' + cycle.failure;
      item.appendChild(failure);

      var defense = document.createElement('div');
      defense.className = 'history-line';
      defense.innerHTML = '<span>Defense:</span>' + combineDefense(cycle.defenseSimple, cycle.defenseExpert);
      item.appendChild(defense);

      var surprise = document.createElement('div');
      surprise.className = 'history-line';
      surprise.innerHTML = '<span>Surprise:</span>' + cycle.surprise + '/10';
      item.appendChild(surprise);

      history.appendChild(item);
    });

    buildLayerStack();
  }

  function updateTopPills(step) {
    var cyclePill = byId('cycle-pill');
    if (step === 6) {
      cyclePill.textContent = 'Outside View Cycle';
      return;
    }
    if (step === 7) {
      cyclePill.textContent = 'Hardened Plan Complete';
      return;
    }
    cyclePill.textContent = 'Defense Cycle ' + currentCycleNumber();
  }

  function showStep(step) {
    var steps = document.querySelectorAll('.step');
    steps.forEach(function (node) {
      node.classList.remove('active');
    });

    var active = byId('step-' + step);
    if (active) {
      active.classList.add('active');
    }

    buildStageProgress(step);
    updateTopPills(step);
    renderHistory();

    if (step === 2) {
      updateFailurePrompt();
    }
    if (step === 5) {
      renderUpdatedPlanPreview();
    }
    if (step === 7) {
      renderSummary();
    }
  }

  function goToStep(step) {
    showStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateFailurePrompt() {
    var deadlineText = state.deadline ? state.deadline : 'your deadline';
    byId('failure-prompt').textContent = "Close your eyes. It's " + deadlineText + '. The plan did not work. What went wrong?';

    if (state.cycles.length === 0) {
      byId('failure-loop-note').textContent = 'Imagine this vividly, not abstractly.';
    } else {
      byId('failure-loop-note').textContent = 'Now imagine the plan WITH your current defenses still failed. What happened this time?';
    }

    byId('failure-input').value = state.draft.failure;
    byId('likely-input').value = state.draft.likely;
  }

  function savePlanAndNext() {
    var plan = byId('plan-input').value.trim();
    if (!plan) {
      alert('Describe your plan first.');
      return;
    }

    state.originalPlan = plan;
    state.deadline = byId('deadline-input').value.trim();
    goToStep(2);
  }

  function saveFailureAndNext() {
    var failure = byId('failure-input').value.trim();
    var likely = byId('likely-input').value.trim();

    if (!failure) {
      alert('Add at least one failure mode.');
      return;
    }

    if (!likely) {
      alert('Name the single most likely failure point.');
      return;
    }

    state.draft.failure = failure;
    state.draft.likely = likely;
    goToStep(3);
  }

  function saveSurpriseAndNext() {
    state.draft.surprise = parseInt(byId('surprise-input').value, 10) || 1;
    goToStep(4);
  }

  function saveDefenseAndNext() {
    var simple = byId('defense-simple-input').value.trim();
    var expert = byId('defense-expert-input').value.trim();

    if (!simple && !expert) {
      alert('Add at least one defense action.');
      return;
    }

    state.draft.defenseSimple = simple;
    state.draft.defenseExpert = expert;
    goToStep(5);
  }

  function planWithDefenses(extraDefense) {
    var lines = [];
    lines.push('Original plan:');
    lines.push(state.originalPlan || '(no plan)');

    if (state.deadline) {
      lines.push('');
      lines.push('Deadline: ' + state.deadline);
    }

    if (state.cycles.length > 0 || extraDefense) {
      lines.push('');
      lines.push('Defense layers:');
      state.cycles.forEach(function (cycle, index) {
        lines.push(String(index + 1) + '. ' + combineDefense(cycle.defenseSimple, cycle.defenseExpert));
      });
      if (extraDefense) {
        lines.push(String(state.cycles.length + 1) + '. ' + extraDefense);
      }
    }

    return lines.join('\n');
  }

  function renderUpdatedPlanPreview() {
    var pending = combineDefense(state.draft.defenseSimple, state.draft.defenseExpert);
    byId('updated-plan-preview').textContent = planWithDefenses(pending);

    if (state.draft.surprise >= 8) {
      byId('loop-instruction').textContent = 'You are at ' + state.draft.surprise + '/10 surprise. Add this layer, then run one outside-view cycle.';
      byId('commit-cycle-btn').textContent = 'Add Final Internal Layer';
    } else {
      byId('loop-instruction').textContent = 'Now imagine the plan with this defense still failed. What happened this time?';
      byId('commit-cycle-btn').textContent = 'Add Defense Layer & Continue';
    }
  }

  function clearDraftInputs() {
    state.draft = {
      failure: '',
      likely: '',
      surprise: 5,
      defenseSimple: '',
      defenseExpert: ''
    };

    byId('failure-input').value = '';
    byId('likely-input').value = '';
    byId('defense-simple-input').value = '';
    byId('defense-expert-input').value = '';
    byId('surprise-input').value = '5';
    updateSurpriseDisplay('surprise-input', 'surprise-value', 'surprise-label');
  }

  function commitCycleAndContinue() {
    var cycle = {
      number: currentCycleNumber(),
      failure: state.draft.failure,
      likely: state.draft.likely,
      surprise: state.draft.surprise,
      defenseSimple: state.draft.defenseSimple,
      defenseExpert: state.draft.defenseExpert
    };

    state.cycles.push(cycle);
    clearDraftInputs();

    if (cycle.surprise >= 8) {
      goToStep(6);
      return;
    }

    goToStep(2);
  }

  function saveOutsideAndSummary() {
    var failure = byId('outside-failure-input').value.trim();
    var likely = byId('outside-likely-input').value.trim();
    var simple = byId('outside-defense-simple-input').value.trim();
    var expert = byId('outside-defense-expert-input').value.trim();
    var surprise = parseInt(byId('outside-surprise-input').value, 10) || 1;

    if (!failure) {
      alert('Add an outside-view failure mode.');
      return;
    }

    if (!likely) {
      alert('Name the most likely outside-view failure point.');
      return;
    }

    if (!simple && !expert) {
      alert('Add at least one outside-view defense.');
      return;
    }

    state.outsideCycle = {
      failure: failure,
      likely: likely,
      defenseSimple: simple,
      defenseExpert: expert,
      surprise: surprise
    };

    goToStep(7);
  }

  function allFailureModes() {
    var modes = [];
    state.cycles.forEach(function (cycle) {
      modes.push('Cycle ' + cycle.number + ': ' + cycle.failure + ' (Most likely point: ' + cycle.likely + ')');
    });
    if (state.outsideCycle) {
      modes.push('Outside view: ' + state.outsideCycle.failure + ' (Most likely point: ' + state.outsideCycle.likely + ')');
    }
    return modes;
  }

  function allDefenses() {
    var defenses = [];
    state.cycles.forEach(function (cycle) {
      defenses.push('Cycle ' + cycle.number + ': ' + combineDefense(cycle.defenseSimple, cycle.defenseExpert));
    });
    if (state.outsideCycle) {
      defenses.push('Outside view: ' + combineDefense(state.outsideCycle.defenseSimple, state.outsideCycle.defenseExpert));
    }
    return defenses;
  }

  function finalSurpriseRating() {
    if (state.outsideCycle) {
      return state.outsideCycle.surprise;
    }
    if (state.cycles.length > 0) {
      return state.cycles[state.cycles.length - 1].surprise;
    }
    return 0;
  }

  function hardenedPlanText() {
    var lines = [];
    lines.push(state.originalPlan || '(no plan)');

    var defenses = allDefenses();
    if (defenses.length > 0) {
      lines.push('');
      lines.push('Defense layers built into execution:');
      defenses.forEach(function (item, index) {
        lines.push(String(index + 1) + '. ' + item);
      });
    }

    if (state.deadline) {
      lines.push('');
      lines.push('Deadline: ' + state.deadline);
    }

    return lines.join('\n');
  }

  function appendSummaryTextBlock(container, title, text) {
    var block = document.createElement('div');
    block.className = 'summary-block';

    var heading = document.createElement('div');
    heading.className = 'summary-title';
    heading.textContent = title;
    block.appendChild(heading);

    var content = document.createElement('div');
    content.className = 'summary-text';
    content.textContent = text;
    block.appendChild(content);

    container.appendChild(block);
  }

  function appendSummaryListBlock(container, title, items) {
    var block = document.createElement('div');
    block.className = 'summary-block';

    var heading = document.createElement('div');
    heading.className = 'summary-title';
    heading.textContent = title;
    block.appendChild(heading);

    var list = document.createElement('ol');
    list.className = 'summary-list';

    if (items.length === 0) {
      var empty = document.createElement('li');
      empty.textContent = '(none recorded)';
      list.appendChild(empty);
    } else {
      items.forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
    }

    block.appendChild(list);
    container.appendChild(block);
  }

  function renderSummary() {
    var root = byId('summary-content');
    root.innerHTML = '';

    appendSummaryTextBlock(root, 'Original Plan', state.originalPlan || '(not specified)');
    appendSummaryListBlock(root, 'Failure Modes Identified', allFailureModes());
    appendSummaryListBlock(root, 'Defenses Added', allDefenses());
    appendSummaryTextBlock(root, 'Final Surprise Rating', String(finalSurpriseRating()) + '/10');
    appendSummaryTextBlock(root, 'Hardened Plan', hardenedPlanText());

    var integration = document.createElement('div');
    integration.className = 'summary-block';
    var integrationTitle = document.createElement('div');
    integrationTitle.className = 'summary-title';
    integrationTitle.textContent = 'Integration Suggestions';
    integration.appendChild(integrationTitle);

    var ul = document.createElement('ul');
    ul.className = 'summary-list';

    var item1 = document.createElement('li');
    item1.textContent = 'Run Goal Factoring first if your objective or motivation is still fuzzy.';
    ul.appendChild(item1);

    var item2 = document.createElement('li');
    item2.textContent = 'Create TAPs (trigger-action plans) for each defense so they execute automatically.';
    ul.appendChild(item2);

    var item3 = document.createElement('li');
    item3.textContent = 'Use Resolve Cycles if repeated failures suggest the plan is fundamentally broken.';
    ul.appendChild(item3);

    integration.appendChild(ul);
    root.appendChild(integration);

    var note = document.createElement('div');
    note.className = 'footer-note';
    note.textContent = 'The goal is not perfect certainty. The goal is to remove predictable failure modes before reality does it for you.';
    root.appendChild(note);
  }

  function buildSummaryText() {
    var lines = [];
    lines.push('Murphyjitsu Summary');
    lines.push('');
    lines.push('Original plan:');
    lines.push(state.originalPlan || '(not specified)');
    lines.push('');

    if (state.deadline) {
      lines.push('Deadline: ' + state.deadline);
      lines.push('');
    }

    lines.push('Failure modes identified:');
    var failures = allFailureModes();
    if (failures.length === 0) {
      lines.push('1. (none recorded)');
    } else {
      failures.forEach(function (item, index) {
        lines.push(String(index + 1) + '. ' + item);
      });
    }
    lines.push('');

    lines.push('Defenses added:');
    var defenses = allDefenses();
    if (defenses.length === 0) {
      lines.push('1. (none recorded)');
    } else {
      defenses.forEach(function (item, index) {
        lines.push(String(index + 1) + '. ' + item);
      });
    }
    lines.push('');

    lines.push('Final surprise rating: ' + String(finalSurpriseRating()) + '/10');
    lines.push('');
    lines.push('Hardened plan:');
    lines.push(hardenedPlanText());
    lines.push('');
    lines.push('Integration suggestions:');
    lines.push('1. Goal Factoring first.');
    lines.push('2. Create TAPs for each defense.');
    lines.push('3. Resolve Cycles if the plan is fundamentally broken.');

    return lines.join('\n');
  }

  function copySummary() {
    var text = buildSummaryText();

    function done(message) {
      byId('copy-status').textContent = message;
      setTimeout(function () {
        byId('copy-status').textContent = '';
      }, 2400);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        done('Summary copied to clipboard.');
      }).catch(function () {
        fallbackCopy(text, done);
      });
      return;
    }

    fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      done('Summary copied to clipboard.');
    } catch (error) {
      done('Copy failed. Use Export .txt instead.');
    }
    document.body.removeChild(area);
  }

  function exportSummary() {
    var content = buildSummaryText();
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'murphyjitsu-summary.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function startOver() {
    if (!window.confirm('Start over and clear all Murphyjitsu data?')) {
      return;
    }

    state = {
      originalPlan: '',
      deadline: '',
      cycles: [],
      outsideCycle: null,
      draft: {
        failure: '',
        likely: '',
        surprise: 5,
        defenseSimple: '',
        defenseExpert: ''
      }
    };

    byId('plan-input').value = '';
    byId('deadline-input').value = '';
    byId('failure-input').value = '';
    byId('likely-input').value = '';
    byId('defense-simple-input').value = '';
    byId('defense-expert-input').value = '';
    byId('outside-failure-input').value = '';
    byId('outside-likely-input').value = '';
    byId('outside-defense-simple-input').value = '';
    byId('outside-defense-expert-input').value = '';
    byId('surprise-input').value = '5';
    byId('outside-surprise-input').value = '8';

    updateSurpriseDisplay('surprise-input', 'surprise-value', 'surprise-label');
    updateSurpriseDisplay('outside-surprise-input', 'outside-surprise-value', 'outside-surprise-label');

    byId('copy-status').textContent = '';
    goToStep(1);
  }

  updateSurpriseDisplay('surprise-input', 'surprise-value', 'surprise-label');
  updateSurpriseDisplay('outside-surprise-input', 'outside-surprise-value', 'outside-surprise-label');
  showStep(1);
</script>
</body>
</html>
`;

export default function MurphyjitsuPage() {
  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 120px)' }}>
      <iframe
        srcDoc={htmlContent}
        style={{ width: '100%', height: 'calc(100vh - 120px)', border: 'none', borderRadius: 8 }}
        title="Murphyjitsu"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
