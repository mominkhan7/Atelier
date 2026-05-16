/* ─────────────────────────────────────────────────────────────
   <atelier-orb size="220" state="rest|listening|speaking">
   The studio's single visual signature.
   Light-DOM custom element (no shadow root) so it renders
   everywhere, including html-to-image capture, and so external
   CSS can target its parts cleanly.
   ────────────────────────────────────────────────────────── */

(function () {
  if (customElements.get('atelier-orb')) return;

  // One shared svg defs block so the gradients only define once
  function ensureDefs() {
    if (document.getElementById('atelier-orb-defs')) return;
    const wrap = document.createElement('div');
    wrap.id = 'atelier-orb-defs';
    wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    wrap.innerHTML = `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="og-body" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stop-color="var(--orb-1)" />
            <stop offset="35%"  stop-color="var(--orb-2)" />
            <stop offset="70%"  stop-color="var(--orb-3)" />
            <stop offset="100%" stop-color="var(--orb-4)" />
          </radialGradient>
          <radialGradient id="og-inner" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stop-color="rgba(255,255,255,0.32)" />
            <stop offset="60%" stop-color="rgba(255,255,255,0)" />
          </radialGradient>
          <radialGradient id="og-spec" cx="32%" cy="28%" r="38%">
            <stop offset="0%"  stop-color="rgba(255,255,255,0.65)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0)" />
          </radialGradient>
          <radialGradient id="og-rim" cx="72%" cy="78%" r="55%">
            <stop offset="0%"  stop-color="rgba(0,0,0,0)" />
            <stop offset="78%" stop-color="rgba(0,0,0,0)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0.22)" />
          </radialGradient>
        </defs>
      </svg>
    `;
    document.body.insertBefore(wrap, document.body.firstChild);
  }

  // Inject the shared styles once
  function ensureStyles() {
    if (document.getElementById('atelier-orb-styles')) return;
    const style = document.createElement('style');
    style.id = 'atelier-orb-styles';
    style.textContent = `
      atelier-orb {
        display: inline-block;
        position: relative;
        width: var(--orb-size, 220px);
        height: var(--orb-size, 220px);
      }
      atelier-orb .ao-stage {
        position: absolute; inset: 0;
        display: grid; place-items: center;
        pointer-events: none;
      }
      atelier-orb .ao-halo {
        position: absolute;
        width: 220%; height: 220%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(var(--orb-halo, 90,130,100), 0.34) 0%, rgba(var(--orb-halo, 90,130,100), 0.12) 35%, transparent 65%);
        opacity: 0.72;
        animation: ao-halo-breath 9s ease-in-out infinite;
      }
      atelier-orb .ao-svg {
        position: relative;
        width: 100%; height: 100%;
        animation: ao-orb-breath 9s ease-in-out infinite;
        filter: drop-shadow(0 4px 24px rgba(0,0,0,0.10));
      }
      atelier-orb .ao-ring {
        position: absolute;
        border-radius: 50%;
        border: 1px solid rgba(var(--orb-halo, 90,130,100), 0.55);
        width: 100%; height: 100%;
        pointer-events: none;
        opacity: 0;
      }
      atelier-orb[state="listening"] .ao-ring { animation: ao-ring 1.6s ease-out infinite; }
      atelier-orb[state="listening"] .ao-ring.r2 { animation-delay: 0.55s; }
      atelier-orb[state="listening"] .ao-halo {
        opacity: 1.0;
        animation: ao-halo-breath 2.4s ease-in-out infinite;
      }
      atelier-orb[state="speaking"] .ao-svg {
        animation: ao-orb-speak 0.45s ease-in-out infinite;
      }
      atelier-orb[state="speaking"] .ao-halo {
        animation: ao-halo-speak 0.45s ease-in-out infinite;
      }
      @keyframes ao-halo-breath {
        0%, 100% { opacity: 0.6; transform: scale(1.0); }
        50%      { opacity: 0.88; transform: scale(1.03); }
      }
      @keyframes ao-orb-breath {
        0%, 100% { transform: scale(1.0); }
        50%      { transform: scale(1.018); }
      }
      @keyframes ao-ring {
        0%   { transform: scale(0.92); opacity: 0.0; }
        20%  { opacity: 0.85; }
        100% { transform: scale(2.0); opacity: 0; }
      }
      @keyframes ao-orb-speak {
        0%, 100% { transform: scale(1.0); }
        50%      { transform: scale(1.025); }
      }
      @keyframes ao-halo-speak {
        0%, 100% { opacity: 0.7; transform: scale(1.0); }
        50%      { opacity: 1.0; transform: scale(1.06); }
      }
      @media (prefers-reduced-motion: reduce) {
        atelier-orb .ao-svg, atelier-orb .ao-halo, atelier-orb .ao-ring { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function build(host) {
    host.innerHTML = `
      <div class="ao-stage">
        <div class="ao-halo"></div>
        <div class="ao-ring r1"></div>
        <div class="ao-ring r2"></div>
        <svg class="ao-svg" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="92" fill="url(#og-body)" />
          <circle cx="100" cy="100" r="92" fill="url(#og-inner)" />
          <circle cx="100" cy="100" r="92" fill="url(#og-spec)" />
          <circle cx="100" cy="100" r="92" fill="url(#og-rim)" />
        </svg>
      </div>
    `;
  }

  class AtelierOrb extends HTMLElement {
    static get observedAttributes() { return ['size', 'state']; }
    attributeChangedCallback(name, _old, val) {
      if (name === 'size' && val) this.style.setProperty('--orb-size', val + 'px');
    }
    connectedCallback() {
      ensureStyles();
      ensureDefs();
      if (!this.firstElementChild) build(this);
      if (this.hasAttribute('size')) this.style.setProperty('--orb-size', this.getAttribute('size') + 'px');
      if (!this.hasAttribute('state')) this.setAttribute('state', 'rest');
    }
    setState(s) { this.setAttribute('state', s); }
  }
  customElements.define('atelier-orb', AtelierOrb);
})();
