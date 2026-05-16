/* ─────────────────────────────────────────────────────────────
   The Atelier · data layer
   Properties · Specialists · Mock guests · Canned content
   ────────────────────────────────────────────────────────── */

// 12 specialists, distributed across 3 properties. The atelier itself is the
// host (not counted toward the 12). Each property pulls a 6-specialist roster
// from this set, with three universals (concierge, sommelier, historian) and
// three+ unique-to-place specialists.
window.SPECIALISTS = {
  atelier:    { name: 'The Atelier',    role: 'your host',                              voice: 'host' },

  // Universal (all three properties)
  concierge:  { name: 'The Concierge',  role: 'logistics · reservations',               voice: 'crisp' },
  sommelier:  { name: 'The Sommelier',  role: 'drinks · pairings · the table',          voice: 'gravelly' },
  historian:  { name: 'The Historian',  role: 'place · heritage · meaning',             voice: 'considered' },

  // Sand Hill — performance studio (deal-making, hard moments, recovery)
  strategist: { name: 'The Strategist', role: 'deals · structure · negotiation',        voice: 'considered' },
  convener:   { name: 'The Convener',   role: 'business hosting · gatherings',          voice: 'crisp' },
  physician:  { name: 'The Physician',  role: 'wellness · recovery · longevity',        voice: 'contemplative' },
  steward:    { name: 'The Steward',    role: 'private counsel · the vault',            voice: 'considered' },

  // Crillon — palace studio (Paris art world, ceremony, experiences)
  aesthete:   { name: 'The Aesthete',   role: 'fine art · auctions · galleries',        voice: 'gravelly' },
  curator:    { name: 'The Curator',    role: 'experiences · plans · routes',           voice: 'warmF' },
  celebrant:  { name: 'The Celebrant',  role: 'weddings · proposals · milestones',      voice: 'warmF' },

  // Kona Village — ocean studio (water, land, ceremony with cultural depth)
  mariner:    { name: 'The Mariner',    role: 'ocean · sailing · the water',            voice: 'gravelly' },
  naturalist: { name: 'The Naturalist', role: 'land · creatures · the wild',            voice: 'gravelly' },
};

