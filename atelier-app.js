/* ─────────────────────────────────────────────────────────────
   The Atelier · guest app
   ────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ═════════════ STATE ═════════════
  const state = {
    propertyId: 'sandhill',
    view: 'studio',            // studio | dashboard | constellation
    inDialogue: false,
    activeSpecialist: null,    // key
    activeThreadId: null,      // id of the thread currently in dialogue
    activeThreadTitle: null,
    threadPrivate: false,
    micOn: true,
    voiceListening: false,
    presenterSafe: false,
    useElevenLabs: true, // flip to false to preserve credits — or via console: Atelier.state.useElevenLabs = false
    threads: [],
    plans: [
      // pre-seeded — settled means "arranged & awaiting the moment", not done.
      // whenAt is the moment the experience occurs; lets the progress bar advance
      // 'Held' → 'Carried forward' when the time has passed.
      { id: 'p_seed_dawn', kind: 'recovery', title: 'Tomorrow at first light', when: 'Tomorrow 7:00 am', where: 'Asaya breathwork room', state: 'settled', specialist: 'physician', whenAt: new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString(), approvedIds: new Set(), handledIds: new Set() },
    ],
    openPlanId: null,
    privateCount: 0,
    // Soft context for the most recently rendered plan with actionable suggestions.
    // Lets voice follow-ups ("approve all three", "yes, do it") land even after the
    // thread has auto-closed back to the constellation.
    pendingApproval: null, // { planTitle, planKind, specialist, threadId, actionIds:[], approvedIds:Set, handledIds:Set, capturedAt, expiresAt, guestId, actions:[] }
  };
  const PENDING_APPROVAL_WINDOW_MS = 90_000;

  // ═════════════ HELPERS ═════════════
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'data' && typeof v === 'object') for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  };
  const initials = (name) => name.replace(/^The\s+/, '').slice(0, 2);

  // ═════════════ LOGGING ═════════════
  // One structured log helper, used everywhere. Prefixed, timestamped, and
  // safe to leave on in production — copy/paste into the console to read.
  function log(event, data) {
    const ts = new Date().toISOString().slice(11, 23);
    if (data !== undefined) console.log('[atelier ' + ts + ']', event, data);
    else console.log('[atelier ' + ts + ']', event);
  }
  log('module-loaded');

  // BroadcastChannel to operator
  let bc = null;
  try { bc = new BroadcastChannel('atelier'); } catch (e) {}
  const publish = (msg) => {
    try {
      if (bc) {
        bc.postMessage(msg);
        log('publish→operator', { type: msg.type, payload: msg });
      }
    } catch (e) { log('publish:error', { err: String(e && e.message || e) }); }
  };

  // ═════════════ COVER ═════════════
  function renderCoverProperties() {
    const row = $('#cover-properties');
    row.innerHTML = '';
    for (const id of window.PROPERTY_ORDER) {
      const p = window.PROPERTIES[id];
      const btn = el('button', {
        class: 'cover-property' + (id === state.propertyId ? ' is-active' : ''),
        onclick: () => switchProperty(id, /*onCover*/true),
      }, p.short);
      row.appendChild(btn);
    }
    updateCoverMeta();
  }
  function updateCoverMeta() {
    const p = window.PROPERTIES[state.propertyId];
    $('#cover-property-name').textContent = p.name;
    $('#cover-property-suite').textContent = p.suite;
  }

  function enterStudio() {
    console.log('[atelier] enterStudio');
    document.body.classList.remove('cover-active');
    document.body.classList.add('studio-active');
    setTimeout(showWelcome, 700);
    if (state.micOn) {
      requestMicPermissionThenListen();
    }
    probeMicPermission();
  }

  async function requestMicPermissionThenListen() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Try plain start — older browsers
      setTimeout(() => { try { startAmbient(); } catch (e) {} }, 800);
      return;
    }
    try {
      console.info('[atelier] requesting microphone…');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Got permission. Release the explicit stream — SpeechRecognition will open its own.
      stream.getTracks().forEach(t => t.stop());
      micStatus = 'granted';
      updateMicVisual();
      console.info('[atelier] microphone granted, starting ambient listening');
      setTimeout(() => { try { startAmbient(); } catch (e) { console.warn('[atelier] startAmbient failed:', e); } }, 300);
    } catch (e) {
      console.warn('[atelier] microphone denied or unavailable:', e && e.name, e && e.message);
      micStatus = 'denied';
      updateMicVisual();
      flashHint('Microphone blocked — open the lock icon in the URL bar to allow');
    }
  }

  function probeMicPermission() {
    if (!navigator.permissions || !navigator.permissions.query) return;
    try {
      navigator.permissions.query({ name: 'microphone' }).then(res => {
        if (res.state === 'granted') micStatus = 'granted';
        else if (res.state === 'denied') micStatus = 'denied';
        updateMicVisual();
        res.onchange = () => {
          if (res.state === 'granted') micStatus = 'granted';
          else if (res.state === 'denied') micStatus = 'denied';
          updateMicVisual();
          if (res.state === 'granted' && state.micOn && !isAmbient && !isActive) {
            try { startAmbient(); } catch (e) {}
          }
        };
      }).catch(() => {});
    } catch (e) {}
  }

  // Brief "I heard: …" caption — fades after a beat. Helps debug accent
  // mishearings on the ambient wake-word matcher.
  let heardEl = null, heardTimer = null;
  function showHeard(text) {
    if (!text || !text.trim()) return;
    if (state.activeSpecialist) return; // only show on at-rest (don't clutter dialogue)
    if (!heardEl) {
      heardEl = document.createElement('div');
      heardEl.id = 'heard-caption';
      heardEl.style.cssText = 'position:fixed; bottom:90px; left:50%; transform:translateX(-50%); max-width:520px; padding:6px 14px; font-family:var(--serif); font-style:italic; font-size:13px; color:var(--muted); background:var(--bg-veil); border:1px solid var(--rule-soft); opacity:0; transition:opacity 0.4s ease; z-index:60; text-align:center; pointer-events:none; line-height:1.5;';
      document.body.appendChild(heardEl);
    }
    heardEl.textContent = 'heard: ' + text.trim();
    requestAnimationFrame(() => { heardEl.style.opacity = '0.9'; });
    clearTimeout(heardTimer);
    heardTimer = setTimeout(() => { if (heardEl) heardEl.style.opacity = '0'; }, 2400);
  }

  function showWelcome() {
    const p = window.PROPERTIES[state.propertyId];
    const w = $('#welcome');
    $('#welcome-line').textContent = p.welcomeLine || 'Welcome.';
    w.classList.add('is-shown');
    speakText(p.welcomeLine, 'atelier').catch(() => {});
    setTimeout(() => w.classList.remove('is-shown'), 4200);
    // Belt-and-suspenders: if for any reason TTS didn't restart ambient,
    // make sure it's running ~5s after welcome shows.
    setTimeout(() => {
      if (state.micOn && !isAmbient && !isActive && !isTTSPlaying && !state.activeSpecialist) {
        console.log('[atelier] safety-net: restarting ambient after welcome');
        try { startAmbient(); } catch (e) {}
      }
    }, 5000);
  }

  // ═════════════ PROPERTY SWITCH ═════════════
  function switchProperty(id, onCover = false) {
    if (state.propertyId === id) return;
    state.propertyId = id;
    document.documentElement.setAttribute('data-property', id);

    // Update bar and cover
    const p = window.PROPERTIES[id];
    $('#bar-property').textContent = 'at ' + p.name;
    $('#bar-suite').textContent = p.suite;
    updateCoverMeta();
    $$('.cover-property').forEach(btn => btn.classList.remove('is-active'));
    const active = $$('.cover-property').find(b => b.textContent === p.short);
    if (active) active.classList.add('is-active');

    renderSuggestions();
    renderPeriphery();

    if (!onCover) {
      // mid-stay property switch — speak the line, refresh constellation
      showWelcome();
      renderConstellation();
    }

    publish({ type: 'property_changed', propertyId: id });
  }

  // ═════════════ SUGGESTIONS (the at-rest constellation) ═════════════
  function renderSuggestions() {
    const p = window.PROPERTIES[state.propertyId];
    const row = $('#suggestions');
    row.innerHTML = '';
    for (const s of p.suggestions) {
      const sp = window.SPECIALISTS[s.specialist];
      const card = el('button', {
        class: 'suggestion',
        onclick: () => openThread(s.specialist, s.label, s.kickoff),
        title: sp.name + ' \u2014 ' + sp.role,
      });
      card.appendChild(el('div', { class: 'chip' }, initials(sp.name)));
      card.appendChild(el('div', { class: 'label' }, s.label));
      card.appendChild(el('div', { class: 'who' }, sp.name));
      row.appendChild(card);
    }
    $('#specialist-count').textContent = p.specialists.length;
  }

  // ═════════════ PERIPHERY (right column) ═════════════
  // Locate the persisted plan entry that corresponds to a plan-card object (which
  // comes from CANNED.* and has no stable id). Falls back to title matching.
  function findLivePlan(plan) {
    if (!plan) return null;
    if (state.pendingApproval && state.pendingApproval.planId) {
      const byId = state.plans.find(p => p.id === state.pendingApproval.planId);
      if (byId) return byId;
    }
    return state.plans.find(p => p.title === plan.title) || null;
  }

  // 5-stage lifecycle, labels vary by plan.kind so a dinner reads as "Tonight /
  // Reflected" while a wellness session reads as "Held / Carried forward".
  //   0 Proposed → 1 Arranging → 2 (Confirmed | Booked | Set) → 3 (Held | Tonight | Standing by) → 4 (Complete | Carried forward | Reflected | Done)
  const STAGE_LABELS_BY_KIND = {
    wellness:  ['Proposed', 'Arranging', 'Booked',    'Held',     'Reflected'],
    recovery:  ['Proposed', 'Arranging', 'Set',       'Tonight',  'Reflected'],
    evening:   ['Proposed', 'Arranging', 'Confirmed', 'Tonight',  'Reflected'],
    dinner:    ['Proposed', 'Arranging', 'Confirmed', 'Tonight',  'Reflected'],
    logistics: ['Proposed', 'Arranging', 'Confirmed', 'Standing', 'Done'],
    default:   ['Proposed', 'Approved',  'Confirmed', 'Held',     'Complete'],
  };
  function stageLabels(plan) { return STAGE_LABELS_BY_KIND[plan && plan.kind] || STAGE_LABELS_BY_KIND.default; }

  function planStage(plan) {
    if (plan.state === 'complete') return 4;
    const actions = plan.actions || [];
    const approved = (plan.approvedIds && plan.approvedIds.size) || 0;
    const handled = (plan.handledIds && plan.handledIds.size) || 0;
    const allHandled = actions.length ? (handled >= actions.length) : (plan.state === 'settled');
    // The moment has passed: advance from Held to Complete.
    const momentPassed = plan.whenAt && new Date(plan.whenAt).getTime() <= Date.now();
    if (allHandled && momentPassed) return 4;
    if (allHandled) return 3;
    if (!actions.length) return plan.state === 'motion' ? 1 : 0;
    if (handled > 0) return 2;
    if (approved > 0) return 1;
    return 0;
  }

  // Italic prompt the owning specialist offers after a plan is complete.
  function followUpCopy(plan) {
    const k = plan.kind;
    if (k === 'wellness' || k === 'recovery') return '— how did it feel? Tap to reflect.';
    if (k === 'evening' || k === 'dinner') return '— how was the evening? Tap to share a note.';
    return '— a moment to reflect? Tap to share.';
  }

  function openReflection(plan) {
    const specialistKey = plan.specialist;
    if (!specialistKey || !window.SPECIALISTS[specialistKey]) {
      log('reflection:skip:no-specialist', { planId: plan.id });
      return;
    }
    const title = 'Reflecting on ' + plan.title;
    openThread(specialistKey, title, null);
    // Let the specialist greet first — this is their initiative, not the guest's.
    let opener = (followUpCopy(plan) || '').replace(/^[—-]\s*/, '').replace(/\s*Tap to.*$/i, '').trim();
    if (!opener) opener = 'How did it feel?';
    opener = opener.charAt(0).toUpperCase() + opener.slice(1);
    setTimeout(async () => {
      const body = appendSpecialistTurn(specialistKey);
      await streamInto(body, opener);
      speakText(opener, specialistKey).catch(() => {});
      armFollowUp();
    }, 700);
  }

  function renderPlanProgress(plan) {
    const stages = stageLabels(plan);
    const current = planStage(plan);
    const wrap = el('div', { class: 'plan-progress' });

    const bar = el('div', { class: 'pp-bar' });
    for (let i = 0; i < stages.length; i++) {
      const cls = i < current ? 'is-done' : (i === current ? 'is-current' : '');
      bar.appendChild(el('div', { class: 'pp-dot ' + cls }));
      if (i < stages.length - 1) {
        bar.appendChild(el('div', { class: 'pp-seg ' + (i < current ? 'is-done' : '') }));
      }
    }
    wrap.appendChild(bar);

    const labels = el('div', { class: 'pp-labels' });
    for (let i = 0; i < stages.length; i++) {
      labels.appendChild(el('div', { class: 'pp-label' + (i === current ? ' is-current' : '') }, stages[i]));
    }
    wrap.appendChild(labels);

    // Short italic status line — adapts to current stage.
    const actions = plan.actions || [];
    const total = actions.length;
    const approved = (plan.approvedIds && plan.approvedIds.size) || 0;
    const handled = (plan.handledIds && plan.handledIds.size) || 0;
    let status = '';
    if (current === 4) status = 'The moment has passed — the studio holds it.';
    else if (current === 3) status = plan.whenAt
      ? 'The moment is ' + formatWhen(plan.whenAt) + ' away.'
      : 'Held, everything in place.';
    else if (current === 2) status = total ? `${handled} of ${total} confirmed.` : 'Lined up by the team.';
    else if (current === 1) status = total ? `${approved} of ${total} approved · awaiting the team.` : 'Awaiting the team.';
    else status = 'Awaiting your approval.';
    wrap.appendChild(el('div', { class: 'pp-status' }, status));

    // Per-action checklist when actions exist and we haven't yet completed.
    if (actions.length && current < 4) {
      const list = el('ul', { class: 'pp-actions' });
      for (const a of actions) {
        const aHandled = plan.handledIds && plan.handledIds.has(a.id);
        const aApproved = plan.approvedIds && plan.approvedIds.has(a.id);
        const li = el('li', { class: 'pp-action ' + (aHandled ? 'is-done' : aApproved ? 'is-approved' : '') });
        li.appendChild(el('span', { class: 'pp-action-mark' }, aHandled ? '✓' : aApproved ? '·' : '○'));
        li.appendChild(el('span', { class: 'pp-action-text' }, a.title));
        if (a.handler) li.appendChild(el('span', { class: 'pp-action-handler' }, a.handler));
        list.appendChild(li);
      }
      wrap.appendChild(list);
    }

    // Follow-up prompt: at Complete, the owning specialist invites a reflection.
    if (current === 4 && plan.specialist && window.SPECIALISTS[plan.specialist]) {
      const sp = window.SPECIALISTS[plan.specialist];
      const card = el('div', {
        class: 'pp-followup',
        onclick: (ev) => { ev.stopPropagation(); openReflection(plan); },
      });
      card.appendChild(el('div', { class: 'pp-fu-who' }, sp.name.toUpperCase()));
      const body = el('div', { class: 'pp-fu-body' });
      body.appendChild(el('em', {}, followUpCopy(plan)));
      body.appendChild(el('span', { class: 'pp-fu-arrow' }, '→'));
      card.appendChild(body);
      wrap.appendChild(card);
    }
    return wrap;
  }

  // Lightweight relative-time formatter for the Held status line.
  // Returns a bare interval ("16 hours", "4 days") — caller composes the sentence.
  function formatWhen(iso) {
    const t = new Date(iso).getTime();
    const diffMin = Math.round((t - Date.now()) / 60000);
    if (diffMin < 0) return 'just';
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'}`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH} hour${diffH === 1 ? '' : 's'}`;
    const diffD = Math.round(diffH / 24);
    return `${diffD} day${diffD === 1 ? '' : 's'}`;
  }

  function renderPeriphery() {
    const p = window.PROPERTIES[state.propertyId];
    const root = $('#periphery');
    root.innerHTML = '';

    // Atelier note
    root.appendChild(el('div', { class: 'periph-section' },
      el('h3', {}, 'The Atelier'),
      el('p', { class: 'lede' }, '\u2014 ' + p.atelierPersona.split('. ')[0] + '.')
    ));

    // Plans in motion
    if (state.plans.length) {
      const sec = el('div', { class: 'periph-section' });
      sec.appendChild(el('h3', {}, 'In motion for you'));
      sec.appendChild(el('p', { class: 'lede' }, '\u2014 what your specialists are tending to on your behalf.'));
      for (const plan of state.plans) {
        const isOpen = state.openPlanId === plan.id;
        const row = el('div', {
          class: 'periph-plan' + (isOpen ? ' is-open' : ''),
          onclick: (ev) => { ev.stopPropagation(); state.openPlanId = isOpen ? null : plan.id; renderPeriphery(); },
        });
        const rowTop = el('div', { class: 'periph-thread-row' });
        rowTop.appendChild(el('div', { class: 'pt-chip' }, '\u2737'));
        rowTop.appendChild(el('div', { class: 'pt-title' }, plan.title));
        rowTop.appendChild(el('div', { class: 'pt-state ' + (plan.state || 'motion') }));
        row.appendChild(rowTop);
        row.appendChild(el('div', { class: 'pt-meta' }, [plan.when, plan.where].filter(Boolean).join(' \u00b7 ')));
        if (isOpen) row.appendChild(renderPlanProgress(plan));
        sec.appendChild(row);
      }
      root.appendChild(sec);
    }

    // Thoughts
    if (state.threads.length) {
      const sec = el('div', { class: 'periph-section' });
      sec.appendChild(el('h3', {}, 'Thoughts'));
      for (const t of state.threads) {
        const sp = window.SPECIALISTS[t.specialist];
        const row = el('div', { class: 'periph-thread', onclick: () => openThread(t.specialist, t.title, null, t) });
        const rowTop = el('div', { class: 'periph-thread-row' });
        rowTop.appendChild(el('div', { class: 'pt-chip' }, initials(sp.name)));
        rowTop.appendChild(el('div', { class: 'pt-title' }, t.title));
        rowTop.appendChild(el('div', { class: 'pt-state ' + (t.private ? 'private' : (t.state || 'motion')) }));
        row.appendChild(rowTop);
        row.appendChild(el('div', { class: 'pt-meta' }, sp.name + ' · ' + (t.private ? 'in confidence' : (t.state === 'awaits' ? 'awaits you' : t.state === 'settled' ? 'settled' : 'in motion'))));
        sec.appendChild(row);
      }
      root.appendChild(sec);
    }

    // Confidence block
    if (state.privateCount) {
      root.appendChild(el('div', { class: 'periph-confidence', html: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <div class="pc-body">${state.privateCount} ${state.privateCount === 1 ? 'thought is' : 'thoughts are'} held in confidence \u2014 between you and the specialist.</div>
      ` }));
    }
  }

  // ═════════════ DIALOGUE ═════════════
  function captureActiveStream() {
    if (!state.activeThreadId) return;
    const t = state.threads.find(x => x.id === state.activeThreadId);
    if (t) t.streamHtml = $('#stream-inner').innerHTML;
  }

  function openThread(specialistKey, title, kickoff = null, existing = null) {
    log('thread:open', { specialist: specialistKey, title, hasKickoff: !!kickoff });

    // Snapshot the thread we're leaving so its history survives the switch.
    captureActiveStream();

    state.activeSpecialist = specialistKey;
    state.activeThreadTitle = title;
    state.threadPrivate = (existing && existing.private) || specialistKey === 'steward';
    document.body.classList.toggle('thread-private', state.threadPrivate);
    updateLockBtn();

    const sp = window.SPECIALISTS[specialistKey];
    $('#dialogue-who').textContent = sp.name.toUpperCase() + ' \u00b7 ' + sp.role;
    $('#dialogue-thread').textContent = title;

    // Restore the target thread's saved history, or start empty for a fresh thread.
    $('#stream-inner').innerHTML = (existing && existing.streamHtml) ? existing.streamHtml : '';

    document.body.classList.add('in-dialogue');

    // If we have a kickoff, push it and respond
    if (kickoff) {
      appendUserTurn(kickoff);
      setTimeout(() => respondAs(specialistKey, kickoff), 700);
    }

    // Add this thread to state if not already
    if (!existing) {
      const id = 't_' + Date.now();
      state.activeThreadId = id;
      state.threads.unshift({ id, specialist: specialistKey, title, state: 'motion', private: state.threadPrivate });
      if (state.threads.length > 4) state.threads.pop();
      renderPeriphery();
      publish({ type: 'thread_opened', specialist: specialistKey, title, private: state.threadPrivate, guestId: (window.ACTIVE_GUEST && window.ACTIVE_GUEST.id) || 'g_daniel_park' });
    } else {
      state.activeThreadId = existing.id;
      scrollStream();
    }
  }

  function closeDialogue() {
    captureActiveStream();
    document.body.classList.remove('in-dialogue');
    document.body.classList.remove('thread-private');
    state.activeSpecialist = null;
    state.activeThreadId = null;
  }

  // Return to the at-rest constellation so the guest can spawn a new thread,
  // while keeping the current thread (and its history) alive in the periphery.
  function newThreadFromDialogue() {
    captureActiveStream();
    document.body.classList.remove('in-dialogue');
    document.body.classList.remove('thread-private');
    state.activeSpecialist = null;
    state.activeThreadId = null;
    renderPeriphery();
  }

  function updateLockBtn() {
    const btn = $('#lock-btn');
    btn.classList.toggle('is-locked', state.threadPrivate);
    btn.querySelector('svg').innerHTML = state.threadPrivate
      ? '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'   // closed
      : '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3" transform="rotate(20 12 7)"/>'; // ajar
  }
  function togglePrivacy() {
    state.threadPrivate = !state.threadPrivate;
    document.body.classList.toggle('thread-private', state.threadPrivate);
    updateLockBtn();
    if (state.threadPrivate) {
      state.privateCount = Math.max(state.privateCount, 1);
    } else {
      state.privateCount = 0;
    }

    // Mirror onto the current thread record
    const active = state.threads.find(t => t.id === state.activeThreadId)
                || state.threads.find(t => t.specialist === state.activeSpecialist);
    if (active) active.private = state.threadPrivate;

    // Mirror onto any plans that belong to the active specialist's thread
    const affectedPlanTitles = [];
    state.plans.forEach(p => {
      if (p.specialist === state.activeSpecialist || (active && p.title && active.title && p.title.includes(active.title.split('—')[0].trim()))) {
        p.private = state.threadPrivate;
        affectedPlanTitles.push(p.title);
      }
    });

    publish({
      type: 'privacy_toggled',
      private: state.threadPrivate,
      title: state.activeThreadTitle,
      specialist: state.activeSpecialist,
      guestId: (window.ACTIVE_GUEST && window.ACTIVE_GUEST.id) || 'g_daniel_park',
      affectedPlanTitles,
    });
    renderPeriphery();
  }

  // ═════════════ STREAM A TURN ═════════════
  function appendUserTurn(text) {
    const inner = $('#stream-inner');
    const turn = el('div', { class: 'turn user' });
    turn.appendChild(el('div', { class: 'turn-meta' }, 'You'));
    turn.appendChild(el('div', { class: 'turn-body' }, text));
    inner.appendChild(turn);
    scrollStream();
  }

  function appendSpecialistTurn(specialistKey) {
    const sp = window.SPECIALISTS[specialistKey];
    const inner = $('#stream-inner');
    const turn = el('div', { class: 'turn specialist' });

    const head = el('div', { class: 'turn-head' });
    head.appendChild(el('div', { class: 'chip' }, initials(sp.name)));
    const nameWrap = el('div', {});
    nameWrap.appendChild(el('div', { class: 'role' }, sp.role));
    nameWrap.appendChild(el('div', { class: 'name' }, sp.name));
    head.appendChild(nameWrap);
    turn.appendChild(head);

    const body = el('div', { class: 'turn-body' });
    body.innerHTML = '<span class="cursor">|</span>';
    turn.appendChild(body);
    inner.appendChild(turn);
    scrollStream();
    return body;
  }

  function streamInto(body, text, cadence = 14) {
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        i++;
        body.innerHTML = text.slice(0, i).replace(/\n/g, '<br/>') + '<span class="cursor">|</span>';
        scrollStream();
        if (i >= text.length) {
          body.innerHTML = text.replace(/\n/g, '<br/>');
          resolve();
          return;
        }
        setTimeout(tick, cadence);
      };
      tick();
    });
  }

  function scrollStream() {
    const s = $('#stream'); s.scrollTop = s.scrollHeight;
  }

  // ═════════════ DIRECTIVE PARSING ═════════════
  // Specialists emit [[PLAN: ...]] (and [[BUTLER: ...]]) at the end of their
  // replies. We extract them, render the plan inline as an engraved card with
  // tap-to-handle staff actions, and remove the directive from what gets
  // displayed/spoken so the guest never sees the markup.
  function parseDirectives(rawText) {
    let text = rawText;
    let plan = null;
    // Normalize smart quotes so the field/action parsers below can rely on
    // straight ASCII " and '. Sonnet's literary register frequently emits
    // curly quotes, which would otherwise silently drop the whole PLAN.
    const normalize = (s) => s
      .replace(/[“”„‟″‶]/g, '"')
      .replace(/[‘’‚‛′‵]/g, "'");
    // PLAN ends with ]] — but the body contains a nested actions=[...] array,
    // so the raw text often looks like ...}]]]. The negative lookahead ensures
    // we don't terminate at the inner array's ] + PLAN's first ], which would
    // strip the inner closing bracket and silently zero out actions.
    const planRe = /\[\[PLAN:\s*([\s\S]*?)\]\](?!\])/;
    const m = text.match(planRe);
    if (m) {
      const body = normalize(m[1]);
      const grab = (key) => {
        const r = new RegExp('\\b' + key + '\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"', 'i');
        const x = body.match(r);
        return x ? x[1] : '';
      };
      const actions = [];
      const actionsBlock = body.match(/actions\s*=\s*\[([\s\S]*?)\](?:\s*\])?/i);
      if (actionsBlock) {
        const ab = actionsBlock[1];
        // Parse each {...} action object independently, then pluck title /
        // rationale / handler in any order. The previous regex required a
        // fixed order and rejected any inner quote, so a single reordered
        // key or apostrophe ("chef's tea") silently dropped the action.
        const objRe = /\{([^{}]*)\}/g;
        const fieldRe = (key) => new RegExp('\\b' + key + '\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"', 'i');
        let om, i = 0;
        while ((om = objRe.exec(ab)) !== null) {
          const inner = om[1];
          const tt = inner.match(fieldRe('title'));
          const rr = inner.match(fieldRe('rationale'));
          const hh = inner.match(fieldRe('handler'));
          if (tt && hh) {
            actions.push({
              id: 'a_' + Date.now() + '_' + (i++),
              title: tt[1],
              rationale: rr ? rr[1] : '',
              handler: hh[1],
            });
          }
        }
      }
      plan = {
        kind: grab('kind') || 'plan',
        title: grab('title') || 'A plan',
        when: grab('when'),
        where: grab('where'),
        who: grab('who'),
        detail: grab('detail'),
        actions,
      };
      text = text.replace(planRe, '').trim();
    }
    // Also strip any [[FORK]] or [[BUTLER]] directives from the displayed text
    // so they never reach the guest's eyes/ears as markup.
    text = text
      .replace(/\[\[FORK:[\s\S]*?\]\]/g, '')
      .replace(/\[\[BUTLER:[\s\S]*?\]\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { text, plan };
  }

  // Gather the in-thread conversation as Anthropic-shaped messages so Claude
  // remembers what was already proposed and agreed to. Reads the rendered DOM,
  // skips the empty specialist placeholder (cursor-only body), merges any
  // accidental same-role neighbors, and drops leading assistant turns so the
  // first message is always 'user' as the API requires.
  function gatherThreadMessages() {
    const turns = Array.from(document.querySelectorAll('#stream-inner .turn'));
    const out = [];
    for (const turn of turns) {
      const bodyEl = turn.querySelector('.turn-body');
      if (!bodyEl) continue;
      const text = (bodyEl.textContent || '').replace(/\|$/, '').trim();
      if (!text) continue;
      const role = turn.classList.contains('user') ? 'user' : 'assistant';
      const last = out[out.length - 1];
      if (last && last.role === role) last.content += '\n\n' + text;
      else out.push({ role, content: text });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    const MAX = 16;
    return out.length > MAX ? out.slice(-MAX) : out;
  }

  // ═════════════ RESPOND ═════════════
  async function respondAs(specialistKey, userText) {
    // Snapshot the conversation BEFORE we drop in the empty specialist
    // placeholder, so Claude sees the real prior turns (ending in the guest's
    // latest utterance, which the caller has already appended).
    const history = gatherThreadMessages();
    const body = appendSpecialistTurn(specialistKey);
    const orb = $('#dialogue .head-orb atelier-orb');
    orb && orb.setState && orb.setState('speaking');

    // Try Anthropic if we have a key; fall back to a default polished reply.
    let raw;
    try {
      if (anthropicKey() && !state.presenterSafe) {
        raw = await callClaudeFor(specialistKey, userText, history);
      } else {
        raw = defaultReply(specialistKey, userText);
      }
    } catch (e) {
      console.warn('Anthropic call failed:', e);
      raw = defaultReply(specialistKey, userText);
    }

    // Extract any plan directive emitted by the specialist
    const { text, plan } = parseDirectives(raw);
    log('respondAs', { specialist: specialistKey, hasPlan: !!plan, wordCount: text.split(/\s+/).filter(Boolean).length });

    await streamInto(body, text);
    speakText(text, specialistKey).catch(() => {});

    // Render the agentic plan inline AFTER the spoken prose — this is the
    // signature moment of the studio: a commitment, not a recommendation.
    if (plan && !state.threadPrivate) {
      // Brief beat after the streamed prose, then the card slides in
      setTimeout(() => appendPlanCard(plan), 600);
    }

    if (orb && orb.setState) orb.setState('rest');

    // Auto-arm follow-up listening after specialist finishes — the guest can
    // continue without re-summoning the wake word. The thread stays open even
    // after a plan card lands so the guest can read and act on it; closing
    // is now explicit (manual dismissal, new thread, or a follow-up signal).
    armFollowUp();
  }

  function anthropicKey() {
    return (window.__local_keys && window.__local_keys.anthropic)
        || (typeof localStorage !== 'undefined' && localStorage.getItem('atelier_anthropic_key'))
        || null;
  }

  function claudeHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  async function callClaudeFor(specialistKey, userText, history = null) {
    const sp = window.SPECIALISTS[specialistKey];
    const p = window.PROPERTIES[state.propertyId];
    // Anthropic requires messages alternate and start with 'user'. If the caller
    // didn't pass any history (e.g. older call sites), send the single turn.
    const messages = (history && history.length && history[history.length - 1].role === 'user')
      ? history
      : [{ role: 'user', content: userText }];
    log('claude:call', { specialist: specialistKey, role: sp && sp.role, userText, property: state.propertyId, turns: messages.length });
    const __t0 = Date.now();

    // Special-case the Atelier itself \u2014 it is the HOST, not a specialist.
    // It does not solve the work; it clarifies what the guest wants and, once
    // there is enough to go on, names the specialist it would bring in.
    const isHost = specialistKey === 'atelier';
    const sys = isHost
      ? `You are The Atelier \u2014 the host of a private thinking studio in a Rosewood suite at ${p.name}. ${p.atelierPersona}

The guest has just said something to you. Your role here is to HOLD the conversation briefly, in your own voice \u2014 not to perform a specialist's work yourself. You can do one of three things, depending on what the guest needs:

1. If the message is social or warm (a greeting, a "how are you", a thank you), reply briefly and warmly in two or three sentences. Acknowledge the guest, then invite them to share what is on their mind. Do not propose specific things.

2. If the message is vague or open ("help me", "I don't know what I want", "what can you do"), gently surface what the studio holds \u2014 that you keep a roster of specialists (the Strategist, the Convener, the Caretaker / Physician, the Curator, the Sommelier, the Writer, others) and that anything from a deal to a dinner to a recovery week to a draft of a letter is at hand. End with one open invitation: "Where would you like to begin?"

3. If the message is starting to point somewhere but is still general, ask one short clarifying question. Then, in a single sentence, name the specialist you would bring in once you understand it better. Format like: "When you say <X>, do you mean <A> or <B>? Once I know, I'll have <The Specialist> sit with you on it."

Voice: literary but unstrained \u2014 Marilynne Robinson or Pico Iyer. Restrained. Never effusive. No exclamation marks, no emojis, no "Happy to help!" or AI-isms. Two to three short sentences total in most cases. Do not generate a long reply.

The guest is Daniel Park, a founder closing a Series B Friday, currently travel-fatigued (HRV 51, sleep 5.8h fragmented). Let that shape your register if it is relevant; otherwise hold it quietly.`
      : `You are ${sp.name} \u2014 ${sp.role} \u2014 a specialist in The Atelier studio at ${p.name}. ${p.atelierPersona}

GUEST: Daniel Park, a founder closing a Series B Friday. Travel-fatigued (HRV 51, 5.8h fragmented sleep, readiness 58, JFK to PT). Let that shape your register quietly; do not list signals back at him.

VOICE \u2014 this will be SPOKEN ALOUD, not read.
- TWO short sentences by default. Up to FOUR only when the work truly demands it.
- Conversational, declarative, in your own register as ${sp.name}.
- Never enumerate. Never list bullets. Never use exclamation marks or emojis.
- Never AI-isms ("Happy to help!" / "I'd be happy to..." / "Let me know if...").
- Open with the answer or the action. Save context for later sentences.
- TIMES: always 12-hour AM/PM ("7:30 pm", "9:00 am") — never 24-hour ("19:30").

ACT \u2014 DO NOT ADVISE.
The Atelier is not a chatbot offering options. It is the studio doing the work.
Whenever the guest mentions a real moment \u2014 a dinner to host, a meeting to prep, a recovery hour to keep, a draft to start, a gesture to make \u2014 COMMIT. Pick the time, the place, the small details. The guest should feel weight lift, not collect more choices.

When you commit to something concrete, emit a structured plan AT THE END of your reply, on its own lines, in exactly this format:

[[PLAN: kind="dining|evening|recovery|gesture|draft|preparation|ceremony|reservation" | title="2-6 word title" | when="concrete time" | where="concrete place" | who="attendees, comma-separated" | detail="one short paragraph in your voice" | actions=[{title: "what staff should do", rationale: "one sentence why", handler: "The Concierge|The Sommelier|The Florist|The Convener|The Caretaker"}]]]

Include 1-3 actions. They must be single tasks a property team member can pick up with one tap. They should genuinely lift work from the guest.

If nothing has crystallised yet, ask ONE short question \u2014 never two \u2014 and do not emit a plan yet.

${state.threadPrivate ? 'PRIVACY: this thread is held in confidence. Soften your register. DO NOT emit a PLAN with handler actions (staff cannot see the context and would be acting blind). Action cards you handle yourself remain available. Do not mention the privacy unless the guest asks.' : ''}`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: claudeHeaders(),
      body: JSON.stringify({
        // Current Sonnet — claude-sonnet-4-20250514 (the previous name) was deprecated
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 800,
        system: sys,
        messages,
      }),
    });
    if (!resp.ok) {
      // Try a one-shot fallback to a stable older model so the demo keeps moving
      console.warn('[atelier] anthropic ' + resp.status + ' — trying claude-3-5-sonnet fallback');
      const r2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: claudeHeaders(),
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 800,
          system: sys,
          messages,
        }),
      });
      if (!r2.ok) throw new Error('anthropic ' + r2.status);
      const data2 = await r2.json();
      return (data2.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    }
    const data = await resp.json();
    const out = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    if (!out) throw new Error('empty content');
    log('claude:reply', { specialist: specialistKey, ms: Date.now() - __t0, len: out.length, preview: out.slice(0, 140) });
    return out;
  }

  function defaultReply(specialistKey, userText) {
    // Polished offline replies per specialist for the demo.
    const sp = window.SPECIALISTS[specialistKey];
    const TABLE = {
      atelier:    "Tell me what is on your mind \xe2\x80\x94 a deal, an evening, a recovery hour, a quiet moment. I'll bring the right specialist.",
      // Sand Hill
      strategist: "Read me the term that's troubling you. I'll tell you what to push back on.",
      convener:   "Four covers, Madera private room, 7:00 pm Thursday. A ceremonial tea service through the meal, Sand Hill honey at each cover. I'll hold the room.",
      physician:  "Madera at 7:30 pm and Asaya at 4:00 pm \xe2\x80\x94 that's tomorrow ready by 9:30 am. I have drafted it.",
      steward:    "Held in confidence. Tell me, in your own time.",
      // Crillon
      aesthete:   "Sotheby's preview opens Thursday at 10. I'll have you in the room before it crowds.",
      curator:    "Selby's at 7:30 pm, the corner two. Quiet enough for four, close enough to be back by 10:00 pm. I'll hold it.",
      celebrant:  "On the rooftop at golden hour, ten guests. I'll hold Saturday 6:30 pm.",
      // Kona Village
      mariner:    "Outrigger at first light tomorrow \xe2\x80\x94 the captain's already up. Two hours, back for breakfast.",
      naturalist: "The manta dive at last light tomorrow \xe2\x80\x94 I'll hold two seats on the catamaran.",
      // Universal
      concierge:  "Car at 7:00 pm from the entrance, 25 minutes in evening traffic. I'll confirm.",
      sommelier:  "A Sand Hill estate cold-brew with the second course, a ceremonial tea through the meal, and the garden-herb pour we keep for guests who want something with intention.",
      historian:  "Ramaytush Ohlone land \xe2\x80\x94 fished the creeks that still run under Sand Hill Road. I'll bring you the longer version when you have an hour.",
    };
    return TABLE[specialistKey] || "Tell me a little more.";
  }

  // ═════════════ VOICE LOOP ═════════════
  //
  // Two modes:
  //   AMBIENT  — continuous, low-effort listening just for the wake word "atelier".
  //              On match, hands off to ACTIVE mode with whatever followed the wake word.
  //   ACTIVE   — captures the full utterance and submits after a silence pause.
  //              Two sub-flavors: wake-initiated (1.6s pause) and follow-up
  //              (3.5s pause — a thoughtful mid-conversation gap is allowed).
  //
  // After the specialist replies (TTS ends), follow-up is auto-armed so the
  // guest can speak the next turn without saying "atelier" again. If 30s pass
  // in silence, we fall back to AMBIENT — wake word required again.

  let ambientRecognition = null, activeRecognition = null;
  let isAmbient = false, isActive = false;
  let followUpMode = false;
  let followUpFallbackTimer = null;
  let activeSilenceTimer = null;
  let lastActiveTranscript = '';
  let isTTSPlaying = false;
  let pendingOffer = null; // { specialistKey, threadTitle, expiresAt }

  // Web Speech mishears "atelier" — especially with French pronunciation —
  // very aggressively. Two failure modes:
  //   (a) Single-token mishearings: "retaliate", "atelyer", "italia", "italian"
  //   (b) Multi-token mishearings: French /atɛlje/ → English "I tell", "a tale",
  //       "I tale", "a tell", "I tell you", etc.
  //
  // Strategy: match the START of the transcript (the wake word should always be
  // first) against any of a broad set of patterns. False positives are recoverable
  // (the user just has 1.6s of silence before submit), false negatives are not.
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = new Array(n + 1);
    for (let j = 0; j <= n; j++) d[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= n; j++) {
        const cur = d[j];
        d[j] = (a.charCodeAt(i - 1) === b.charCodeAt(j - 1))
          ? prev
          : 1 + Math.min(prev, d[j], d[j - 1]);
        prev = cur;
      }
    }
    return d[n];
  }

  // Patterns that match the OPENING of a transcript. Anything matching here
  // is consumed as the wake word; whatever follows is the user's message.
  const WAKE_OPENING_PATTERNS = [
    // Direct, close, or partial matches to "atelier"
    /^\s*(hey |ok |okay |hi |hello )?(atelier|attelier|atelyer|atelyay|atalyay|atalier|atalia|atelia|attaliae|attalia|atelyaye|atallier|attallier|atilier|attilier|otillier)\b[,.\s]*/i,
    // Common single-token mishearings
    /^\s*(hey |ok |okay )?(retaliate|retaliator|retailer|retalia|italia|italian|italier|atelio|atelya|familiar|affiliate|australia|austrailia|otalia|otalya|hotalia)\b[,.\s]*/i,
    /^\s*(hotelier|hotellier|hotel year|hotel ear)\b[,.\s]*/i,

    // Multi-token mishearings of French /atɛlje/. The recognizer often hears
    // it as two English words. We accept all common shapes:
    //   "I tell", "I tale", "I telly", "I taller", "a tell", "a tale", "at a tell"
    //   "the leer", "a leer", "a teller", "a tellier", "I'll tell", "post to tell"
    /^\s*(hey |ok |okay )?(i|i'?ll|a|at|hey|the|post|push|pop|posts?)\s+(to\s+)?(tell|tale|teller|tellier|telly|tailor|taller|laye?r|leer|tier)(\s+(you|here|her|ear|air|aye|yeah|ya))?[,.\s]*/i,
    /^\s*(hey |ok |okay )?(at the|at a|on the|on a|out a|out the|post to|i.?ll)\s+(leer|layer|tier|tale|tell|tailor)[,.\s]*/i,
    /^\s*(oh|ah|uh|ohh)\s+(telly|tally|tellie?)\s+(air|ear|aye|yeah)[,.\s]*/i,
    /^\s*(add|that|out|but) (a |the )?(leer|layer|tier|tailor)[,.\s]*/i,

    // "Tell you later", "tell ya later" — French-accented atelier sometimes
    // gets parsed as the full "tell you" before continuing speech
    /^\s*(hey |ok |okay )?(tell|tale)\s+(you|ya)\s+(later|leer|here|ear)[,.\s]*/i,
  ];

  function hasWakeWord(transcript) {
    if (!transcript) return false;
    const t = transcript.trim();
    // Opening-pattern check (handles single + multi-token wake-word mishearings)
    for (const p of WAKE_OPENING_PATTERNS) if (p.test(t)) return true;
    // Levenshtein backstop — any single token within edit-distance 2 of "atelier"
    const tokens = t.toLowerCase().split(/[\s,.;:!?\-]+/).filter(Boolean);
    for (const tk of tokens) {
      if (tk.length < 4 || tk.length > 11) continue;
      if (levenshtein(tk, 'atelier') <= 2) return true;
    }
    return false;
  }
  function stripWakeWord(transcript) {
    let t = transcript;
    // Strip the FIRST matching opening pattern so what remains is the message
    for (const p of WAKE_OPENING_PATTERNS) {
      if (p.test(t)) { t = t.replace(p, ''); break; }
    }
    // Also strip a leading Levenshtein-near token if anything's left
    const parts = t.split(/(\s+)/);
    for (let i = 0; i < parts.length; i++) {
      const tk = parts[i].toLowerCase();
      if (!tk.trim()) continue;
      if (tk.length >= 4 && tk.length <= 11 && levenshtein(tk, 'atelier') <= 2) {
        parts[i] = '';
        break;
      }
      break; // only strip the very first token
    }
    return parts.join('').replace(/\s{2,}/g, ' ').replace(/^[,.;:\s\-]+/, '').trim();
  }

  function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }
    // Defer starting ambient until the user enters the studio
  }

  function startAmbient() {
    console.log('[atelier] startAmbient called. micOn=', state.micOn, 'isAmbient=', isAmbient, 'isActive=', isActive, 'isTTSPlaying=', isTTSPlaying, 'micStatus=', micStatus);
    if (!state.micOn) { console.log('[atelier] startAmbient aborted: voice is off'); return; }
    if (isAmbient || isTTSPlaying) { console.log('[atelier] startAmbient aborted: already ambient or TTS playing'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.warn('[atelier] SpeechRecognition not supported'); micStatus = 'unsupported'; updateMicVisual(); return; }
    if (ambientRecognition) { try { ambientRecognition.stop(); } catch (e) {} }
    ambientRecognition = new SR();
    ambientRecognition.continuous = true;
    ambientRecognition.interimResults = true;
    ambientRecognition.lang = 'en-US';
    isAmbient = true;
    ambientRecognition.onstart       = () => console.log('[atelier] ambient.onstart');
    ambientRecognition.onaudiostart  = () => console.log('[atelier] ambient.onaudiostart');
    ambientRecognition.onsoundstart  = () => console.log('[atelier] ambient.onsoundstart');
    ambientRecognition.onspeechstart = () => console.log('[atelier] ambient.onspeechstart');
    ambientRecognition.onspeechend   = () => console.log('[atelier] ambient.onspeechend');
    ambientRecognition.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const txt = r[0].transcript;
        const isFinal = r.isFinal;
        const wakeMatch = hasWakeWord(txt);
        log('ambient.onresult', { txt, final: isFinal, wakeMatch });
        showHeard(txt);

        // Path 1 — explicit wake match (immediate, interim or final)
        if (wakeMatch) {
          const seed = stripWakeWord(txt);
          log('wake:explicit', { seed });
          stopAmbient();
          startActive(seed, /*fromWake*/ true);
          return;
        }

        // Path 2 — implicit wake. Web Speech mishears the French pronunciation
        // of "atelier" as wildly different English words. To make voice
        // reliable without picking up across-the-room chatter, any FINAL
        // utterance of FOUR or more words at the at-rest stage counts as the
        // guest engaging the studio. Push-to-talk (the mic button under the orb)
        // handles shorter intentional asks.
        if (isFinal && !state.activeSpecialist) {
          const trimmed = txt.trim();
          const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
          if (wordCount >= 4) {
            log('wake:implicit', { txt: trimmed, wordCount });
            stopAmbient();
            startActive(trimmed, /*fromWake*/ false);
            return;
          }
        }
      }
    };
    ambientRecognition.onerror = (ev) => {
      console.warn('[atelier] ambient.onerror:', ev.error, ev.message || '');
      // 'no-speech' and 'aborted' are normal — the recognizer will end naturally
      // and onend will decide whether to restart. We just refresh the visual.
      if (ev.error === 'no-speech' || ev.error === 'aborted') {
        updateMicVisual();
        return;
      }
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        micStatus = 'denied';
        isAmbient = false;
        updateMicVisual();
        flashHint('Microphone blocked — allow it in the browser to use voice');
      } else if (ev.error === 'audio-capture' || ev.error === 'network') {
        micStatus = 'denied';
        isAmbient = false;
        updateMicVisual();
      }
    };
    ambientRecognition.onend = () => {
      const willRestart = isAmbient && !isActive && !isTTSPlaying;
      console.log('[atelier] ambient.onend. willRestart=', willRestart);
      if (willRestart) {
        setTimeout(() => { try { if (isAmbient) ambientRecognition.start(); } catch (e) { console.warn('[atelier] ambient restart threw', e); } }, 200);
      } else {
        // The recognizer has actually stopped — reflect that in the UI so the
        // top-right pill doesn't lie about being "on".
        isAmbient = false;
        updateMicVisual();
      }
    };
    try {
      ambientRecognition.start();
      micStatus = micStatus === 'denied' ? 'denied' : 'granted';
      console.log('[atelier] ambientRecognition.start() called OK');
    } catch (e) {
      console.warn('[atelier] ambientRecognition.start() threw:', e && e.name, e && e.message);
    }
    updateMicVisual();
  }

  function stopAmbient() {
    isAmbient = false;
    if (ambientRecognition) {
      try { ambientRecognition.stop(); } catch (e) {}
      ambientRecognition = null;
    }
    updateMicVisual();
  }

  function startActive(seedTranscript, fromWake) {
    if (!state.micOn) return;
    if (isActive || isTTSPlaying) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopAmbient();
    activeRecognition = new SR();
    activeRecognition.continuous = true;
    activeRecognition.interimResults = true;
    activeRecognition.lang = 'en-US';
    isActive = true;
    lastActiveTranscript = seedTranscript || '';
    // wake-initiated: 1.6s silence; follow-up: 3.5s silence
    const silenceMs = followUpMode ? 3500 : 1600;
    const inputId = state.activeSpecialist ? 'dialogue-input' : 'at-rest-input';
    const inp = document.getElementById(inputId);
    if (inp && lastActiveTranscript) inp.value = lastActiveTranscript;

    const resetSilence = () => {
      if (activeSilenceTimer) clearTimeout(activeSilenceTimer);
      activeSilenceTimer = setTimeout(() => {
        if (isActive && lastActiveTranscript.trim()) {
          try { activeRecognition.stop(); } catch (e) {}
        }
      }, silenceMs);
    };

    activeRecognition.onresult = (ev) => {
      const txt = Array.from(ev.results).map(r => r[0].transcript).join('');
      lastActiveTranscript = ((seedTranscript ? seedTranscript + ' ' : '') + txt).trim();
      if (inp) inp.value = lastActiveTranscript;
      resetSilence();
    };
    activeRecognition.onerror = (ev) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      console.warn('Active recognition error:', ev.error);
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        micStatus = 'denied';
        flashHint('Microphone blocked — allow it in the browser to use voice');
      }
      stopActive(true);
    };
    activeRecognition.onend = () => {
      const finalText = lastActiveTranscript.trim();
      stopActive(/*resumeAmbient*/ false);
      if (finalText) {
        if (inp) inp.value = '';
        handleUtterance(finalText);
      } else if (state.micOn) {
        // No words captured — drop back to ambient
        startAmbient();
      }
    };
    try {
      activeRecognition.start();
      resetSilence();
    } catch (e) {
      console.warn('Could not start active recognition:', e);
      stopActive(true);
    }
    updateMicVisual();
  }

  function stopActive(resumeAmbient) {
    if (activeSilenceTimer) { clearTimeout(activeSilenceTimer); activeSilenceTimer = null; }
    if (activeRecognition) {
      try { activeRecognition.stop(); } catch (e) {}
      activeRecognition = null;
    }
    isActive = false;
    followUpMode = false;
    if (followUpFallbackTimer) { clearTimeout(followUpFallbackTimer); followUpFallbackTimer = null; }
    if (resumeAmbient && state.micOn && !isTTSPlaying) {
      setTimeout(() => { if (!isActive && !isTTSPlaying) startAmbient(); }, 400);
    }
    updateMicVisual();
  }

  // Arm follow-up listening after a specialist's reply has finished playing.
  // Lets the guest continue without re-summoning. Falls back to ambient after 30s.
  // Also valid when no thread is active but a pending approval window is open —
  // the guest may want to say "approve all three" right after the plan lands.
  function armFollowUp() {
    const hasPending = state.pendingApproval && Date.now() < state.pendingApproval.expiresAt;
    if (!state.micOn) { log('armFollowUp:skip:mic-off'); return; }
    if (!state.activeSpecialist && !hasPending) {
      log('armFollowUp:skip:no-context', { hasPending });
      return;
    }
    log('armFollowUp:arming', { specialist: state.activeSpecialist, hasPending });
    // Wait until TTS has actually finished before opening the mic
    const tryArm = () => {
      if (isTTSPlaying) { setTimeout(tryArm, 250); return; }
      if (isActive) { log('armFollowUp:skip:already-active'); return; }
      followUpMode = true;
      setTimeout(() => startActive('', /*fromWake*/ false), 350);
      if (followUpFallbackTimer) clearTimeout(followUpFallbackTimer);
      followUpFallbackTimer = setTimeout(() => {
        if (isActive && followUpMode) { followUpMode = false; stopActive(true); }
      }, 30000);
    };
    tryArm();
  }

  // Manual mic trigger from the UI buttons
  function startListen() {
    if (isActive) return;
    if (isAmbient) { stopAmbient(); }
    startActive('', /*fromWake*/ false);
  }
  // Mic permission status: 'unknown' | 'granted' | 'denied' | 'unsupported'
  let micStatus = 'unknown';

  function updateMicVisual() {
    const live = isActive;
    const arm = $('#at-rest-mic'); if (arm) arm.classList.toggle('is-live', live);
    const dlm = $('#dialogue-mic'); if (dlm) dlm.classList.toggle('is-live', live);
    const ptt = $('#ptt-button'); if (ptt) ptt.classList.toggle('is-live', live);
    const pttLabel = $('#ptt-label');
    if (pttLabel) pttLabel.textContent = live ? 'Listening' : (isAmbient ? 'Tap to speak' : 'Tap to speak');
    const orb = $('#orb');
    if (orb && orb.setState) {
      orb.setState(isTTSPlaying ? 'speaking' : (live ? 'listening' : 'rest'));
    }

    // Top-right pill reflects the ACTUAL listening state, not just the preference.
    // Four states:
    //   on       — recognizer is running (ambient OR active capture)
    //   idle     — voice mode preference is on, but recognizer isn't running this instant (TTS playing, transient)
    //   off      — user has turned voice off (or permission denied)
    //   blocked  — Chrome has blocked the mic
    let micLabel, isLive;
    if (micStatus === 'denied') {
      micLabel = 'blocked';
      isLive = false;
    } else if (micStatus === 'unsupported') {
      micLabel = 'unsupported';
      isLive = false;
    } else if (!state.micOn) {
      micLabel = 'off';
      isLive = false;
    } else if (isAmbient || isActive) {
      micLabel = 'on';
      isLive = true;
    } else if (isTTSPlaying) {
      micLabel = 'paused';
      isLive = false;
    } else {
      micLabel = 'idle';
      isLive = false;
    }
    const mt = $('#mic-toggle');
    if (mt) mt.classList.toggle('is-live', isLive);
    const ms = $('#mic-state');
    if (ms) ms.textContent = micLabel;

    // Reactive at-rest eyebrow text
    const ebText = $('#at-rest-eyebrow-text');
    if (ebText) {
      let html;
      if (!state.micOn) {
        html = 'Voice off &middot; type below or tap the mic';
      } else if (micStatus === 'denied') {
        html = 'Microphone blocked &middot; type below, or grant access in the browser';
      } else if (micStatus === 'unsupported') {
        html = 'Voice not supported in this browser &middot; type below';
      } else if (isTTSPlaying) {
        html = '<em>Speaking…</em>';
      } else if (isActive && followUpMode) {
        html = '<em>I am listening &mdash; continue when ready</em>';
      } else if (isActive) {
        html = '<em>I am listening</em>';
      } else if (isAmbient) {
        html = 'Speak <em>Atelier</em> to begin &middot; or tap the mic below';
      } else {
        html = 'Tap the mic below, or say <em>Atelier</em>';
      }
      ebText.innerHTML = html;
    }
  }

  function handleUtterance(text) {
    text = text.trim();
    if (!text) return;
    log('utterance', { text });
    // Any new utterance dismisses a lingering whisper from the host
    const w = document.getElementById('atelier-whisper');
    if (w && !w.hidden) dismissWhisper();
    const low = text.toLowerCase();

    // Pending offer responder — if the Atelier just offered to switch threads
    if (pendingOffer && Date.now() < pendingOffer.expiresAt) {
      if (/^(yes|yeah|yep|sure|please|ok|okay|go|do it|take me|bring me|switch|let.?s go)$/i.test(low) ||
          /^(yes|yeah|ok|sure)[,\s]+(take me|bring me|switch|please|go)/i.test(low)) {
        const { specialistKey, threadTitle } = pendingOffer;
        pendingOffer = null;
        // Switch to the existing thread if present
        const existing = state.threads.find(t => t.specialist === specialistKey);
        if (existing) openThread(specialistKey, existing.title, null, existing);
        else openThread(specialistKey, threadTitle || ('A note from ' + (window.SPECIALISTS[specialistKey] || {}).name));
        return;
      }
      if (/^(no|nope|not now|later|in a moment|stay here|finish this|keep going|continue)$/i.test(low) ||
          /^(no|not)[,\s]+(thanks|now|yet|later)/i.test(low)) {
        pendingOffer = null;
        speakText('Saved for later.', 'atelier').catch(() => {});
        return;
      }
      // fall through — ignored, will expire on its own
    }

    // ─── Pending approval intent ───
    // If a plan has just landed and is awaiting the guest's nod, intercept
    // approval-like phrases here so they don't get routed to a fresh specialist
    // call that has no idea what the guest is referring to. Handles:
    //   • "approve all" / "approve them" / "yes all of them" / "yes" / "do it"
    //   • "approve the room" / "approve the car"
    //   • "approve the first one" / "do the third"
    if (state.pendingApproval && Date.now() < state.pendingApproval.expiresAt) {
      const pa = state.pendingApproval;
      const pending = pa.actions.filter(a => !pa.approvedIds.has(a.id));
      log('pending-approval:considering', { text, pendingCount: pending.length, totalActions: pa.actions.length });
      if (pending.length > 0) {
        const intent = detectApprovalIntent(low, pa);
        if (intent) {
          log('pending-approval:intent-matched', { intent, text });
          handleApprovalIntent(intent, pa);
          return;
        } else {
          log('pending-approval:no-intent', { text });
        }
      } else {
        log('pending-approval:nothing-pending', { totalActions: pa.actions.length });
      }
    } else if (state.pendingApproval) {
      log('pending-approval:expired', { ageMs: Date.now() - state.pendingApproval.capturedAt });
      state.pendingApproval = null;
    }

    // Spoken thread inventory
    if (/^(what am i working on|where is my mind|what.?s in motion|what threads|tell me what i.?m thinking)/i.test(low)) {
      const ts = state.threads;
      if (!ts.length) { speakText('The studio is quiet. Begin a conversation, and I will hold it.', 'atelier'); return; }
      const lines = ts.map(t => `${t.title} with ${(window.SPECIALISTS[t.specialist] || {}).name}${t.private ? ', held in confidence' : ''}`);
      const joined = lines.length === 1 ? lines[0] : lines.slice(0, -1).join('; ') + '; and ' + lines[lines.length - 1];
      speakText(`You have ${ts.length} ${ts.length === 1 ? 'thought' : 'thoughts'} in the studio. ${joined}.`, 'atelier');
      return;
    }

    // Quiet voice mode
    if (/^(atelier[,\s]+)?(quiet|silence|stop speaking|turn off voice|voice off)$/i.test(low)) {
      state.micOn = false; updateMicVisual(); stopAmbient(); stopActive(false);
      return;
    }

    // Property switch
    if (/(switch to|take me to|go to|bring me to) (sand hill|sandhill|hong kong|hongkong|crillon|carlyle|kona|phuket)/i.test(low)) {
      const m = low.match(/(sand hill|sandhill|hong kong|hongkong|crillon|carlyle|kona|phuket)/i)[1];
      const map = { 'sand hill': 'sandhill', sandhill: 'sandhill', 'hong kong': 'hongkong', hongkong: 'hongkong', crillon: 'crillon', carlyle: 'carlyle', kona: 'konavillage', phuket: 'phuket' };
      switchProperty(map[m]); return;
    }

    // Privacy toggle
    if (/(make (this|it)|keep this)\s*(thread|conversation)?\s*(private|confidential)|^(between us|in confidence|hold this between us|private this)$/i.test(low)) {
      if (!state.threadPrivate) togglePrivacy(); return;
    }
    if (/(make (this|it)|share this|no longer)\s*(thread|conversation)?\s*(public|visible|no longer private)/i.test(low)) {
      if (state.threadPrivate) togglePrivacy(); return;
    }

    // Otherwise route as content
    routeContent(text);
  }

  // ═════════════ APPROVAL INTENT ═════════════
  //
  // Returns an "intent" describing what the guest meant by an approval-shaped
  // utterance, or null if nothing matches. Intent shapes:
  //   { kind: 'all' }                          — approve every unapproved action
  //   { kind: 'one', actionId: 'a_room' }       — approve a specific action
  //
  // Word numbers ("first", "second", "third") map to ORDER in the original plan.
  // Keyword matches ("room", "car", "pairing") map against action title words.
  function detectApprovalIntent(low, pa) {
    // ── Hard "approve everything" patterns ──
    const ALL_PATTERNS = [
      // single-word affirmations / commands
      /^(yes|yeah|yep|yup|sure|please|ok|okay|approve|approved|confirm|confirmed|go|proceed|do)[!.\s]*$/i,
      // multi-word, sentence-start
      /^(yes|yeah|yep|yup|sure|please|ok|okay)[,\s]+(approve|do|send|go|please|all|to all|to it|let'?s)\b/i,
      /^(do it|send it|send them|send them all|do all|do all of (it|them)|all of them|all three|all two|all of it)\b/i,
      /^(approve all|approve them|approve everything|approve all (of )?(them|three|two|the\b))/i,
      /^(go ahead|go for it|let'?s go|let'?s do it|do that|run with it|make it so|push it through|send it through)\b/i,
      /^(perfect|great|good|sounds good|that works|do it all|do them all|all good|looks good)\b/i,
      // anywhere in the sentence
      /\b(approve|do|send|confirm)\s+(all|the (rest|lot)|everything|them|those|these|all three|all two|all of (them|it|three|two))\b/i,
      /\b(yes,?\s+)?do all of (them|it|those|three|two)\b/i,
    ];
    for (const re of ALL_PATTERNS) {
      if (re.test(low)) return { kind: 'all', why: 'pattern:' + re.source.slice(0, 40) };
    }

    // ── Ordinal: "approve the first", "do the second", "the third one" ──
    const ORD = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2 };
    const ordMatch = low.match(/\b(?:approve\s+(?:the\s+)?|do\s+(?:the\s+)?|the\s+)(first|second|third|1st|2nd|3rd)(?:\s+one)?\b/);
    if (ordMatch) {
      const idx = ORD[ordMatch[1]];
      if (typeof idx === 'number' && pa.actions[idx]) {
        return { kind: 'one', actionId: pa.actions[idx].id, why: 'ordinal:' + ordMatch[1] };
      }
    }

    // ── Keyword match against action titles (any meaningful word from the title) ──
    // Skip very short common words.
    const STOP = new Set(['the','a','for','at','on','of','and','to','with','in','by','an','one','two','three','it','that','this','from','out','as','is']);
    if (/^(approve|do|send|confirm|book|arrange|hold|set|yes)\b/.test(low)) {
      for (const a of pa.actions) {
        const titleWords = (a.title || '').toLowerCase().split(/\W+/).filter(w => w && !STOP.has(w) && w.length > 3);
        for (const w of titleWords) {
          if (low.includes(w)) {
            return { kind: 'one', actionId: a.id, why: 'keyword:' + w };
          }
        }
      }
    }

    return null;
  }

  async function handleApprovalIntent(intent, pa) {
    let targetActions = [];
    if (intent.kind === 'all') {
      targetActions = pa.actions.filter(a => !pa.approvedIds.has(a.id));
    } else if (intent.kind === 'one' && intent.actionId) {
      const a = pa.actions.find(x => x.id === intent.actionId);
      if (a && !pa.approvedIds.has(a.id)) targetActions = [a];
    }
    log('approval:dispatch', {
      intent,
      targetCount: targetActions.length,
      targetIds: targetActions.map(a => a.id),
    });
    if (!targetActions.length) {
      // Nothing left to approve — gentle acknowledgment in the host voice.
      speakText('Already with the property team.', 'atelier').catch(() => {});
      return;
    }

    // Mark and publish each one. Use a minimal pseudo-plan object for the publish
    // payload — we only need title here for the operator's UI.
    const pseudoPlan = { title: pa.planTitle };
    for (const a of targetActions) {
      onGuestApprove(a.id, pseudoPlan, { source: 'voice' });
    }

    // Speak a single, short acknowledgment in the specialist's voice if we know
    // who owns the plan; otherwise fall back to the Atelier host voice. The line
    // adapts to single vs multi approvals.
    const sp = pa.specialist && window.SPECIALISTS[pa.specialist];
    let line;
    if (targetActions.length === pa.actions.length && pa.actions.length > 1) {
      line = sp
        ? `All ${pa.actions.length} are with the property team now. I will return when each is confirmed.`
        : `All ${pa.actions.length} are with the property team now.`;
    } else if (targetActions.length === 1) {
      const a = targetActions[0];
      const handler = (a.handler || 'the property team').replace(/^The\s+/, 'the ');
      line = sp
        ? `With ${handler}. I will return when it is confirmed.`
        : `With ${handler}.`;
    } else {
      line = `${targetActions.length} are with the property team now.`;
    }
    log('approval:ack', { line, voice: pa.specialist || 'atelier' });

    // Only acknowledge when the originating thread is still front and center.
    // A disembodied voice from a closed/peripheral thought is confusing — the
    // periphery row's hasUnreadUpdate flag is enough of a signal on its own.
    if (state.activeSpecialist && state.activeSpecialist === pa.specialist) {
      const body = appendSpecialistTurn(pa.specialist);
      await streamInto(body, line);
      speakText(line, pa.specialist || 'atelier').catch(() => {});
    }

    // Keep the pending window open — staff still needs to confirm. But if every
    // action has been approved, shorten the expiry so we don't keep intercepting.
    if (pa.approvedIds.size >= pa.actions.length) {
      pa.expiresAt = Math.min(pa.expiresAt, Date.now() + 5000);
      log('pending-approval:all-approved', { actionCount: pa.actions.length });
    }
  }

  // Cross-thread interrupt — the Atelier host offers to switch the guest to a
  // thread that has news (e.g. a staff acknowledgment in a different thread).
  function offerSwitchToThread(specialistKey, snippet) {
    if (!state.micOn) return;
    pendingOffer = {
      specialistKey,
      threadTitle: 'Update from ' + (window.SPECIALISTS[specialistKey] || {}).name,
      expiresAt: Date.now() + 12000,
    };
    const name = (window.SPECIALISTS[specialistKey] || {}).name || 'a specialist';
    const line = snippet
      ? `${name} has word: ${snippet}  Shall I bring you over?`
      : `${name} has something for you. Shall I bring you over?`;
    speakText(line, 'atelier').catch(() => {});
    setTimeout(() => { if (pendingOffer && Date.now() > pendingOffer.expiresAt) pendingOffer = null; }, 12500);
  }

  // Explicit specialist mention. If the guest names a specialist directly,
  // route to them without making the host clarify. Scoped to the 12 active
  // specialists across the three demo properties. Common Web Speech mishearings
  // included.
  const SPECIALIST_NAME_PATTERNS = {
    // Sand Hill — performance studio
    strategist: /\b(strategist|strategies(?!s)|strategist'?s|strategising|strategizing)\b/i,
    convener:   /\b(convener|convenor|convenors?|convene)\b/i,
    physician:  /\b(physician|the physician|physitian|caretaker|care taker)\b/i,
    steward:    /\b(steward(?:'?s)?)\b/i,
    // Crillon — palace studio
    aesthete:   /\b(aesthete|esthete|the athlete\b|aesthetic\b)/i,
    curator:    /\b(curator|curate(?:s|d)?)\b/i,
    celebrant:  /\b(celebrant|celebrant'?s)\b/i,
    // Kona Village — ocean studio
    mariner:    /\b(mariner|the mariner)/i,
    naturalist: /\b(naturalist|the naturalist)/i,
    // Universal across all three
    concierge:  /\b(concierge|con\s?cer?ge?|conserge)\b/i,
    sommelier:  /\b(sommelier|sommeliers|some?\s?leer)\b/i,
    historian:  /\b(historian|the historian)/i,
  };

  function detectExplicitSpecialist(text) {
    // Order more-distinctive names first, so a partial mention picks the right one.
    const order = ['strategist','convener','sommelier','physician','aesthete','celebrant',
                   'curator','steward','concierge','mariner','naturalist','historian'];
    for (const key of order) {
      const re = SPECIALIST_NAME_PATTERNS[key];
      if (re && re.test(text)) return key;
    }
    return null;
  }

  // Generic / social / vague utterances that should be held by The Atelier
  // (the host) so it can clarify before dispatching a specialist.
  function isSocialOrVague(t) {
    if (!t) return true;
    // Very short utterances tend to be social filler
    if (t.split(/\s+/).filter(Boolean).length < 4) return true;
    // Greetings / questions about the host itself
    if (/^(hi|hey|hello|good (morning|evening|afternoon|night)|sup|yo)\b/.test(t)) return true;
    if (/\b(how (are|r) (you|u)|how('s| is) it|how (have|'ve) (you|u))\b/.test(t)) return true;
    if (/\b(who are you|what are you|what can you do|what do you do|tell me about yourself|help me|i.?m not sure|i don'?t know|what should i ask)\b/.test(t)) return true;
    if (/^(thanks|thank you|cool|ok|okay|alright|nice|great)\b/.test(t)) return true;
    return false;
  }

  function routeContent(text) {
    const t = text.toLowerCase().trim();
    let pick = state.activeSpecialist;
    log('route:enter', {
      text,
      activeSpecialist: state.activeSpecialist,
      activeThreadId: state.activeThreadId,
      hasPendingApproval: !!state.pendingApproval,
    });

    if (!state.activeSpecialist) {
      // First: if the guest explicitly names a specialist, route to them.
      // The host should not stand in the way of a clear request.
      const explicit = detectExplicitSpecialist(t);
      if (explicit) {
        pick = explicit;
        log('route:explicit-specialist', { specialist: explicit });
      }
      // Otherwise: if the utterance is social/vague, the Atelier holds the
      // conversation and asks one short clarifying question.
      else if (isSocialOrVague(t)) {
        pick = 'atelier';
      } else if (/series b|term sheet|deal|valuation|cap table|m&a|fundrais|negotiat/.test(t)) pick = 'strategist';
      else if (/dinner|host|seating|board|partner|gathering|offsite/.test(t)) pick = 'convener';
      else if (/sleep|hrv|recovery|jet ?lag|tired|breath|asaya|train|nutrition/.test(t)) pick = 'physician';
      else if (/wedding|propos|anniversary|vow|ceremony/.test(t)) pick = 'celebrant';
      else if (/drink|pairing|cocktail|sommelier|tea|coffee|zero.?proof/.test(t)) pick = 'sommelier';
      else if (/(private|confidence|between us|heavy|divorce|grave)\b/.test(t)) pick = 'steward';
      else if (/history|land|people|first nations|ohlone|tanka|treaty|kapu|hawaiian/.test(t)) pick = 'historian';
      else if (/(restaurant|dinner.*tonight|where (should|to) (eat|go|dine)|evening to plan)/.test(t)) pick = 'curator';
      else if (/(car|reservation|book|schedule|deliver)/.test(t)) pick = 'concierge';
      else if (/(art|gallery|museum|auction|sotheby|m\+)/.test(t)) pick = 'aesthete';
      else if (/(ocean|water|surf|paddle|dive|snorkel|sail|boat)/.test(t)) pick = 'mariner';
      else if (/(reef|trail|land|creature|bird|honu|turtle|manzanita|forest|wild)/.test(t)) pick = 'naturalist';
      else {
        // No clear domain \u2014 defer to the Atelier to read the room and clarify
        pick = 'atelier';
      }
    }
    log('route', { pick, text });

    if (!state.activeSpecialist) {
      if (pick === 'atelier') {
        // Host reply \u2014 stay on the at-rest canvas, render an inline whisper.
        // Do NOT open a dialogue thread (the host clarifies, it does not hold the work).
        whisperFromAtelier(text);
      } else {
        const title = text.slice(0, 48) + (text.length > 48 ? '\u2026' : '');
        openThread(pick, title, text);
      }
    } else {
      appendUserTurn(text);
      respondAs(pick, text);
    }
  }

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ATELIER WHISPER (host reply, in-place) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // The Atelier (host) does not hold work. When the guest says something
  // social, vague, or half-formed, the host replies briefly on the at-rest
  // canvas and waits for a more specific direction. No thread takes over.
  let whisperFadeTimer = null;
  async function whisperFromAtelier(userText) {
    log('whisper:start', { userText });
    const w = document.getElementById('atelier-whisper');
    const body = document.getElementById('atelier-whisper-body');
    if (!w || !body) return;
    w.hidden = false;
    body.innerHTML = '<span class="cursor">|</span>';
    if (whisperFadeTimer) { clearTimeout(whisperFadeTimer); whisperFadeTimer = null; }

    // Drive the orb to "speaking" state while the host reply is composed/spoken
    const orb = document.getElementById('orb');
    if (orb && orb.setState) orb.setState('speaking');

    // Build the host reply: real Claude if key present, otherwise canned fallback
    let text;
    try {
      if (anthropicKey() && !state.presenterSafe) {
        text = await callClaudeFor('atelier', userText);
      } else {
        text = defaultReply('atelier', userText);
      }
    } catch (e) {
      log('whisper:claude-error', { err: String(e && e.message || e) });
      text = defaultReply('atelier', userText);
    }
    log('whisper:reply', { text });

    await streamInto(body, text);
    speakText(text, 'atelier').catch(() => {});

    if (orb && orb.setState) orb.setState('rest');

    // The whisper persists until the user speaks/types again. We do NOT auto-fade
    // because the user may be reading the host's options. They can dismiss it
    // via the \u00d7 button, by speaking a more specific request, or by typing.
  }

  function dismissWhisper() {
    const w = document.getElementById('atelier-whisper');
    if (!w) return;
    w.hidden = true;
    const body = document.getElementById('atelier-whisper-body');
    if (body) body.innerHTML = '';
    log('whisper:dismissed');
  }

  // ═════════════ ElevenLabs TTS ═════════════
  // The actual voice ids would come from the user's account; in this prototype
  // we fall back gracefully to the browser's speechSynthesis with a tuned voice.
  let audio = null;
  async function speakText(text, specialistKey) {
    if (!state.micOn) return;
    // A specialist's voice only belongs to the thought that's front and center.
    // If the thread is closed or sitting in the periphery, a disembodied voice
    // is confusing — the periphery row's unread flag is the right offstage signal.
    // Host ('atelier') and ambient calls without a specialist are unaffected.
    if (specialistKey && specialistKey !== 'atelier'
        && window.SPECIALISTS && window.SPECIALISTS[specialistKey]
        && state.activeSpecialist !== specialistKey) return;
    // Defensive: strip any directive markup so TTS never reads it aloud
    text = (text || '')
      .replace(/\[\[PLAN:[\s\S]*?\]\](?:\])?/g, '')
      .replace(/\[\[FORK:[\s\S]*?\]\]/g, '')
      .replace(/\[\[BUTLER:[\s\S]*?\]\]/g, '')
      .trim();
    if (!text) return;
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }

    const orb = $('#orb');
    const headOrb = $('#dialogue .head-orb atelier-orb');
    const setSpeak = (s) => { [orb, headOrb].forEach(o => o && o.setState && o.setState(s ? 'speaking' : 'rest')); };

    // ElevenLabs toggle — off by default to preserve credits during dev.
    // Re-enable from the console: `Atelier.state.useElevenLabs = true`
    // or set localStorage flag: localStorage.setItem('atelier_use_eleven', '1')
    const elEnabled = state.useElevenLabs === true
      || (typeof localStorage !== 'undefined' && localStorage.getItem('atelier_use_eleven') === '1');
    const elKey = elEnabled ? ((window.__local_keys && window.__local_keys.elevenLabs) || null) : null;
    const voiceMap = { host: 'pNInz6obpgDQGcFmaJgB', considered: 'TX3LPaxmHKxFdv7VOQHJ', warmF: 'EXAVITQu4pFSA4mYxKv2', crisp: 'onwK4e9ZLuTAKqWW03F9', contemplative: 'XB0fDUnXU5powFXDhCwa', gravelly: 'GBv7mTt0atIp3Br8iCZE' };
    const reg = (window.SPECIALISTS[specialistKey] && window.SPECIALISTS[specialistKey].voice) || 'host';
    const vid = voiceMap[reg];

    // Pause the mic so the specialist isn't picked up by the recognizer
    isTTSPlaying = true;
    if (ambientRecognition) { try { ambientRecognition.stop(); } catch (e) {} }
    if (activeRecognition) { try { activeRecognition.stop(); } catch (e) {} }
    updateMicVisual();

    const onPlaybackDone = () => {
      setSpeak(false);
      isTTSPlaying = false;
      updateMicVisual();
      // Resume the right kind of listening:
      //   - in a thread → arm follow-up (continue without re-saying "atelier")
      //   - at rest → restart ambient (wait for the next "atelier")
      if (!state.micOn) return;
      if (state.activeSpecialist) {
        try { armFollowUp(); } catch (e) {}
      } else if (!isActive && !isAmbient) {
        setTimeout(() => { try { startAmbient(); } catch (e) {} }, 250);
      }
    };

    if (elKey && vid) {
      try {
        const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream?optimize_streaming_latency=2`, {
          method: 'POST',
          headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true } }),
        });
        if (!resp.ok) throw new Error('elev');
        const buf = await resp.arrayBuffer();
        const blob = new Blob([buf], { type: 'audio/mpeg' });
        audio = new Audio(URL.createObjectURL(blob));
        setSpeak(true);
        audio.onended = onPlaybackDone;
        audio.onerror = onPlaybackDone;
        audio.play().catch(onPlaybackDone);
        return;
      } catch (e) {
        // fall through to web speech
      }
    }

    // fallback: browser TTS, kept very quiet
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.96; u.pitch = 0.98; u.volume = 0.85;
      setSpeak(true);
      u.onend = onPlaybackDone;
      u.onerror = onPlaybackDone;
      try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { onPlaybackDone(); }
    } else {
      onPlaybackDone();
    }
  }

  // ═════════════ DASHBOARD ═════════════
  function renderDashboard() {
    const g = window.ACTIVE_GUEST;
    const grid = $('#dash-grid');
    grid.innerHTML = '';
    const cells = [
      { eb: 'HRV last 24 hours', val: g.signals.hrv, sm: 'ms', read: 'Below baseline. The trip is in your body. Tonight\u2019s recovery work matters.', toggle: 'Shared with the studio' },
      { eb: 'Sleep last night', val: g.signals.sleepHours, sm: 'h \u00b7 fragmented', read: 'A short, fragmented night. Light at 6:30 am will lift readiness more than coffee.', toggle: 'Shared with the studio' },
      { eb: 'Readiness', val: g.signals.readiness, sm: '/ 100', read: 'Modest. The Physician has reflected on this in your dashboard already.', toggle: 'Shared with the studio' },
      { eb: 'What the studio sees on your calendar', val: 'Friday 10:00 am', sm: 'Series B closing call', read: 'The dinner you are hosting Thursday is set so the morning Friday is yours.', toggle: 'Calendar shared' },
    ];
    for (const c of cells) {
      const cell = el('div', { class: 'dash-cell' });
      cell.appendChild(el('h3', {}, c.eb));
      const v = el('div', { class: 'val' });
      v.appendChild(document.createTextNode(c.val + ' '));
      v.appendChild(el('span', { class: 'sm' }, c.sm));
      cell.appendChild(v);
      cell.appendChild(el('div', { class: 'read' }, c.read));
      cell.appendChild(el('div', { class: 'toggle' }, '\u2022 ' + c.toggle));
      grid.appendChild(cell);
    }

    const motion = $('#dash-motion-list');
    motion.innerHTML = '';
    const items = [
      { when: 'Now', what: 'Series B \u2014 the term sheet review', where: 'with The Strategist' },
      { when: 'Thursday 7:00 pm', what: 'Lead partner dinner', where: 'Madera private room' },
      { when: 'Tomorrow 7:00 am', what: 'Asaya breathwork \u2014 first light', where: 'before the call' },
      { when: 'Friday 10:00 am', what: 'Series B closing call', where: 'in residence' },
    ];
    for (const it of items) {
      const r = el('div', { class: 'item' });
      r.appendChild(el('div', { class: 'when' }, it.when));
      r.appendChild(el('div', { class: 'what' }, it.what));
      r.appendChild(el('div', { class: 'where' }, it.where));
      motion.appendChild(r);
    }
  }

  // ═════════════ CONSTELLATION ═════════════
  // The studio's working map under a warm night sky. SVG, dark backdrop in
  // CSS, central Atelier orb, curved connecting paths to thread satellites.
  // Prezi-style camera: a click on a satellite tweens the world group's
  // transform so the camera glides onto that node and a detail card unfolds.
  const constCam = { raf: 0, current: { tx: 0, ty: 0, s: 1 }, focusId: null };

  function setConstWorldTransform(g, tx, ty, s) {
    g.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
  }

  function tweenConstCamera(from, to, duration, onDone) {
    if (constCam.raf) cancelAnimationFrame(constCam.raf);
    const stage = $('#const-stage');
    const world = stage && stage.querySelector('.const-world');
    if (!world) return;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      const tx = from.tx + (to.tx - from.tx) * e;
      const ty = from.ty + (to.ty - from.ty) * e;
      const s  = from.s  + (to.s  - from.s)  * e;
      setConstWorldTransform(world, tx, ty, s);
      constCam.current = { tx, ty, s };
      if (t < 1) constCam.raf = requestAnimationFrame(frame);
      else { constCam.raf = 0; if (onDone) onDone(); }
    }
    constCam.raf = requestAnimationFrame(frame);
  }

  function constThreadSummary(thread) {
    if (!thread || !thread.streamHtml) return [];
    const tmp = document.createElement('div');
    tmp.innerHTML = thread.streamHtml;
    const turns = Array.from(tmp.querySelectorAll('.turn'));
    const lines = [];
    for (let i = turns.length - 1; i >= 0 && lines.length < 2; i--) {
      const node = turns[i];
      // Prefer the turn's body so we don't pull in the "You" / role chrome.
      const body = node.querySelector('.turn-body') || node;
      const text = (body.textContent || '').trim().replace(/\s+/g, ' ').replace(/\|$/, '').trim();
      if (!text) continue;
      const who = node.classList.contains('user') ? 'user' : 'specialist';
      lines.unshift({ who, text: text.length > 180 ? text.slice(0, 177) + '…' : text });
    }
    return lines;
  }

  function renderConstDetail(item, thread) {
    const sp = window.SPECIALISTS[item.specialist] || { name: 'A specialist', role: '' };
    const palette = {
      motion:  { label: 'In motion',          dotCls: 'motion' },
      awaits:  { label: 'Awaits you',         dotCls: 'awaits' },
      settled: { label: 'Settled',            dotCls: 'settled' },
      private: { label: 'Held in confidence', dotCls: 'private' },
    };
    const c = palette[item.state] || palette.motion;
    const xml = (s) => (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const summary = item.private ? [] : constThreadSummary(thread);
    const summaryHtml = summary.length
      ? summary.map(l => `<div class="cd-line ${l.who === 'user' ? 'is-user' : ''}">${xml(l.text)}</div>`).join('')
      : (item.private
          ? `<div class="cd-empty">&mdash; this thread is held in confidence; only its presence is shown.</div>`
          : `<div class="cd-empty">&mdash; just opened. Nothing yet to recall.</div>`);

    const relatedPlans = (state.plans || []).filter(p => p.specialist === item.specialist);
    const plansHtml = relatedPlans.length
      ? `<div class="cd-plans"><h4>In motion for you</h4>${
          relatedPlans.map(p => {
            const total = (p.actions || []).length;
            const handled = (p.handledIds && p.handledIds.size) || 0;
            const counter = total ? `${handled}/${total} handled` : (p.state || 'in motion');
            return `<div class="cd-plan"><span class="pt">&#10038;</span><span>${xml(p.title)}</span><span class="cnt">${xml(counter)}</span></div>`;
          }).join('')
        }</div>`
      : '';

    return `
      <div class="cd-eb"><span class="dot ${c.dotCls}"></span>${xml(c.label.toUpperCase())}</div>
      <h3>${xml(sp.name)} &middot; <em>${xml(item.private ? 'held in confidence' : item.title)}</em></h3>
      <div class="cd-role">${xml(sp.role || '')}</div>
      ${summaryHtml}
      ${plansHtml}
      <div class="cd-actions">
        <button type="button" class="cd-btn is-ghost" data-cd="back">Back to the sky</button>
        <button type="button" class="cd-btn" data-cd="open">Open the thread</button>
      </div>
    `;
  }

  function zoomConstInto(item, point) {
    const stage = $('#const-stage');
    if (!stage) return;
    const W = 1000, H = 600, cx = W / 2, cy = H / 2;
    const S = 2.4;
    const target = { tx: cx - S * point.x, ty: cy - S * point.y, s: S };
    document.body.classList.add('const-zoomed');
    constCam.focusId = item.id;
    stage.querySelectorAll('.const-node[data-thread-id]').forEach(n => {
      const isFocus = n.getAttribute('data-thread-id') === item.id;
      n.classList.toggle('is-focus', isFocus);
      n.classList.toggle('is-dim', !isFocus);
    });
    stage.querySelectorAll('.const-node[data-action="center"]').forEach(n => n.classList.add('is-dim'));
    const detail = stage.querySelector('.const-detail');
    if (detail) {
      const thread = (state.threads || []).find(t => t.id === item.id);
      detail.innerHTML = renderConstDetail(item, thread);
      detail.querySelector('[data-cd="back"]').addEventListener('click', (e) => { e.stopPropagation(); zoomConstOut(); });
      detail.querySelector('[data-cd="open"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const t = (state.threads || []).find(x => x.id === item.id);
        if (t) openThread(t.specialist, t.title, null, t);
        zoomConstOut();
        setView('studio');
      });
    }
    tweenConstCamera(constCam.current, target, 720, () => {
      if (detail) detail.classList.add('is-shown');
    });
  }

  function zoomConstOut() {
    const stage = $('#const-stage');
    if (!stage) return;
    document.body.classList.remove('const-zoomed');
    constCam.focusId = null;
    const detail = stage.querySelector('.const-detail');
    if (detail) detail.classList.remove('is-shown');
    stage.querySelectorAll('.const-node').forEach(n => n.classList.remove('is-focus', 'is-dim'));
    tweenConstCamera(constCam.current, { tx: 0, ty: 0, s: 1 }, 640);
  }

  function renderConstellation() {
    const stage = $('#const-stage');
    if (!stage) return;

    // Fresh render → reset camera to the wide shot.
    document.body.classList.remove('const-zoomed');
    constCam.current = { tx: 0, ty: 0, s: 1 };
    constCam.focusId = null;

    const W = 1000, H = 600;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * 0.34;

    const xmlEscape = (s) => (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    // Items in the constellation: every thread is a satellite.
    // (We could also surface plans, but threads are what the guest navigates.)
    const items = (state.threads || []).map(t => ({
      id: t.id,
      specialist: t.specialist,
      title: t.title,
      private: !!t.private,
      state: t.private ? 'private' : (t.state || 'motion'),
    }));

    // Empty state — a small still orb + calm copy
    if (items.length === 0) {
      stage.innerHTML = `
        <div class="const-empty">
          <atelier-orb size="72" state="rest"></atelier-orb>
          <div class="const-empty-title">The Atelier, alone</div>
          <div class="const-empty-body">When you begin thoughts and the studio comes to life, you'll see the work mapped here — <em>each thought a satellite, the Atelier at the center.</em></div>
        </div>
      `;
      return;
    }

    // Position items around the center
    const positions = constPositions(items.length, cx, cy, radius);

    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;

    // Gradients tuned for the night sky
    svg += `
      <defs>
        <radialGradient id="cn-orb" cx="35%" cy="28%" r="70%">
          <stop offset="0%"  stop-color="#fff6d5"/>
          <stop offset="35%" stop-color="#f0d289"/>
          <stop offset="70%" stop-color="#b8884a"/>
          <stop offset="100%" stop-color="#4a2e10"/>
        </radialGradient>
        <radialGradient id="cn-halo-gold" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#a08654" stop-opacity="0.22"/>
          <stop offset="60%" stop-color="#a08654" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#a08654" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cn-halo-attention" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#b87a4a" stop-opacity="0.32"/>
          <stop offset="60%" stop-color="#b87a4a" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#b87a4a" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cn-halo-settled" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#6b8a5e" stop-opacity="0.22"/>
          <stop offset="60%" stop-color="#6b8a5e" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#6b8a5e" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cn-halo-private" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#e8e2d4" stop-opacity="0.18"/>
          <stop offset="60%" stop-color="#e8e2d4" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="#e8e2d4" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cn-center-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#e8c789" stop-opacity="0.35"/>
          <stop offset="60%" stop-color="#a08654" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#a08654" stop-opacity="0"/>
        </radialGradient>
      </defs>
    `;

    // Everything inside .const-world is what the Prezi-style camera flies over.
    svg += `<g class="const-world" transform="translate(0 0) scale(1)">`;

    // Curved connecting lines (under the nodes)
    items.forEach((it, i) => {
      const p = positions[i];
      const dx = p.x - cx, dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const offX = -dy / len * 20;
      const offY =  dx / len * 20;
      const ctrlX = (cx + p.x) / 2 + offX;
      const ctrlY = (cy + p.y) / 2 + offY;
      const palette = {
        motion:  { color: '#e8c789', opacity: 0.65, w: 1.3, anim: '0.5;0.9;0.5', dur: '3s' },
        awaits:  { color: '#ffae73', opacity: 0.85, w: 1.5, anim: '0.6;1.0;0.6', dur: '2.5s' },
        settled: { color: '#a0c094', opacity: 0.5,  w: 1.0, anim: null,            dur: null },
        private: { color: '#e8e2d4', opacity: 0.35, w: 0.9, anim: null,            dur: null },
      };
      const c = palette[it.state] || palette.motion;
      svg += `<path d="M ${cx} ${cy} Q ${ctrlX} ${ctrlY} ${p.x} ${p.y}" stroke="${c.color}" stroke-opacity="${c.opacity}" stroke-width="${c.w}" fill="none" stroke-linecap="round"${it.state === 'private' ? ' stroke-dasharray="3 5"' : ''}>`;
      if (c.anim) svg += `<animate attributeName="stroke-opacity" values="${c.anim}" dur="${c.dur}" repeatCount="indefinite"/>`;
      svg += `</path>`;
    });

    // Center — The Atelier
    svg += `<g transform="translate(${cx} ${cy})" class="const-node" data-action="center">`;
    svg += `<circle r="92" fill="url(#cn-center-halo)">`;
    svg += `<animate attributeName="r" values="86;96;86" dur="4.5s" repeatCount="indefinite"/>`;
    svg += `<animate attributeName="opacity" values="0.7;1;0.7" dur="4.5s" repeatCount="indefinite"/>`;
    svg += `</circle>`;
    svg += `<circle r="42" fill="url(#cn-orb)"/>`;
    svg += `<ellipse cx="-12" cy="-15" rx="14" ry="9" fill="#ffffff" fill-opacity="0.32"/>`;
    svg += `<circle cx="-15" cy="-18" r="3" fill="#ffffff" fill-opacity="0.9"/>`;
    svg += `<text y="80" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="20" fill="#f5e9cd" style="text-shadow: 0 0 12px rgba(232,199,137,0.4);">The Atelier</text>`;
    svg += `<text y="100" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" letter-spacing="3" fill="#c9a572">YOUR HOST · CLICK TO RETURN</text>`;
    svg += `</g>`;

    // Each thread = a satellite
    items.forEach((it, i) => {
      const p = positions[i];
      const sp = window.SPECIALISTS[it.specialist] || { name: 'A specialist' };
      const palette = {
        motion:  { nameC: '#f0e6cf', stateC: '#e8c789', halo: 'cn-halo-gold',      ring: '#c9a572', label: 'In motion' },
        awaits:  { nameC: '#ffc599', stateC: '#ffae73', halo: 'cn-halo-attention', ring: '#d49065', label: 'Awaits you' },
        settled: { nameC: '#c9d8bc', stateC: '#a0c094', halo: 'cn-halo-settled',   ring: '#8aa57a', label: 'Settled' },
        private: { nameC: '#e8e2d4', stateC: '#e8e2d4', halo: 'cn-halo-private',   ring: '#e8e2d4', label: 'In confidence' },
      };
      const c = palette[it.state] || palette.motion;
      const isUpper = p.y < cy;
      const labelOffsetY = isUpper ? -52 : 58;
      const titleOffsetY = isUpper ? -32 : 78;
      const stateOffsetY = isUpper ? -70 : 98;

      svg += `<g transform="translate(${p.x} ${p.y})" class="const-node" data-thread-id="${xmlEscape(it.id)}">`;
      // Halo with state animation
      if (it.state === 'motion') {
        svg += `<circle r="50" fill="url(#${c.halo})">`;
        svg += `<animate attributeName="r" values="46;58;46" dur="3s" repeatCount="indefinite"/>`;
        svg += `<animate attributeName="opacity" values="0.65;0.35;0.65" dur="3s" repeatCount="indefinite"/>`;
        svg += `</circle>`;
      } else if (it.state === 'awaits') {
        svg += `<circle r="54" fill="url(#${c.halo})">`;
        svg += `<animate attributeName="r" values="50;60;50" dur="2.5s" repeatCount="indefinite"/>`;
        svg += `<animate attributeName="opacity" values="0.9;0.5;0.9" dur="2.5s" repeatCount="indefinite"/>`;
        svg += `</circle>`;
      } else {
        svg += `<circle r="48" fill="url(#${c.halo})" opacity="${it.state === 'settled' ? 0.7 : 0.5}"/>`;
      }
      // Orb body (smaller than center)
      const orbR = 20;
      if (it.state === 'private') {
        svg += `<circle r="${orbR}" fill="none" stroke="${c.ring}" stroke-width="1.5" stroke-dasharray="3 3" stroke-opacity="0.9"/>`;
        svg += `<circle r="${orbR - 8}" fill="#14100c" stroke="${c.ring}" stroke-width="0.8" stroke-opacity="0.6"/>`;
      } else {
        svg += `<circle r="${orbR}" fill="url(#cn-orb)"/>`;
        svg += `<ellipse cx="-6" cy="-7" rx="7" ry="5" fill="#ffffff" fill-opacity="0.32"/>`;
        svg += `<circle cx="-8" cy="-9" r="1.6" fill="#ffffff" fill-opacity="0.85"/>`;
        if (it.state === 'awaits') {
          svg += `<circle r="${orbR + 3}" fill="none" stroke="${c.ring}" stroke-width="2" stroke-opacity="0.9"/>`;
        } else if (it.state === 'settled') {
          svg += `<circle r="${orbR + 3}" fill="none" stroke="${c.ring}" stroke-width="1.4" stroke-opacity="0.7"/>`;
        }
      }
      // Labels
      svg += `<text y="${stateOffsetY}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" font-weight="${it.state === 'awaits' ? '500' : '400'}" letter-spacing="2.8" fill="${c.stateC}" style="text-transform: uppercase;">${xmlEscape(c.label.toUpperCase())}</text>`;
      svg += `<text y="${labelOffsetY}" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="17" fill="${c.nameC}">${xmlEscape(sp.name)}</text>`;
      svg += `<text y="${titleOffsetY}" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-size="14" fill="rgba(232,220,200,0.72)">${xmlEscape(it.private ? 'held in confidence' : it.title)}</text>`;
      svg += `</g>`;
    });

    svg += `</g>`;
    svg += `</svg>`;
    // Detail card lives outside the svg so the camera transform doesn't move it.
    stage.innerHTML = svg + `<div class="const-detail" id="const-detail"></div>`;

    // Lookup table: thread-id → position, so the camera knows where to fly.
    const posById = {};
    items.forEach((it, i) => { posById[it.id] = positions[i]; });

    // Satellite click → if not focused, fly the camera there; if already
    // focused, open the thread in the studio.
    stage.querySelectorAll('.const-node[data-thread-id]').forEach(node => {
      node.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = node.getAttribute('data-thread-id');
        const item = items.find(x => x.id === id);
        const point = posById[id];
        if (!item || !point) return;
        if (constCam.focusId === id) {
          const t = state.threads.find(x => x.id === id);
          if (t) openThread(t.specialist, t.title, null, t);
          zoomConstOut();
          setView('studio');
          return;
        }
        zoomConstInto(item, point);
      });
    });
    // Center click → if zoomed, pull back; otherwise return to the studio.
    stage.querySelectorAll('.const-node[data-action="center"]').forEach(node => {
      node.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (constCam.focusId) zoomConstOut();
        else setView('studio');
      });
    });
    // Click on empty sky → pull back if zoomed.
    stage.addEventListener('click', (ev) => {
      if (ev.target.closest('.const-node') || ev.target.closest('.const-detail')) return;
      if (constCam.focusId) zoomConstOut();
    });
  }

  function constPositions(total, cx, cy, radius) {
    const arrangements = {
      1: [-Math.PI / 2],
      2: [-Math.PI * 3 / 4, -Math.PI / 4],
      3: [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6],
      4: [-Math.PI * 3 / 4, -Math.PI / 4, Math.PI / 4, Math.PI * 3 / 4],
    };
    let angles = arrangements[total];
    if (!angles) {
      angles = [];
      const start = -Math.PI / 2;
      for (let i = 0; i < total; i++) angles.push(start + (i / total) * 2 * Math.PI);
    }
    return angles.map(a => ({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius }));
  }

  // ═════════════ VIEW SWITCH ═════════════
  function setView(v) {
    state.view = v;
    $$('.bar-view').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
    $('#dashboard').classList.toggle('is-shown', v === 'dashboard');
    $('#constellation').classList.toggle('is-shown', v === 'constellation');
    document.body.classList.toggle('view-dashboard', v === 'dashboard');
    document.body.classList.toggle('view-constellation', v === 'constellation');
    if (v === 'dashboard') renderDashboard();
    if (v === 'constellation') renderConstellation();
  }

  // ═════════════ STAFF LOOP (BroadcastChannel) ═════════════
  if (bc) {
    bc.onmessage = (ev) => {
      const m = ev.data;
      log('broadcast:in', { type: m && m.type, payload: m });
      if (m.type === 'staff_handled' && m.actionId) {
        const ackText = (window.CANNED && window.CANNED.ack && window.CANNED.ack[m.actionId]) || 'The property team has handled it.';
        const plan = state.plans.find(p => (p.actions || []).find(a => a.id === m.actionId));
        let originatingSpecialist = state.activeSpecialist;
        if (plan) {
          const a = plan.actions.find(x => x.id === m.actionId);
          if (a) a.done = true;
          plan.handledIds = plan.handledIds || new Set();
          plan.handledIds.add(m.actionId);
          // If every action has been handled, settle the plan so the progress bar reaches Ready.
          if (plan.handledIds.size >= (plan.actions || []).length) plan.state = 'settled';
          markActionDone(m.actionId);
          renderPeriphery();
          // The Convener owns the seam plan
          originatingSpecialist = plan.specialist || (plan.title && /dinner/i.test(plan.title) ? 'convener' : originatingSpecialist);
        }
        log('staff_handled:received', {
          actionId: m.actionId,
          originatingSpecialist,
          activeSpecialist: state.activeSpecialist,
          willAck: state.activeSpecialist && state.activeSpecialist === originatingSpecialist,
        });
        // If we're inside the originating thread, the specialist acknowledges directly
        if (state.activeSpecialist && state.activeSpecialist === originatingSpecialist) {
          setTimeout(async () => {
            const body = appendSpecialistTurn(state.activeSpecialist);
            await streamInto(body, ackText);
            speakText(ackText, state.activeSpecialist).catch(() => {});
            armFollowUp();
          }, 600);
        }
        // Cross-thread interrupt offers are cut from the demo to reduce complexity.
        // If a staff action is handled while the guest is elsewhere, the
        // thread's hasUnreadUpdate flag (set by the existing render) is enough.
      }
    };
  }

  function markActionDone(id) {
    const node = document.querySelector(`[data-action-id="${id}"]`);
    if (!node) {
      log('mark-done:no-node', { actionId: id });
      return;
    }
    node.classList.remove('is-approved');
    node.classList.add('is-done');
    const btn = node.querySelector('.pa-action');
    if (btn) { btn.textContent = 'Handled'; btn.disabled = true; }
    if (state.pendingApproval && state.pendingApproval.handledIds) {
      state.pendingApproval.handledIds.add(id);
      // Once every action has been handled by staff, the approval window is done
      // and we can release the soft context so future utterances route normally.
      if (state.pendingApproval.handledIds.size >= state.pendingApproval.actionIds.length) {
        log('pending-approval:cleared:all-handled', { planTitle: state.pendingApproval.planTitle });
        state.pendingApproval = null;
      }
    }
  }

  // ═════════════ THE SEAM MOMENT ═════════════
  async function runSeam() {
    if (state.propertyId !== 'sandhill') switchProperty('sandhill');
    if (!document.body.classList.contains('studio-active')) enterStudio();
    // begin strategist thread
    openThread('strategist', 'Series B in motion', null);
    await wait(500);
    appendUserTurn(window.CANNED.daniel_kickoff);
    await wait(600);
    const body1 = appendSpecialistTurn('strategist');
    await streamInto(body1, window.CANNED.strategist_reply);
    speakText(window.CANNED.strategist_reply, 'strategist').catch(() => {});
    await wait(1500);
    // fork to convener — same dialogue thread, new specialist (the FORK is implicit visually)
    // For demo cleanliness, switch the thread head to The Convener
    // Snapshot the strategist's history before the fork so it survives later thread switches.
    captureActiveStream();
    state.activeSpecialist = 'convener';
    state.activeThreadTitle = 'Thursday dinner \u2014 the room';
    const sp = window.SPECIALISTS.convener;
    $('#dialogue-who').textContent = sp.name.toUpperCase() + ' \u00b7 ' + sp.role;
    $('#dialogue-thread').textContent = state.activeThreadTitle;
    const convenerId = 't_' + Date.now();
    state.activeThreadId = convenerId;
    state.threads.unshift({ id: convenerId, specialist: 'convener', title: state.activeThreadTitle, state: 'awaits', private: false });
    renderPeriphery();
    publish({ type: 'thread_opened', specialist: 'convener', title: state.activeThreadTitle, private: false, guestId: (window.ACTIVE_GUEST && window.ACTIVE_GUEST.id) || 'g_daniel_park' });
    const body2 = appendSpecialistTurn('convener');
    await streamInto(body2, window.CANNED.convener_reply);
    speakText(window.CANNED.convener_reply, 'convener').catch(() => {});
    // render the plan card
    await wait(400);
    appendPlanCard(window.CANNED.convener_plan);
  }

  function appendPlanCard(plan) {
    log('plan:create', { kind: plan.kind, title: plan.title, when: plan.when, where: plan.where, actions: (plan.actions || []).length });
    const inner = $('#stream-inner');
    const card = el('div', { class: 'plan-card' });
    const eb = el('div', { class: 'plan-eyebrow' });
    eb.innerHTML = plan.kind.toUpperCase() + '<span class="sep">&middot;</span>IN MOTION';
    card.appendChild(eb);
    card.appendChild(el('div', { class: 'plan-title' }, plan.title));
    card.appendChild(el('div', { class: 'plan-rule' }));
    const dl = el('dl', { class: 'plan-rows' });
    const rows = [['When', plan.when], ['Where', plan.where], ['Who', plan.who], ['Detail', plan.detail]];
    for (const [k, v] of rows) {
      dl.appendChild(el('dt', {}, k));
      const dd = el('dd', {});
      if (k === 'Detail') dd.innerHTML = '<em>' + v + '</em>'; else dd.textContent = v;
      dl.appendChild(dd);
    }
    card.appendChild(dl);
    card.appendChild(el('div', { class: 'plan-actions-label' }, 'Suggested \u00b7 tap or say \u201cyes\u201d to approve'));
    for (const a of plan.actions) {
      const row = el('div', { class: 'plan-action', data: { actionId: a.id, handler: a.handler || '' } });
      const tx = el('div', {});
      tx.appendChild(el('div', { class: 'pa-text' }, a.title));
      tx.appendChild(el('div', { class: 'pa-handler' }, a.handler + ' \u00b7 ' + a.rationale));
      row.appendChild(tx);
      // Button is an APPROVAL, not a self-volunteer. The guest is approving the
      // property team to handle this on their behalf; the operator side picks it
      // up as a real task and confirms it when done. See onGuestApprove.
      const btn = el('button', { class: 'pa-action', onclick: () => onGuestApprove(a.id, plan) }, 'Approve');
      row.appendChild(btn);
      card.appendChild(row);
    }
    inner.appendChild(card);
    scrollStream();
    // Capture this plan as the soft context for voice follow-ups. Even after the
    // thread auto-closes, a phrase like "approve all three" should land on the
    // most recent plan rather than reopening a confused new conversation.
    const owningSpecialist = state.activeSpecialist || plan.specialist || null;
    state.pendingApproval = {
      planTitle: plan.title,
      planKind: plan.kind,
      specialist: owningSpecialist,
      threadId: state.activeThreadId,
      actionIds: (plan.actions || []).map(a => a.id),
      actions: (plan.actions || []).map(a => ({ id: a.id, title: a.title, handler: a.handler })),
      approvedIds: new Set(),
      handledIds: new Set(),
      capturedAt: Date.now(),
      expiresAt: Date.now() + PENDING_APPROVAL_WINDOW_MS,
      guestId: (window.ACTIVE_GUEST && window.ACTIVE_GUEST.id) || 'g_daniel_park',
    };
    log('pending-approval:armed', {
      planTitle: plan.title,
      specialist: owningSpecialist,
      actionCount: state.pendingApproval.actionIds.length,
      windowMs: PENDING_APPROVAL_WINDOW_MS,
    });
    const planId = 'p_' + Date.now();
    state.plans.unshift({
      id: planId,
      kind: plan.kind,
      title: plan.title,
      when: plan.when,
      whenAt: plan.whenAt || null,
      where: plan.where,
      actions: plan.actions,
      state: 'motion',
      specialist: state.activeSpecialist || plan.specialist || null,
      private: !!state.threadPrivate,
      approvedIds: new Set(),
      handledIds: new Set(),
    });
    if (state.pendingApproval) state.pendingApproval.planId = planId;
    renderPeriphery();
    publish({ type: 'plan_created', plan: {
      title: plan.title,
      when: plan.when,
      where: plan.where,
      actions: plan.actions,
      guestId: (window.ACTIVE_GUEST && window.ACTIVE_GUEST.id) || 'g_daniel_park',
      kind: plan.kind,
      specialist: state.activeSpecialist || plan.specialist || null,
      private: !!state.threadPrivate,
    } });
  }

  // Guest taps "Approve" on an action row. This is NOT the same as staff handling
  // the action — it forwards the action to the operator's queue as a real task.
  // Staff still has to confirm it on their end (which then triggers staff_handled
  // and the specialist's acknowledgment to the guest). We update the button locally
  // to "With the <handler>" so the guest sees that it has left their hands.
  function onGuestApprove(id, plan, opts) {
    opts = opts || {};
    const source = opts.source || 'tap';
    log('guest:approve', { actionId: id, planTitle: plan && plan.title, source });
    // Idempotent: a second tap or a voice "approve all" should not re-publish.
    if (state.pendingApproval && state.pendingApproval.approvedIds && state.pendingApproval.approvedIds.has(id)) {
      log('guest:approve:skip:already-approved', { actionId: id, source });
      return false;
    }
    markActionApproved(id);
    if (state.pendingApproval && state.pendingApproval.approvedIds) {
      state.pendingApproval.approvedIds.add(id);
    }
    // Mirror onto the persisted plan so the periphery progress bar reflects approvals.
    const livePlan = findLivePlan(plan);
    if (livePlan) {
      livePlan.approvedIds = livePlan.approvedIds || new Set();
      livePlan.approvedIds.add(id);
      renderPeriphery();
    }
    publish({
      type: 'guest_approved',
      actionId: id,
      planTitle: plan && plan.title,
      specialist: (state.pendingApproval && state.pendingApproval.specialist) || state.activeSpecialist || null,
      guestId: (window.ACTIVE_GUEST && window.ACTIVE_GUEST.id) || 'g_daniel_park',
      source,
    });
    return true;
  }

  function markActionApproved(id) {
    const node = document.querySelector(`[data-action-id="${id}"]`);
    if (!node) {
      log('mark-approved:no-node', { actionId: id });
      return;
    }
    if (node.classList.contains('is-approved') || node.classList.contains('is-done')) return;
    node.classList.add('is-approved');
    const btn = node.querySelector('.pa-action');
    if (btn) {
      const handler = (node.dataset && node.dataset.handler) ? node.dataset.handler : 'the property team';
      // "The Concierge" → "the Concierge"
      const h = handler.replace(/^The\s+/, 'the ');
      btn.textContent = 'With ' + h;
      btn.disabled = true;
    }
    // Re-snapshot the stream so the approved state survives a thread switch.
    if (state.activeThreadId) captureActiveStream();
  }

  // ═════════════ TYPING INPUT ═════════════
  function bindInputs() {
    $('#at-rest-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#at-rest-input').value.trim();
      if (!v) return;
      $('#at-rest-input').value = '';
      log('typed-input:at-rest', { text: v });
      // Route through handleUtterance so typed approvals / voice-mode commands
      // hit the same intercept logic as speech.
      handleUtterance(v);
    });
    $('#dialogue-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#dialogue-input').value.trim();
      if (!v) return;
      $('#dialogue-input').value = '';
      log('typed-input:dialogue', { text: v });
      handleUtterance(v);
    });
    // Mic buttons are TOGGLES — tap to start active capture, tap again to stop.
    function toggleListen() {
      if (isActive) { stopActive(/*resumeAmbient*/ true); return; }
      if (!state.micOn) {
        // Re-enable voice if it was off
        state.micOn = true;
        updateMicVisual();
      }
      // If permission hasn't been granted yet, force the browser prompt first
      if (micStatus !== 'granted') {
        requestMicPermissionThenListen().then(() => startListen()).catch(() => startListen());
      } else {
        startListen();
      }
    }
    $('#at-rest-mic').addEventListener('click', toggleListen);
    $('#dialogue-mic').addEventListener('click', toggleListen);
    const ptt = $('#ptt-button');
    if (ptt) ptt.addEventListener('click', toggleListen);

    // The top-bar "Voice on/off" toggle actually stops every recognizer.
    $('#mic-toggle').addEventListener('click', () => {
      state.micOn = !state.micOn;
      console.info('[atelier] voice toggle →', state.micOn ? 'on' : 'off');
      if (!state.micOn) {
        // Hard stop all recognizers + any TTS audio
        stopActive(/*resumeAmbient*/ false);
        stopAmbient();
        if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (e) {} }
        if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
        isTTSPlaying = false;
      } else {
        // Re-enable: re-run permission probe + start ambient
        requestMicPermissionThenListen();
      }
      updateMicVisual();
    });
    $('#lock-btn').addEventListener('click', togglePrivacy);
    $('#close-thread').addEventListener('click', closeDialogue);
    const newThreadBtn = $('#new-thread');
    if (newThreadBtn) newThreadBtn.addEventListener('click', newThreadFromDialogue);
    $('#enter-studio').addEventListener('click', enterStudio);
    $('#see-all-specialists').addEventListener('click', showAllSpecialists);
    const closeWhisper = $('#atelier-whisper-close');
    if (closeWhisper) closeWhisper.addEventListener('click', dismissWhisper);

    $$('.bar-view').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $$('[data-view-close]').forEach(b => b.addEventListener('click', () => setView('studio')));

    // "?" hint toggle — keep the cheat sheet out of the way until requested
    const hintBtn = $('#hint-toggle');
    if (hintBtn) {
      hintBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('hint-shown');
      });
      // Click anywhere else closes it
      document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('hint-shown')) return;
        if (e.target.closest('#hint') || e.target.closest('#hint-toggle')) return;
        document.body.classList.remove('hint-shown');
      });
    }
  }

  function showAllSpecialists() {
    // expand the suggestions row into a fuller wall
    const p = window.PROPERTIES[state.propertyId];
    const row = $('#suggestions');
    row.innerHTML = '';
    // change grid to fit more cards
    row.style.gridAutoFlow = 'row';
    row.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    for (const key of p.specialists) {
      const sp = window.SPECIALISTS[key];
      const card = el('button', { class: 'suggestion', onclick: () => openThread(key, 'A thought for ' + sp.name) });
      card.appendChild(el('div', { class: 'chip' }, initials(sp.name)));
      card.appendChild(el('div', { class: 'label' }, sp.name));
      card.appendChild(el('div', { class: 'who' }, sp.role));
      row.appendChild(card);
    }
    $('#see-all-specialists').textContent = 'Return to suggestions';
    $('#see-all-specialists').onclick = () => {
      row.style.gridAutoFlow = '';
      row.style.gridTemplateColumns = '';
      renderSuggestions();
      $('#see-all-specialists').onclick = showAllSpecialists;
      $('#see-all-specialists').innerHTML = 'See all <span id="specialist-count">' + p.specialists.length + '</span> specialists';
    };
  }

  // ═════════════ KEYBOARD ═════════════
  function bindKeys() {
    document.addEventListener('keydown', (ev) => {
      // Escape: in the constellation, first pull the camera back; from any
      // other overlay (or the wide constellation), return to the studio.
      if (ev.key === 'Escape' && (state.view === 'dashboard' || state.view === 'constellation')) {
        ev.preventDefault();
        if (state.view === 'constellation' && constCam.focusId) {
          zoomConstOut();
          return;
        }
        setView('studio');
        return;
      }
      if (!ev.metaKey && !ev.ctrlKey) return;
      const k = ev.key;
      if (k === '0') { ev.preventDefault(); window.location.reload(); }
      if (k === '1') { ev.preventDefault(); if (!document.body.classList.contains('studio-active')) enterStudio(); else setView('studio'); }
      if (k === '2') { ev.preventDefault(); runSeam(); }
      if (k === '3') { ev.preventDefault(); setView('constellation'); }
      if (k === '4') { ev.preventDefault(); setView('dashboard'); }
      if (k.toLowerCase() === 'l') { ev.preventDefault(); if (state.activeSpecialist) togglePrivacy(); }
      if (k === ' ') { ev.preventDefault(); startListen(); }
      if (k === '9') { ev.preventDefault(); state.presenterSafe = !state.presenterSafe; flashHint(state.presenterSafe ? 'Presenter safe mode \u00b7 ON' : 'Presenter safe mode \u00b7 OFF'); }
    });
  }
  function flashHint(s) {
    // Brief status toast in the corner — independent of the cheat sheet.
    let toast = document.getElementById('hint-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hint-toast';
      toast.style.cssText = 'position:fixed; bottom:48px; right:16px; z-index:80; padding:10px 16px; background:var(--bg-veil); border:1px solid var(--rule); font-family:var(--sans); font-size:10.5px; letter-spacing:0.24em; text-transform:uppercase; color:var(--ink-soft); opacity:0; transition:opacity 0.4s ease;';
      document.body.appendChild(toast);
    }
    toast.textContent = s;
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    clearTimeout(toast.__t);
    toast.__t = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ═════════════ BOOT ═════════════
  function boot() {
    console.log('[atelier] boot — build', '2026-05-16T22:30 (approve+pending-approval)');
    renderCoverProperties();
    renderSuggestions();
    renderPeriphery();
    bindInputs();
    bindKeys();
    initVoice();
    updateMicVisual();
    console.log('[atelier] boot complete. SpeechRecognition=', !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }
  document.addEventListener('DOMContentLoaded', boot);

  // Force a plan to Complete — drives the bar to stage 4 and reveals the
  // specialist's follow-up prompt. Useful for demos:
  //   Atelier.markPlanComplete('p_seed_dawn')
  //   Atelier.markPlanComplete('Lead partner dinner — Thursday')
  function markPlanComplete(idOrTitle) {
    const p = state.plans.find(x => x.id === idOrTitle || x.title === idOrTitle);
    if (!p) { log('markPlanComplete:not-found', { idOrTitle }); return false; }
    p.state = 'complete';
    p.whenAt = new Date(Date.now() - 1000).toISOString();
    state.openPlanId = p.id;
    renderPeriphery();
    return true;
  }

  // Expose a small surface for the demo orchestration
  window.Atelier = {
    enterStudio,
    runSeam,
    switchProperty,
    setView,
    state,
    markPlanComplete,
  };
})();
