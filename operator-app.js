/* ─────────────────────────────────────────────────────────────
   The Atelier · operator (staff) app
   ────────────────────────────────────────────────────────── */

(function () {
  'use strict';

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
  const initials = (n) => n.replace(/^The\s+/, '').slice(0, 2);

  // ═════════════ STATE ═════════════
  const state = {
    activePlans: [],        // dynamically created via BroadcastChannel from guest window
    seededFirehose: true,
    actionsCompleted: new Set(),
    currentBriefGuestId: null,
    briefClosedByPrivacy: null, // guestId whose brief we auto-closed on going private; reopen on un-private
  };

  // Map a guest display name to the canonical MOCK_GUESTS id so seed plans
  // (which were written by name) can be tied back to suite hotspots / brief.
  function guestIdByName(name) {
    if (!name) return null;
    const g = (window.MOCK_GUESTS || []).find(x => x.name === name);
    return g ? g.id : null;
  }

  // All unhandled actions tied to this guest, drawn from both seed plans and
  // live plans created from the guest window.
  function actionsForGuest(guestId) {
    const out = [];
    const pools = [(state.seedFirehosePlans || []), state.activePlans];
    for (const pool of pools) {
      for (const p of pool) {
        const pid = p.guestId || guestIdByName(p.guest);
        if (pid !== guestId) continue;
        if (p.hiddenByPrivacy) continue;
        for (const a of (p.actions || [])) {
          if (state.actionsCompleted.has(a.id)) continue;
          out.push({ action: a, plan: p });
        }
      }
    }
    return out;
  }

  // Mirror of actionsForGuest, restricted to actions the operator has already
  // handled. These have left the firehose but stay on the guest's brief as
  // the durable record of what is set.
  function confirmedActionsForGuest(guestId) {
    const out = [];
    const pools = [(state.seedFirehosePlans || []), state.activePlans];
    for (const pool of pools) {
      for (const p of pool) {
        const pid = p.guestId || guestIdByName(p.guest);
        if (pid !== guestId) continue;
        if (p.hiddenByPrivacy) continue;
        for (const a of (p.actions || [])) {
          if (!state.actionsCompleted.has(a.id)) continue;
          out.push({ action: a, plan: p });
        }
      }
    }
    return out;
  }

  // ═════════════ AERIAL ═════════════
  function applyGuestStateToSuite(guest) {
    const g = document.querySelector(`[data-suite="${guest.id}"]`);
    if (!g) return;
    if (guest.privateThreadCount > 0) g.setAttribute('data-private', 'true');
    // Determine top-level state from threads
    let st = 'settled';
    const hasAwait = (guest.threads || []).some(t => t.state === 'awaits');
    const hasMotion = (guest.threads || []).some(t => t.state === 'motion' && !t.private);
    if (hasAwait) st = 'awaits';
    else if (hasMotion) st = 'motion';
    if (guest.privateThreadCount && !hasAwait && !hasMotion) st = 'motion';
    g.setAttribute('data-state', st);
  }

  function seedAerial() {
    for (const guest of window.MOCK_GUESTS) {
      applyGuestStateToSuite(guest);
    }
    // Madera private room: starts settled then becomes "awaits" when plan is created
    const madera = document.querySelector('[data-suite="madera_private"]');
    if (madera) madera.setAttribute('data-state', 'settled');
  }

  function bindAerialClicks() {
    $$('.suite').forEach(s => {
      s.addEventListener('click', () => {
        const id = s.dataset.suite;
        // Mark this as active visually
        $$('.suite').forEach(o => o.classList.remove('is-active'));
        s.classList.add('is-active');
        openBrief(id);
      });
    });
  }

  // ═════════════ BRIEF PANEL ═════════════
  function openBrief(id) {
    const guest = (window.MOCK_GUESTS || []).find(g => g.id === id);
    const brief = $('#brief');
    const content = $('#brief-content');
    content.innerHTML = '';
    state.currentBriefGuestId = id;

    if (id === 'madera_private') {
      // a different kind of brief: a place, not a guest
      content.appendChild(el('div', { class: 'brief-head' },
        el('div', { class: 'eb' }, 'A place on the property'),
        el('h2', {}, 'The private room \u00b7 Madera'),
        el('div', { class: 'suite-line' }, 'Reserved Thursday 7:00 pm \u2014 four covers')
      ));
      content.appendChild(el('div', { class: 'brief-section' },
        el('h3', {}, 'What is in motion here'),
        el('p', { class: 'lede' }, 'The lead partner dinner for Daniel Park\u2019s Series B. A ceremonial tea service through the meal, Sand Hill estate cold-brew with the second course, Sand Hill estate honey at each cover.'),
        el('p', { class: 'body-line' }, 'The Convener has set the table. The Concierge has the car held for 10:00 pm.')
      ));
      brief.classList.add('is-open');
      return;
    }

    if (!guest) return;

    // head
    content.appendChild(el('div', { class: 'brief-head' },
      el('div', { class: 'eb' }, guest.active ? 'In session \u00b7 with The Atelier' : 'In residence'),
      el('h2', {}, guest.name),
      el('div', { class: 'suite-line' }, guest.suite)
    ));

    // what they came for
    content.appendChild(el('div', { class: 'brief-section' },
      el('h3', {}, 'What they came for'),
      el('p', { class: 'lede' }, guest.came),
      el('p', { class: 'body-line' }, '\u2014 ' + guest.bodyState)
    ));

    // threads
    if (guest.threads && guest.threads.length) {
      const sec = el('div', { class: 'brief-section' });
      sec.appendChild(el('h3', {}, 'Active threads'));
      for (const t of guest.threads) {
        const sp = window.SPECIALISTS[t.specialist];
        if (t.private) {
          sec.appendChild(el('div', { class: 'brief-thread' },
            el('div', { class: 'bt-chip', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px;color:var(--ink)"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' }),
            el('div', {},
              el('div', { class: 'bt-title' }, 'A conversation held in confidence'),
              el('div', { class: 'bt-meta' }, 'Between the guest and ' + sp.name),
            ),
            el('div', { class: 'bt-state private' }),
          ));
        } else {
          sec.appendChild(el('div', { class: 'brief-thread' },
            el('div', { class: 'bt-chip' }, initials(sp.name)),
            el('div', {},
              el('div', { class: 'bt-title' }, t.title),
              el('div', { class: 'bt-meta' }, sp.name + ' \u00b7 ' + (t.state === 'awaits' ? 'awaits an action' : t.state === 'motion' ? 'in motion' : 'settled')),
            ),
            el('div', { class: 'bt-state ' + (t.state || 'motion') }),
          ));
        }
      }
      content.appendChild(sec);
    }

    // live actions awaiting staff — drawn from seed + plan_created broadcasts
    renderBriefActionsSection(content, guest.id);
    // what has already been set — handled actions persist here as the durable
    // record for this guest, even after they leave the firehose.
    renderBriefConfirmedSection(content, guest.id);

    // next moment
    if (guest.nextMoment) {
      content.appendChild(el('div', { class: 'brief-section' },
        el('h3', {}, 'Next moment'),
        el('p', { class: 'lede' }, guest.nextMoment)
      ));
    }

    // confidence block
    if (guest.privateThreadCount) {
      content.appendChild(el('div', { class: 'brief-confidence' },
        el('div', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' }),
        el('div', {},
          el('div', { class: 'pc-eb' }, 'Held in confidence'),
          el('div', { class: 'pc-body' }, guest.privateThreadCount === 1
            ? 'One thread the guest holds in confidence with the studio. The content is not visible here.'
            : `${guest.privateThreadCount} threads the guest holds in confidence with the studio. The content is not visible here.`)
        )
      ));
    }
    brief.classList.add('is-open');
  }

  // Renders an "Awaiting an action" block listing every unhandled action
  // (seed + live broadcast) tied to this guest. Reused on initial open and on
  // live refresh when plan_created / staff_handled events arrive.
  function renderBriefActionsSection(container, guestId) {
    // remove any prior live section so we can re-render in place
    const prior = container.querySelector('.brief-section.brief-live-actions');
    if (prior) prior.remove();
    const items = actionsForGuest(guestId);
    if (!items.length) return;
    const sec = el('div', { class: 'brief-section brief-live-actions' });
    sec.appendChild(el('h3', {}, 'Awaiting an action'));
    for (const { action, plan } of items) {
      const row = el('div', { class: 'fh-action', data: { actionId: action.id } });
      row.appendChild(el('div', {},
        el('div', { class: 'fh-action-text' }, action.title),
        el('div', { class: 'fh-handler' },
          action.handler + ' · ' + (plan.title || plan.kind || 'plan')),
      ));
      const btn = el('button', { class: 'fh-handle', onclick: () => handleAction(action.id, row) }, 'I will handle it');
      row.appendChild(btn);
      sec.appendChild(row);
    }
    // Insert before "Next moment" if present, else at end
    const nextSection = Array.from(container.querySelectorAll('.brief-section'))
      .find(s => s.querySelector('h3') && s.querySelector('h3').textContent === 'Next moment');
    if (nextSection) container.insertBefore(sec, nextSection);
    else container.appendChild(sec);
  }

  function renderBriefConfirmedSection(container, guestId) {
    const prior = container.querySelector('.brief-section.brief-confirmed');
    if (prior) prior.remove();
    const items = confirmedActionsForGuest(guestId);
    if (!items.length) return;
    const sec = el('div', { class: 'brief-section brief-confirmed' });
    sec.appendChild(el('h3', {}, 'What is set'));
    for (const { action, plan } of items) {
      const row = el('div', { class: 'bc-row' });
      row.appendChild(el('div', { class: 'bc-glyph' }, '✓'));
      row.appendChild(el('div', {},
        el('div', { class: 'bc-text' }, action.title),
        el('div', { class: 'bc-meta' }, action.handler + ' · ' + (plan.title || plan.kind || 'plan')),
      ));
      sec.appendChild(row);
    }
    // Insert after the live actions section if present, otherwise before "Next moment"
    const liveSec = container.querySelector('.brief-section.brief-live-actions');
    const nextSec = Array.from(container.querySelectorAll('.brief-section'))
      .find(s => s.querySelector('h3') && s.querySelector('h3').textContent === 'Next moment');
    if (liveSec) liveSec.parentNode.insertBefore(sec, liveSec.nextSibling);
    else if (nextSec) container.insertBefore(sec, nextSec);
    else container.appendChild(sec);
  }

  function refreshOpenBrief() {
    const id = state.currentBriefGuestId;
    if (!id) return;
    const brief = $('#brief');
    if (!brief || !brief.classList.contains('is-open')) return;
    renderBriefActionsSection($('#brief-content'), id);
    renderBriefConfirmedSection($('#brief-content'), id);
  }

  $('#brief-close').addEventListener('click', () => {
    $('#brief').classList.remove('is-open');
    $$('.suite').forEach(s => s.classList.remove('is-active'));
    state.currentBriefGuestId = null;
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      $('#brief').classList.remove('is-open');
      $$('.suite').forEach(s => s.classList.remove('is-active'));
      state.currentBriefGuestId = null;
    }
  });

  // ═════════════ FIREHOSE ═════════════
  function seedFirehose() {
    const list = $('#firehose-list');
    list.innerHTML = '';
    // Plans already in motion across the floor
    const seedPlans = [
      {
        guest: 'Marcus & Lena Trent', guestId: 'g_trents',
        kind: 'ceremony',
        title: 'Saturday vow renewal \u2014 the east lawn at golden hour',
        context: 'Ten guests. Kahu present. The flowers are field, not florist.',
        actions: [
          { id: 's_trents_chairs', title: 'Confirm chair count and aisle width for ten', handler: 'The Concierge' },
        ],
      },
      {
        guest: 'Aisha Devaraj', guestId: 'g_devaraj',
        kind: 'preparation',
        title: 'Remarks for tomorrow\u2019s 9:00 am board call',
        context: 'The Coach has run them three times. One more pass at 7:30 am.',
        actions: [
          { id: 's_devaraj_water', title: 'Set the room with still water and the green felt at 6:45 am', handler: 'The Concierge' },
        ],
      },
      {
        guest: 'Sara Voss', guestId: 'g_voss',
        kind: 'recovery',
        title: 'Breathwork at first light, Asaya treatment room two',
        context: 'A recovery week after a hard quarter. The Physician has the day mapped.',
        actions: [],
      },
    ];
    state.seedFirehosePlans = seedPlans;
    for (const p of seedPlans) {
      list.appendChild(renderFhCard(p));
    }
    updateStats();
  }

  function renderFhCard(plan) {
    const card = el('div', { class: 'fh-card' });
    if (plan.actions && plan.actions.length) card.dataset.hadActions = 'true';
    card.appendChild(el('div', { class: 'fh-eb', html: `${plan.guest ? '<strong>' + plan.guest + '</strong> &middot; ' : ''}${plan.kind.toUpperCase()}` }));
    card.appendChild(el('div', { class: 'fh-title' }, plan.title));
    if (plan.context) card.appendChild(el('div', { class: 'fh-context' }, plan.context));
    if (plan.actions && plan.actions.length) {
      for (const a of plan.actions) {
        const row = el('div', { class: 'fh-action', data: { actionId: a.id } });
        if (state.actionsCompleted.has(a.id)) row.classList.add('is-done');
        row.appendChild(el('div', {},
          el('div', { class: 'fh-action-text' }, a.title),
          el('div', { class: 'fh-handler' }, a.handler + (a.rationale ? '  \u00b7  ' + a.rationale : ''))
        ));
        const btn = el('button', { class: 'fh-handle', onclick: () => handleAction(a.id, row) },
          state.actionsCompleted.has(a.id) ? 'Handled' : 'I will handle it');
        row.appendChild(btn);
        card.appendChild(row);
      }
    }
    return card;
  }

  function handleAction(actionId, row) {
    if (state.actionsCompleted.has(actionId)) return;
    state.actionsCompleted.add(actionId);
    row.classList.add('is-done');
    row.querySelector('.fh-handle').textContent = 'Handled';
    // Also mark the same action wherever else it is rendered (firehose card,
    // brief panel, etc.) so the operator sees a single source of truth.
    document.querySelectorAll('[data-action-id="' + actionId + '"]').forEach(node => {
      if (node === row) return;
      node.classList.add('is-done');
      const btn = node.querySelector('.fh-handle');
      if (btn) btn.textContent = 'Handled';
    });
    publish({ type: 'staff_handled', actionId });
    showToast(toastFor(actionId));
    updateStats();
    refreshOpenBrief();
    retireHandledFromFirehose(actionId);
  }

  // After a short confirmation beat, fade the handled row out of the firehose
  // and remove it from the DOM. If its card was action-bearing and now has none
  // left, retire the card too. The action stays on the guest's brief under
  // "What is set" — the firehose is strictly things still wanting attention.
  function retireHandledFromFirehose(actionId) {
    setTimeout(() => {
      document.querySelectorAll('.fh-action[data-action-id="' + actionId + '"]').forEach(node => {
        const card = node.closest('.fh-card');
        node.classList.add('is-removing');
        setTimeout(() => {
          node.remove();
          if (card && card.dataset.hadActions === 'true' && card.querySelectorAll('.fh-action').length === 0) {
            card.classList.add('is-removing');
            setTimeout(() => card.remove(), 600);
          }
        }, 600);
      });
    }, 2400);
  }

  function toastFor(id) {
    const m = {
      a_room: 'Henri has the Madera private room arranged. The Convener has been informed.',
      a_pairing: 'Chef Garrison has confirmed the tea pairing. The Sommelier has been informed.',
      a_car:  'The car is held for 10:00 pm at Madera. The Convener has been informed.',
      s_trents_chairs: 'Saturday chairs and aisle width confirmed. The Celebrant has been informed.',
      s_devaraj_water: 'The board room is set. The Coach has been informed.',
    };
    return m[id] || 'The specialist has been informed.';
  }

  function showToast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('is-shown');
    clearTimeout(t.__hideT);
    t.__hideT = setTimeout(() => t.classList.remove('is-shown'), 3800);
  }

  function updateStats() {
    const inResidence = window.MOCK_GUESTS.filter(g => g.bodyState !== 'arriving').length;
    $('#stat-guests').textContent = inResidence;
    const plansSeed = (state.seedFirehosePlans || []).length + state.activePlans.length;
    $('#stat-plans').textContent = plansSeed;
    const totalActions = (state.seedFirehosePlans || []).reduce((n, p) => n + (p.actions ? p.actions.length : 0), 0)
                       + state.activePlans.reduce((n, p) => n + (p.actions ? p.actions.length : 0), 0);
    const awaiting = totalActions - state.actionsCompleted.size;
    $('#stat-await').textContent = Math.max(0, awaiting);
    const conf = window.MOCK_GUESTS.reduce((n, g) => n + (g.privateThreadCount || 0), 0);
    $('#stat-conf').textContent = conf;
  }

  // ═════════════ BROADCAST CHANNEL ═════════════
  let bc = null;
  try { bc = new BroadcastChannel('atelier'); } catch (e) {}
  function publish(msg) { try { bc && bc.postMessage(msg); } catch (e) {} }

  if (bc) {
    bc.onmessage = (ev) => {
      const m = ev.data;
      const ts = new Date().toISOString().slice(11, 23);
      console.log('[operator ' + ts + '] broadcast:in', m && m.type, m);
      if (m.type === 'plan_created') {
        // Push plan to firehose
        const guestName = (window.MOCK_GUESTS.find(g => g.id === m.plan.guestId) || {}).name || 'A guest';
        const plan = {
          guest: guestName,
          guestId: m.plan.guestId || null,
          specialist: m.plan.specialist || null,
          kind: m.plan.kind || 'plan',
          title: m.plan.title,
          context: [m.plan.when, m.plan.where].filter(Boolean).join(' \u00b7 '),
          actions: m.plan.actions || [],
        };
        state.activePlans.unshift(plan);
        const list = $('#firehose-list');
        list.insertBefore(renderFhCard(plan), list.firstChild);
        updateStats();
        // Light up Madera private room
        const madera = document.querySelector('[data-suite="madera_private"]');
        if (madera) madera.setAttribute('data-state', 'awaits');
        // Light up the originating guest's suite (Daniel Park) — set awaits
        const originId = m.plan.guestId || 'g_daniel_park';
        const guestSuite = document.querySelector('[data-suite="' + originId + '"]');
        if (guestSuite) guestSuite.setAttribute('data-state', 'awaits');
        refreshOpenBrief();
      } else if (m.type === 'privacy_toggled') {
        const guestId = m.guestId || 'g_daniel_park';
        const guestSuite = document.querySelector('[data-suite="' + guestId + '"]');
        if (guestSuite) {
          guestSuite.setAttribute('data-private', m.private ? 'true' : 'false');
          guestSuite.setAttribute('data-state', m.private ? 'settled' : 'motion');
        }
        // Hide / show plans in firehose that belong to the affected specialist
        // or whose title matches the affected list.
        const affected = Array.isArray(m.affectedPlanTitles) ? m.affectedPlanTitles : [];
        state.activePlans.forEach(p => {
          const titleMatch = affected.length > 0 && affected.includes(p.title);
          const specMatch = m.specialist && p.specialist === m.specialist;
          const guestMatch = m.guestId && p.guestId === m.guestId;
          if (titleMatch || specMatch || (guestMatch && p.specialist === m.specialist)) {
            p.hiddenByPrivacy = !!m.private;
          }
        });
        // Re-render firehose
        const list = $('#firehose-list');
        list.innerHTML = '';
        state.activePlans
          .filter(p => !p.hiddenByPrivacy)
          .forEach(p => list.appendChild(renderFhCard(p)));
        // Mirror the privacy flag onto the matching thread record so the brief
        // shows the lock placeholder while private and the real title once public.
        // Only adjust the tally if the thread's state actually changed, so repeat
        // toggles can't drift the count.
        const guestRec = (window.MOCK_GUESTS || []).find(g => g.id === guestId);
        if (guestRec && Array.isArray(guestRec.threads)) {
          const thread = guestRec.threads.find(t =>
            t.specialist === m.specialist && (!m.title || t.title === m.title));
          if (thread && thread.private !== !!m.private) {
            thread.private = !!m.private;
            guestRec.privateThreadCount = Math.max(0,
              (guestRec.privateThreadCount || 0) + (m.private ? 1 : -1));
          }
        }
        // If Madera plan is now hidden, dim the private-room hotspot
        const madera = document.querySelector('[data-suite="madera_private"]');
        if (madera) {
          const anyPublicPlan = state.activePlans.some(p => !p.hiddenByPrivacy);
          madera.setAttribute('data-state', anyPublicPlan ? 'awaits' : 'settled');
        }
        // Brief visibility: on going private, close the brief if it was open for
        // this guest (don't leak context) and remember we closed it. On going
        // back to public, reopen so the thread returns to visibility on its own.
        const brief = $('#brief');
        const briefOpen = brief && brief.classList.contains('is-open');
        if (m.private) {
          if (briefOpen && state.currentBriefGuestId === guestId) {
            brief.classList.remove('is-open');
            state.briefClosedByPrivacy = guestId;
          }
        } else {
          if (state.briefClosedByPrivacy === guestId) {
            state.briefClosedByPrivacy = null;
            openBrief(guestId);
          } else if (briefOpen && state.currentBriefGuestId === guestId) {
            openBrief(guestId); // re-render so thread title replaces the lock placeholder
          }
        }
        updateStats();
      } else if (m.type === 'thread_opened') {
        const guestId = m.guestId || 'g_daniel_park';
        const guestSuite = document.querySelector('[data-suite="' + guestId + '"]');
        if (guestSuite && !m.private) guestSuite.setAttribute('data-state', 'motion');
        // Mirror the new thread into the operator's guest record so the brief
        // panel picks it up. Without this, threads opened live in guest mode
        // never appear in operator — the brief reads from MOCK_GUESTS.
        const guestRec = (window.MOCK_GUESTS || []).find(g => g.id === guestId);
        if (guestRec) {
          if (!Array.isArray(guestRec.threads)) guestRec.threads = [];
          const dup = guestRec.threads.some(t => t.specialist === m.specialist && t.title === m.title);
          if (!dup) {
            guestRec.threads.unshift({ title: m.title, specialist: m.specialist, state: 'motion', private: !!m.private });
            refreshOpenBrief();
          }
        }
        // Update the status line: "Daniel Park · with The Strategist"
        const sp = (window.SPECIALISTS && window.SPECIALISTS[m.specialist]) || null;
        const guestName = (guestRec && guestRec.name) || 'A guest';
        const status = document.getElementById('op-status');
        if (status) {
          if (sp) status.textContent = guestName + ' · with ' + sp.name + (m.private ? ' · held in confidence' : '');
          else status.textContent = guestName + ' · in conversation' + (m.private ? ' · held in confidence' : '');
        }
      } else if (m.type === 'guest_approved' && m.actionId) {
        // The guest has approved an action card (tap or voice). The action stays
        // pending — staff still needs to confirm — but every place it is rendered
        // gets an "Approved by guest" badge so the operator sees it is now real.
        console.log('[operator ' + ts + '] guest_approved action=' + m.actionId + ' via ' + (m.source || 'unknown'));
        document.querySelectorAll('[data-action-id="' + m.actionId + '"]').forEach(node => {
          if (state.actionsCompleted.has(m.actionId)) return; // already handled
          if (node.classList.contains('is-approved') || node.classList.contains('is-done')) return;
          node.classList.add('is-approved');
          // Insert a small badge inside the handler line, if present
          const handlerEl = node.querySelector('.fh-handler');
          if (handlerEl && !handlerEl.querySelector('.fh-approved-badge')) {
            const badge = document.createElement('span');
            badge.className = 'fh-approved-badge';
            badge.textContent = ' · Approved by guest' + (m.source === 'voice' ? ' (voice)' : '');
            handlerEl.appendChild(badge);
          }
          // Soften the button to signal it's still actionable by staff
          const btn = node.querySelector('.fh-handle');
          if (btn) {
            btn.textContent = 'Handle';
            btn.classList.add('is-approved-by-guest');
          }
        });
        // Light up a toast so the operator notices the approval landed
        showToast('Guest approved' + (m.source === 'voice' ? ' by voice' : '') + '. Awaiting your handling.');
      } else if (m.type === 'property_changed') {
        document.documentElement.setAttribute('data-property', m.propertyId);
        applyPropertyToOperator(m.propertyId);
      }
    };
  }

  // Visual binding for property switches from the guest window. The operator
  // currently only models the Sand Hill aerial; for other properties we update
  // the header + title and show a note explaining what the operator would see
  // in production.
  const PROPERTY_LABELS = {
    sandhill:    { name: 'Rosewood Sand Hill', land: 'Sixteen acres along',    placeEm: 'Sand Hill Road',       note: null },
    hongkong:    { name: 'Rosewood Hong Kong', land: 'Twelve stories above',   placeEm: 'Victoria Dockside',   note: 'The Hong Kong tower has its own operator surface in production. Showing the Sand Hill floor below for continuity.' },
    crillon:     { name: 'Hôtel de Crillon',   land: 'Two palace wings facing', placeEm: 'Place de la Concorde', note: 'The Crillon has its own operator surface in production. Showing the Sand Hill floor below for continuity.' },
    carlyle:     { name: 'The Carlyle',         land: 'A residential palace on', placeEm: 'Madison Avenue',     note: 'The Carlyle has its own operator surface in production. Showing the Sand Hill floor below for continuity.' },
    konavillage: { name: 'Kona Village',        land: 'Forty-three hales along', placeEm: "Ka'ūpūlehu Bay",     note: 'Kona Village has its own operator surface in production. Showing the Sand Hill floor below for continuity.' },
    phuket:      { name: 'Rosewood Phuket',     land: 'Sixty residences on',     placeEm: 'Emerald Bay',         note: 'Phuket has its own operator surface in production. Showing the Sand Hill floor below for continuity.' },
  };

  function applyPropertyToOperator(pid) {
    const p = PROPERTY_LABELS[pid] || PROPERTY_LABELS.sandhill;
    const pname = document.getElementById('op-property-name');
    if (pname) pname.textContent = p.name;
    const at = document.getElementById('op-aerial-title');
    if (at) at.innerHTML = p.land + '<br/><em>' + p.placeEm + '</em>';
    const note = document.getElementById('op-aerial-note');
    if (note) {
      if (p.note) { note.textContent = p.note; note.style.display = 'block'; }
      else { note.textContent = ''; note.style.display = 'none'; }
    }
    // Toast briefly so the operator sees the change land
    const status = document.getElementById('op-status');
    if (status) status.textContent = 'Guest moved to ' + p.name;
    setTimeout(() => {
      if (status && status.textContent.startsWith('Guest moved to')) status.textContent = 'Tonight on the floor';
    }, 4500);
  }

  // ═════════════ BOOT ═════════════
  seedAerial();
  bindAerialClicks();
  seedFirehose();
  updateStats();

  // expose for debugging
  window.Operator = { openBrief, handleAction };
})();