window.PROPERTIES = {
  sandhill: {
    id: 'sandhill',
    name: 'Rosewood Sand Hill',
    short: 'Sand Hill',
    location: 'Menlo Park · California',
    suite: 'The Madera Residence',
    tagline: 'A Rosewood Hotel · Home of Asaya',
    hour: 'golden hour over the California oaks',
    specialists: ['strategist','convener','physician','steward','sommelier','concierge','historian'],
    suggestions: [
      { specialist: 'strategist', label: 'A deal in motion',          kickoff: 'I am working through a deal right now — terms, structure, sequence. Help me think the moves.' },
      { specialist: 'convener',   label: 'Host a board dinner',       kickoff: 'I have a dinner to host — board, partners, or a small gathering. Help me think the room, the seating, the timing.' },
      { specialist: 'physician',  label: 'Sleep, recovery, performance', kickoff: 'I am here to reset. Help me think through sleep, recovery, training while I am at Sand Hill.' },
      { specialist: 'steward',    label: 'Private counsel',           kickoff: 'I have something heavy I would like to think through privately.' },
      { specialist: 'historian',  label: 'The land before the Valley', kickoff: 'I want to understand where I really am. Before the venture firms, what was this land, who were its first people?' },
      { specialist: 'sommelier',  label: 'Drinks for the table',      kickoff: 'I have a dinner coming up and want to think through the beverages — teas, an elegant zero-proof, something with intention.' },
    ],
    atelierPersona: 'The Atelier at Sand Hill speaks to a guest between hard things — a deal closing, a board call tomorrow, a recovery after a hard quarter. The register is calm, performance-aware, never breezy.',
    welcomeLine: 'Welcome back. Madera holds your usual table from 7:30.',
  },
  crillon: {
    id: 'crillon',
    name: 'Hôtel de Crillon',
    short: 'Crillon',
    location: 'Place de la Concorde · Paris',
    suite: 'Suite Marie-Antoinette',
    tagline: 'A Rosewood Hotel',
    hour: 'twilight over the Tuileries',
    specialists: ['aesthete','curator','celebrant','sommelier','concierge','historian'],
    suggestions: [
      { specialist: 'aesthete',  label: 'The Paris art world',              kickoff: 'I would like to engage with the Paris art world during this stay — the right galleries, perhaps a private viewing.' },
      { specialist: 'curator',   label: 'Plan a few evenings in Paris',     kickoff: 'Help me plan a few experiences in Paris during this stay.' },
      { specialist: 'celebrant', label: 'A moment that matters',            kickoff: 'I am here for something significant — a proposal, an anniversary, a wedding to think through.' },
      { specialist: 'sommelier', label: 'Drinks for an occasion',           kickoff: 'I have a dinner coming up and want to think through the beverages.' },
      { specialist: 'historian', label: 'The story of where you are',       kickoff: 'I would like to understand the Crillon and the Place de la Concorde. Take me through it.' },
      { specialist: 'concierge', label: 'A car, a reservation',             kickoff: 'I need a car and a reservation set for tomorrow evening. Help me line it up.' },
    ],
    atelierPersona: 'The Atelier at Crillon speaks to a guest in a city that has held what they came for. Place de la Concorde is out the window.',
    welcomeLine: 'Welcome to the Crillon. The Aesthete has held Thursday’s Sotheby’s preview.',
  },
  konavillage: {
    id: 'konavillage',
    name: 'Kona Village',
    short: 'Kona Village',
    location: 'Kaʻūpūlehu · Big Island',
    suite: 'Hale by the Sea',
    tagline: 'A Rosewood Resort',
    hour: 'first light over the reef',
    specialists: ['mariner','naturalist','celebrant','sommelier','concierge','historian'],
    suggestions: [
      { specialist: 'mariner',    label: 'A morning on the water',     kickoff: 'I want to be on the water during this stay — paddling, surfing, diving.' },
      { specialist: 'naturalist', label: 'The land and the creatures', kickoff: 'I want to be in real contact with this place — the lava fields, the reef, the trade winds.' },
      { specialist: 'celebrant',  label: 'A ceremony or milestone',    kickoff: 'I am here for something meaningful — a wedding, a vow renewal — with care for Hawaiian tradition.' },
      { specialist: 'historian',  label: 'Hawaiian heritage',          kickoff: 'I would like to understand the Hawaiian people and the kapu of this land.' },
      { specialist: 'sommelier',  label: 'Drinks for a long evening',  kickoff: 'I have a long evening on the lanai — help me think the drinks through.' },
      { specialist: 'concierge',  label: 'Quiet logistics',            kickoff: 'I need a few things lined up — a car, a snorkel for the manta dive, dinner at six.' },
    ],
    atelierPersona: 'The Atelier at Kona Village speaks to a guest who came to be in real contact with the place.',
    welcomeLine: 'Aloha. The honu are already on the reef at first light.',
  },
};

window.PROPERTY_ORDER = ['sandhill','crillon','konavillage'];


/* ─── the guest currently in residence (the active live session) ─── */
window.ACTIVE_GUEST = {
  id: 'g_daniel_park',
  name: 'Daniel Park',
  initials: 'DP',
  suite: 'The Madera Residence',
  propertyId: 'sandhill',
  arrivedFrom: 'SFO · 4:42 pm · a 5h 12m flight from JFK',
  signals: {
    hrv: 51,
    sleepHours: 5.8,
    sleepQuality: 'fragmented',
    readiness: 58,
    bodyState: 'travel-fatigued',
    nextMeeting: 'Friday 10:00 am — Series B closing call',
    hoursSinceArrival: 14,
  },
  narrative: 'Founder closing a Series B Friday. Hosting the lead\u2019s partner at Madera Thursday evening.',
};

/* ─── mock floor for the operator view ─── */
window.MOCK_GUESTS = [
  {
    id: 'g_daniel_park', name: 'Daniel Park', suite: 'The Madera Residence', suiteShort: 'Madera Residence',
    came: 'Founder closing a Series B Friday. Hosting the lead\u2019s partner Thursday.',
    bodyState: 'travel-fatigued (HRV 51, sleep 5.8h fragmented)',
    threads: [
      { title: 'Series B in motion', specialist: 'strategist', state: 'motion', private: false },
      { title: 'Thursday dinner — the room', specialist: 'convener', state: 'awaits', private: false },
    ],
    privateThreadCount: 1,
    privatePlanCount: 0,
    nextMoment: 'Thursday 7:00 pm — Madera private room',
    active: true,
  },
  {
    id: 'g_trents', name: 'Marcus & Lena Trent', suite: 'Suite 612', suiteShort: '612',
    came: 'Vow renewal at golden hour Saturday. Ten guests.',
    bodyState: 'restful',
    threads: [
      { title: 'Saturday ceremony — what holds', specialist: 'celebrant', state: 'motion', private: false },
    ],
    privateThreadCount: 0,
    privatePlanCount: 0,
    nextMoment: 'Saturday 6:00 pm — east lawn',
    active: false,
  },
  {
    id: 'g_devaraj', name: 'Aisha Devaraj', suite: 'Suite 614', suiteShort: '614',
    came: 'Board chair preparing for tomorrow\u2019s 9:00 am call.',
    bodyState: 'restful',
    threads: [
      { title: 'Tomorrow\u2019s remarks', specialist: 'convener', state: 'motion', private: false },
    ],
    privateThreadCount: 0,
    privatePlanCount: 0,
    nextMoment: 'Tomorrow 9:00 am — board call',
    active: false,
  },
  {
    id: 'g_bouchard', name: 'Henri Bouchard', suite: 'Suite 618', suiteShort: '618',
    came: 'GP at a venture fund. In residence for the week.',
    bodyState: 'travel-fatigued',
    threads: [
      { title: 'A conversation held in confidence', specialist: 'steward', state: 'motion', private: true },
      { title: 'A conversation held in confidence', specialist: 'steward', state: 'motion', private: true },
    ],
    privateThreadCount: 2,
    privatePlanCount: 0,
    nextMoment: null,
    active: false,
  },
  {
    id: 'g_mitchell', name: 'The Mitchell family', suite: 'Suite 412', suiteShort: '412',
    came: 'Family stay with two children, 8 and 11.',
    bodyState: 'family-paced',
    threads: [
      { title: 'A day for the children', specialist: 'curator', state: 'settled', private: false },
    ],
    privateThreadCount: 0,
    privatePlanCount: 0,
    nextMoment: 'Tomorrow 9:30 am — east lawn walk',
    active: false,
  },
  {
    id: 'g_voss', name: 'Sara Voss', suite: 'Suite 408', suiteShort: '408',
    came: 'Recovery stay after a hard quarter. Asaya intensive.',
    bodyState: 'recovering (HRV 72, sleep 8.1h)',
    threads: [
      { title: 'A week to put back together', specialist: 'physician', state: 'motion', private: false },
    ],
    privateThreadCount: 0,
    privatePlanCount: 0,
    nextMoment: 'Tomorrow 7:00 am — Asaya breathwork',
    active: false,
  },
  {
    id: 'g_whitfield', name: 'Robert Whitfield', suite: 'The Spruce Cottage', suiteShort: 'Spruce',
    came: 'Returning guest, fourth stay this year.',
    bodyState: 'restful',
    threads: [
      { title: 'A conversation held in confidence', specialist: 'steward', state: 'settled', private: true },
    ],
    privateThreadCount: 1,
    privatePlanCount: 0,
    nextMoment: null,
    active: false,
  },
  {
    id: 'g_tanaka', name: 'Mei Tanaka', suite: 'Suite 322', suiteShort: '322',
    came: 'Cross-Pacific arrival. Lands in two hours.',
    bodyState: 'arriving',
    threads: [],
    privateThreadCount: 0,
    privatePlanCount: 0,
    nextMoment: 'Arrives 6:30 pm — car from SFO',
    active: false,
  },
];

/* ─── seam moment canned content ─── */
window.CANNED = {
  daniel_kickoff: 'I\u2019m closing a Series B on Friday and hosting the lead\u2019s partner here Thursday. Help me think through both \u2014 the term sheet and the dinner.',

  strategist_reply: `The 2x liquidation preference is the term I would push back on first. On a Series B at your stage, 1x non-participating is market. 2x participating is the egregious end. 2x non-participating sits between them and slips through if you let it.

A clean counter: offer to bump the option pool by a point or two — that gives the lead a face-saving move on dilution while you keep the preference at 1x non-participating. Most leads will take the trade; the ones who do not are telling you something about what the partnership will feel like after Friday.

I\u2019ll have the Convener think through Thursday\u2019s dinner in parallel — the lead\u2019s partner is coming and that evening needs to land regardless of how Friday goes.`,

  convener_reply: `Four covers in Madera\u2019s private room. Thursday at 7:00 pm — late enough that everyone has landed, early enough that nobody is exhausted at 10:00 pm.

Seating: the lead\u2019s partner across from you, not beside; this gives the room a center rather than a side. Your partner to your right. The table reads as two pairs rather than a negotiation.

A ceremonial tea service through the meal. The Sommelier and I agree on the Sand Hill estate cold-brew with the second course. A small jar of Sand Hill estate honey sits at each cover — the partner takes it home to their kid and remembers the dinner without remembering the deal.`,

  convener_plan: {
    kind: 'evening',
    title: 'Lead partner dinner — Thursday',
    when: 'Thursday at 7:00 pm',
    // Computed on each load — the next Thursday at 19:00 local time. Drives the
    // progress bar's "Tonight → Reflected" transition automatically.
    get whenAt() {
      const d = new Date();
      const dow = d.getDay(); // 0=Sun..6=Sat; Thursday = 4
      const delta = (4 - dow + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      d.setHours(19, 0, 0, 0);
      return d.toISOString();
    },
    specialist: 'convener',
    where: 'Madera private room',
    who: 'You, Sarah Chen, Marc Levitt, Priya Iyer',
    detail: 'Four covers, low light, a ceremonial tea service through the meal. The kitchen holds a vegetarian primary for Priya. Sand Hill estate honey at each cover. Conversation drifts toward Friday only if the guests bring it up.',
    actions: [
      { id: 'a_room',  title: 'Book the Madera private room for 7:00 pm Thursday', rationale: 'Currently held until 6:00 pm for general seating; the room is yours from 7:00 pm.', handler: 'The Concierge' },
      { id: 'a_pairing', title: 'Confirm the tea pairing with Chef Garrison',     rationale: 'The Sommelier and chef agreed on the Sand Hill estate cold-brew with the second course; chef needs the final word by Wednesday.', handler: 'The Sommelier' },
      { id: 'a_car',  title: 'Arrange a quiet car for 10:00 pm',                   rationale: 'If conversation lingers, you\u2019ll want a car held without asking the front desk in front of the partner.', handler: 'The Concierge' },
    ],
  },

  ack: {
    a_room: 'Henri has the Madera private room arranged for 7:00 pm Thursday. He\u2019ll send the table layout once he sees Friday\u2019s signing schedule.',
    a_pairing: 'Chef Garrison has confirmed the Sand Hill estate cold-brew with the second course. The Sommelier has been told; the pairing is set.',
    a_car:  'The car is held for 10:00 pm from the Madera entrance. The driver\u2019s name will reach you on the table.',
  },
};
