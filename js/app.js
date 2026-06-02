/**
 * app.js — Simulador Hidráulico en Tiempo Real
 * Sin botones de calcular — todo se actualiza al interactuar
 * Proyecto Final Fenómenos de Transporte · U. de La Sabana 2026
 */
'use strict';

// ═══════════════════════════════════════════════════════════
//  CONSTANTES DEL SISTEMA (no modificables por el usuario)
// ═══════════════════════════════════════════════════════════
const FLUID = { rho:999.1, mu:1.138e-3, eps_pvc:1.5e-6, Patm:74660, Pvapor:1705 };
const G = 9.81;
const N_PISOS = 5, N_APTOS = 3;
const CONSUMO_CAP = 140;    // L/persona/día
const TANK_VOL   = 22680;   // L
const DZ_TOTAL   = 16.70;   // m (bomba → piso 5)
const P_REQ      = 10.0;    // m.c.a. mínimo en punto de entrega
const ETA        = 0.65;    // eficiencia bomba
const Q_DESIGN   = 2.30;    // L/s (caudal de diseño Hunter)

// Tramos hidráulicos fijos (parámetros de diseño)
const SEGS = [
  { id:'T1', D_mm:48.4,  L_m:3.0,  K:4.3  }, // Bomba → base montante
  { id:'T2', D_mm:48.4,  L_m:3.5,  K:0.5  }, // Sótano → Piso 1
  { id:'T3', D_mm:48.4,  L_m:2.8,  K:0.5  }, // P1 → P2
  { id:'T4', D_mm:38.1,  L_m:2.8,  K:1.3  }, // P2 → P3 (reducción)
  { id:'T5', D_mm:38.1,  L_m:2.8,  K:0.5  }, // P3 → P4
  { id:'T6', D_mm:38.1,  L_m:2.8,  K:1.8  }, // P4 → P5
  { id:'T7', D_mm:25.4,  L_m:8.0,  K:7.2  }, // Distribución piso sel.
  { id:'T8', D_mm:19.05, L_m:4.0,  K:3.6  }, // Ramal apartamento
  { id:'T9', D_mm:12.7,  L_m:2.0,  K:1.4  }, // Conexión punto uso
];

// Elevación de cada piso desde la bomba
const Z_PISO = f => 3.5 + (f-1)*2.8;

// Aparatos del apartamento
const FIXTURES = [
  { id:'ducha',    label:'Ducha',            Q:0.15, icon:'shower'  },
  { id:'lav1',     label:'Lavamanos baño',   Q:0.10, icon:'faucet'  },
  { id:'san1',     label:'Sanitario baño',   Q:0.10, icon:'toilet'  },
  { id:'lav2',     label:'Lavamanos social', Q:0.10, icon:'faucet'  },
  { id:'san2',     label:'Sanitario social', Q:0.10, icon:'toilet'  },
  { id:'lavapl',   label:'Cocina',           Q:0.15, icon:'kitchen' },
  { id:'lavadero', label:'Lavadero',         Q:0.20, icon:'laundry' },
];

// Escenarios de operación
const SCENARIOS = {
  valle:  { label:'Hora Valle',  pct:0.05, dur_h:5  },
  normal: { label:'Normal',      pct:0.15, dur_h:4  },
  pico:   { label:'Hora Pico',   pct:0.20, dur_h:2  },
};

// ═══════════════════════════════════════════════════════════
//  ESTADO DE LA SIMULACIÓN
// ═══════════════════════════════════════════════════════════
const sim = {
  scenario:    'normal',
  personasApto: 3,
  pisoSel:     5,
  fixtures:    Object.fromEntries(FIXTURES.map(f => [f.id, false])),
};

// ═══════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  buildBuildingSVG();
  renderFixtures();

  // Scenario buttons
  document.querySelectorAll('.scen-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sim.scenario = btn.dataset.scenario;
      document.querySelectorAll('.scen-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scheduleUpdate();
    });
  });

  // Personas slider
  const slider = document.getElementById('personas-slider');
  const sliderVal = document.getElementById('personas-val');
  slider.addEventListener('input', () => {
    sim.personasApto = +slider.value;
    sliderVal.textContent = slider.value;
    const q_daily = sim.personasApto * N_APTOS * N_PISOS * CONSUMO_CAP;
    setEl('q-daily-display', fmt0(q_daily));
    scheduleUpdate();
  });

  // Floor selector
  document.querySelectorAll('.floor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sim.pisoSel = +btn.dataset.floor;
      document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setEl('sel-floor-lbl', `Piso ${sim.pisoSel}`);
      scheduleUpdate();
    });
  });

  scheduleUpdate();
});

// ═══════════════════════════════════════════════════════════
//  LOOP DE ACTUALIZACIÓN EN TIEMPO REAL
// ═══════════════════════════════════════════════════════════
let rafId = null;
function scheduleUpdate() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(updateSim);
}

function updateSim() {
  const scen = SCENARIOS[sim.scenario];

  // Caudal diario total del edificio
  const Q_daily = sim.personasApto * N_APTOS * N_PISOS * CONSUMO_CAP; // L/día

  // Caudal de escenario (L/s)
  const Q_scen = (scen.pct * Q_daily) / (scen.dur_h * 3600);

  // Caudal de aparatos activos en el apartamento seleccionado
  const activeF = FIXTURES.filter(f => sim.fixtures[f.id]);
  const Q_apto  = activeF.reduce((s, f) => s + f.Q, 0);  // L/s, 1 apto
  const Q_floor = Q_apto * N_APTOS;                       // L/s, piso seleccionado

  // Caudal total en el sistema
  // = máximo entre caudal de escenario y aparatos activos + fondo de otros pisos
  const Q_otros = Q_scen * 4 / 5;
  const Q_total = Math.max(Q_floor + Q_otros, Math.max(Q_scen, 0.05));

  // Distribuir caudal por tramos (el ramal va decreciendo al subir)
  const Qp = Q_total / N_PISOS; // caudal por piso
  const segments = [
    { ...SEGS[0], Q_ls: Q_total },
    { ...SEGS[1], Q_ls: Q_total },
    { ...SEGS[2], Q_ls: Math.max(Q_total - Qp,       0.03) },
    { ...SEGS[3], Q_ls: Math.max(Q_total - 2*Qp,     0.03) },
    { ...SEGS[4], Q_ls: Math.max(Q_total - 3*Qp,     0.03) },
    { ...SEGS[5], Q_ls: Math.max(Q_total - 4*Qp,     0.03) },
    { ...SEGS[6], Q_ls: Math.max(Qp / N_APTOS * 2,   0.03) },
    { ...SEGS[7], Q_ls: Math.max(Q_apto || Qp/N_APTOS/2, 0.02) },
    { ...SEGS[8], Q_ls: Math.max(Q_apto || 0.05,     0.02) },
  ];

  // Análisis hidráulico completo
  const { results, totalHf, totalHm, totalH } = HydEngine.analyzePipeline(
    segments.map(s => ({ D_mm: s.D_mm, L_m: s.L_m, Q_ls: s.Q_ls, K_total: s.K })),
    FLUID
  );

  // Bomba
  const TDH = HydEngine.pumpTDH(DZ_TOTAL, totalH, P_REQ);
  const { P_hyd, P_brake, P_hp } = HydEngine.pumpPower(Q_total, FLUID.rho, TDH, ETA);
  const pump = HydEngine.selectPump(P_hp);
  const NPSH = HydEngine.npshAvailable(FLUID, 0, 0.2);

  // Presión en cada piso
  // Pérdidas acumuladas en la montante hasta alcanzar el piso f
  const cumLoss = {};
  cumLoss[1] = results[0].ht + results[1].ht;
  cumLoss[2] = cumLoss[1] + results[2].ht;
  cumLoss[3] = cumLoss[2] + results[3].ht;
  cumLoss[4] = cumLoss[3] + results[4].ht;
  cumLoss[5] = cumLoss[4] + results[5].ht;

  const pressures = {};
  for (let f = 1; f <= 5; f++) {
    pressures[f] = TDH - Z_PISO(f) - cumLoss[f];
  }

  // Nivel del tanque (reserva a Q actual)
  const Q_m3h = Q_total * 3.6; // L/s → m³/h × 1000 = L/h
  const tankHours = TANK_VOL / Math.max(Q_m3h * 1000 / 3600 * 3600, 1);
  // Usamos L/h = Q_total(L/s) × 3600
  const Lph = Q_total * 3600;
  const tankHrs = TANK_VOL / Math.max(Lph, 0.1);
  const tankPct = Math.min(1, Math.max(0, 1 - Lph / TANK_VOL));

  // Velocidad en montante (T1)
  const v_mont = results[0].v;
  const P_sel  = pressures[sim.pisoSel];

  // ── Actualizar toda la UI ──
  updateBuildingViz(results, pressures, Q_total, Q_floor, segments);
  updateMetrics(Q_total, TDH, P_hyd, P_brake, P_hp, pump, NPSH, totalHf, totalHm, totalH, P_sel, tankPct, tankHrs, activeF, Q_apto);
  updateFloorTable(results, pressures, cumLoss, segments);
}

// ═══════════════════════════════════════════════════════════
//  CONSTRUIR SVG DEL EDIFICIO (se llama una vez)
// ═══════════════════════════════════════════════════════════
function buildBuildingSVG() {
  // Geometría
  const W = 400, H = 540;
  const bL = 75, bR = 310;   // límites horizontales del edificio
  const rX = 100;             // x de la montante
  const FLOOR_H = 76;         // px por piso
  const SOT_Y = 450, SOT_H = 72;  // sótano
  const F_TOP = { 5:60, 4:136, 3:212, 2:288, 1:364 }; // top slab y de cada piso
  const F_BOT = { 5:136, 4:212, 3:288, 2:364, 1:440 };
  const bY = f => (F_TOP[f] + F_BOT[f]) / 2; // center y de cada piso

  let s = `<defs>
    <filter id="glow-cyan"><feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
    <filter id="glow-pump"><feGaussianBlur stdDeviation="5" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
    <linearGradient id="grad-water" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#0e7490"/><stop offset="100%" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>`;

  // Fondo edificio
  s += `<rect x="${bL}" y="${F_TOP[5]}" width="${bR-bL}" height="${SOT_Y+SOT_H-F_TOP[5]}" fill="#1a1d27" rx="2"/>`;

  // Pisos
  for (let f = 5; f >= 1; f--) {
    const y0 = F_TOP[f], y1 = F_BOT[f];
    // Highlight del piso seleccionado
    s += `<rect id="hl-${f}" x="${bL+1}" y="${y0+4}" width="${bR-bL-2}" height="${y1-y0-4}" fill="transparent" rx="0"/>`;
    // Losa
    s += `<rect x="${bL}" y="${y0}" width="${bR-bL}" height="5" fill="#2d333b"/>`;
    // Etiqueta piso
    const lx = bR + 14;
    s += `<text x="${lx}" y="${bY(f)-4}" fill="#6e7681" font-size="11" font-weight="600" font-family="Outfit,sans-serif">Piso ${f}</text>`;
    // Presión (actualizada por JS)
    s += `<text id="pres-${f}" x="${lx}" y="${bY(f)+10}" fill="#444c56" font-size="9" font-family="'JetBrains Mono',monospace">— m</text>`;
    // Altura entre pisos (solo entre pisos, no en P5)
    if (f < 5) {
      s += `<text x="${bL-4}" y="${y0+3}" text-anchor="end" fill="#30363d" font-size="8" font-family="Outfit,sans-serif">2.80m</text>`;
    }
  }

  // Sótano
  s += `<rect x="${bL}" y="${SOT_Y}" width="${bR-bL}" height="${SOT_H}" fill="#161b22"/>`;
  s += `<rect x="${bL}" y="${SOT_Y}" width="${bR-bL}" height="5" fill="#2d333b"/>`;
  s += `<text x="${bR+14}" y="${SOT_Y+SOT_H/2+4}" fill="#6e7681" font-size="11" font-family="Outfit,sans-serif">Sótano</text>`;
  s += `<text x="${bL-4}" y="${SOT_Y+3}" text-anchor="end" fill="#30363d" font-size="8" font-family="Outfit,sans-serif">3.50m</text>`;

  // Montante principal (tubería de fondo gris)
  const riserTop = F_TOP[5], riserBot = SOT_Y + SOT_H - 8;
  s += `<line x1="${rX}" y1="${riserTop}" x2="${rX}" y2="${riserBot}" stroke="#2d333b" stroke-width="8" stroke-linecap="round"/>`;
  // Agua animada en montante
  s += `<line id="water-riser" x1="${rX}" y1="${riserTop}" x2="${rX}" y2="${riserBot}" stroke="#22d3ee" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 5" class="water-line" opacity="0.8"/>`;

  // Derivaciones por piso
  for (let f = 5; f >= 1; f--) {
    const by = bY(f);
    const bxEnd = bR - 18;
    // Tubo fondo
    s += `<line id="pipe-branch-${f}" x1="${rX+4}" y1="${by}" x2="${bxEnd}" y2="${by}" stroke="#2d333b" stroke-width="5" stroke-linecap="round"/>`;
    // Agua animada
    s += `<line id="water-branch-${f}" x1="${rX+4}" y1="${by}" x2="${bxEnd}" y2="${by}" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 5" class="water-line water-branch" opacity="0.4"/>`;
    // Tee
    s += `<circle id="tee-${f}" cx="${rX}" cy="${by}" r="5" fill="#21262d" stroke="#22d3ee" stroke-width="1.5" opacity="0.6"/>`;
    // Indicadores de aparatos (7 puntos al final del ramal)
    const dotXStart = bR - 100;
    FIXTURES.forEach((fix, i) => {
      const dx = dotXStart + i * 12;
      s += `<circle id="fix-dot-${f}-${fix.id}" cx="${dx}" cy="${by}" r="3.5" fill="#21262d" stroke="#30363d" stroke-width="1"/>`;
    });
  }

  // Punto más desfavorable (P5, Apto 3)
  s += `<circle cx="${bR-18}" cy="${bY(5)}" r="6" fill="#f85149" opacity="0.8"/>`;
  s += `<line x1="${bR-18}" y1="${bY(5)-10}" x2="${bR-18}" y2="${bY(5)-4}" stroke="#f85149" stroke-width="1.5"/>`;

  // Tanque
  const tkX = rX + 55, tkY = SOT_Y + 8, tkW = 75, tkH = 52;
  s += `<rect x="${tkX}" y="${tkY}" width="${tkW}" height="${tkH}" fill="none" stroke="#30363d" stroke-width="1.5" rx="3"/>`;
  // Fill (actualizado por JS)
  s += `<rect id="svg-tank-fill" x="${tkX+1}" y="${tkY+tkH-2}" width="${tkW-2}" height="2" fill="url(#grad-water)" rx="2" opacity="0.85"/>`;
  s += `<text x="${tkX+tkW/2}" y="${tkY+tkH+13}" text-anchor="middle" fill="#444c56" font-size="8" font-family="Outfit,sans-serif">TANQUE</text>`;
  s += `<text id="svg-tank-pct" x="${tkX+tkW/2}" y="${tkY+tkH/2+4}" text-anchor="middle" fill="#22d3ee" font-size="10" font-weight="700" font-family="Outfit,sans-serif">—</text>`;

  // Tubería succión tanque → bomba
  const pumpX = rX, pumpY = SOT_Y + 40;
  s += `<line x1="${tkX}" y1="${pumpY}" x2="${pumpX+15}" y2="${pumpY}" stroke="#2d333b" stroke-width="4" stroke-linecap="round"/>`;
  s += `<line id="water-suction" x1="${tkX}" y1="${pumpY}" x2="${pumpX+15}" y2="${pumpY}" stroke="#22d3ee" stroke-width="2.5" stroke-dasharray="5 4" class="water-line" opacity="0.6"/>`;

  // Bomba
  s += `<circle id="pump-glow" cx="${pumpX}" cy="${pumpY}" r="18" fill="#22d3ee" class="pump-glow-anim" opacity="0.15"/>`;
  s += `<circle cx="${pumpX}" cy="${pumpY}" r="14" fill="#21262d" stroke="#22d3ee" stroke-width="1.5"/>`;
  // Impulsor giratorio
  s += `<g id="pump-impeller" style="transform-origin:${pumpX}px ${pumpY}px" class="pump-spin">
    <path d="M${pumpX-5} ${pumpY-9} Q${pumpX} ${pumpY-3} ${pumpX-9} ${pumpY+5}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
    <path d="M${pumpX+5} ${pumpY-9} Q${pumpX} ${pumpY-3} ${pumpX+9} ${pumpY+5}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
    <path d="M${pumpX-9} ${pumpY} Q${pumpX} ${pumpY+6} ${pumpX} ${pumpY+9}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
  </g>`;
  s += `<text x="${pumpX}" y="${pumpY+28}" text-anchor="middle" fill="#444c56" font-size="8" font-family="Outfit,sans-serif">BOMBA</text>`;

  // Acotación altura total
  const azX = bL - 22;
  s += `<line x1="${azX}" y1="${F_TOP[5]}" x2="${azX}" y2="${pumpY}" stroke="#30363d" stroke-width="1"/>`;
  s += `<line x1="${azX-3}" y1="${F_TOP[5]}" x2="${azX+3}" y2="${F_TOP[5]}" stroke="#30363d" stroke-width="1"/>`;
  s += `<line x1="${azX-3}" y1="${pumpY}" x2="${azX+3}" y2="${pumpY}" stroke="#30363d" stroke-width="1"/>`;
  s += `<text fill="#30363d" font-size="8" font-family="Outfit,sans-serif" text-anchor="middle" transform="rotate(-90,${azX-8},${(F_TOP[5]+pumpY)/2})">Δz = 16.70 m</text>`;

  document.getElementById('building-svg').innerHTML = s;
}

// ═══════════════════════════════════════════════════════════
//  ACTUALIZAR VISUALIZACIÓN DEL EDIFICIO
// ═══════════════════════════════════════════════════════════
function updateBuildingViz(results, pressures, Q_total, Q_floor, segments) {
  const svgEl = document.getElementById('building-svg');
  if (!svgEl) return;

  // Velocidad de animación proporcional al caudal (más Q = más rápido)
  const speed = Math.max(0.25, 1.8 - (Q_total / Q_DESIGN) * 1.4);
  svgEl.style.setProperty('--flow-spd', speed + 's');

  // Opacidad del flujo en montante
  const riserOpacity = Math.min(0.9, 0.3 + (Q_total / Q_DESIGN) * 0.6);
  const waterRiser = document.getElementById('water-riser');
  if (waterRiser) waterRiser.setAttribute('opacity', riserOpacity);

  // Highlight del piso seleccionado
  for (let f = 1; f <= 5; f++) {
    const hl = document.getElementById(`hl-${f}`);
    if (!hl) continue;
    if (f === sim.pisoSel) {
      hl.setAttribute('fill', 'rgba(34,211,238,0.07)');
      hl.setAttribute('stroke', 'rgba(34,211,238,0.2)');
      hl.setAttribute('stroke-width', '1');
    } else {
      hl.setAttribute('fill', 'transparent');
      hl.removeAttribute('stroke');
    }

    // Opacidad de derivaciones
    const wb = document.getElementById(`water-branch-${f}`);
    const branchQ = Q_total / 5;
    const bOpacity = f === sim.pisoSel
      ? Math.min(0.85, 0.4 + (Q_floor / Q_DESIGN) * 0.45)
      : Math.min(0.55, 0.2 + (branchQ / Q_DESIGN) * 0.35);
    if (wb) wb.setAttribute('opacity', bOpacity);

    // Tees
    const tee = document.getElementById(`tee-${f}`);
    if (tee) tee.setAttribute('opacity', f === sim.pisoSel ? '1' : '0.5');

    // Presión en SVG
    const presEl = document.getElementById(`pres-${f}`);
    if (presEl) {
      const p = pressures[f];
      const color = p >= 10 ? '#3fb950' : p >= 7 ? '#d29922' : '#f85149';
      presEl.textContent = p !== undefined ? p.toFixed(1) + ' m' : '—';
      presEl.setAttribute('fill', color);
    }

    // Aparatos activos en el piso seleccionado
    FIXTURES.forEach(fix => {
      const dot = document.getElementById(`fix-dot-${f}-${fix.id}`);
      if (!dot) return;
      if (f === sim.pisoSel && sim.fixtures[fix.id]) {
        dot.setAttribute('fill', '#22d3ee');
        dot.setAttribute('stroke', 'rgba(34,211,238,0.5)');
        dot.setAttribute('r', '4.5');
        dot.setAttribute('filter', 'url(#glow-cyan)');
      } else if (f === sim.pisoSel) {
        dot.setAttribute('fill', '#2d333b');
        dot.setAttribute('stroke', '#444c56');
        dot.setAttribute('r', '3.5');
        dot.removeAttribute('filter');
      } else {
        dot.setAttribute('fill', 'transparent');
        dot.setAttribute('stroke', 'transparent');
      }
    });
  }

  // Tank fill en SVG (tkY=458, tkH=52, fill height 2-50)
  const lph = Q_total * 3600;
  const tankPctSVG = Math.min(1, Math.max(0.02, 1 - lph / TANK_VOL));
  const tkFill = document.getElementById('svg-tank-fill');
  const tkPct  = document.getElementById('svg-tank-pct');
  if (tkFill) {
    const TK_TOP = 458, TK_H = 52;
    const h = Math.max(2, tankPctSVG * (TK_H - 2));
    tkFill.setAttribute('height', h);
    tkFill.setAttribute('y', TK_TOP + TK_H - h);
  }
  if (tkPct) tkPct.textContent = Math.round(tankPctSVG * 100) + '%';
}

// ═══════════════════════════════════════════════════════════
//  ACTUALIZAR PANEL DE MÉTRICAS
// ═══════════════════════════════════════════════════════════
function updateMetrics(Q_total, TDH, P_hyd, P_brake, P_hp, pump, NPSH,
                        totalHf, totalHm, totalH, P_sel, tankPct, tankHrs,
                        activeF, Q_apto) {
  // Q live
  animVal('live-q', Q_total.toFixed(3));

  // Tank
  const tBar = document.getElementById('tank-bar');
  const tLine = document.getElementById('tank-level-line');
  const pct = Math.min(100, Math.max(1, tankPct * 100));
  if (tBar) tBar.style.height = pct + '%';
  if (tLine) tLine.style.bottom = pct + '%';
  animVal('tank-pct', Math.round(pct) + '%');
  animVal('tank-vol', fmt0(Math.round(tankPct * TANK_VOL)) + ' L');
  const hrsText = tankHrs > 99 ? '> 99 horas' : tankHrs.toFixed(1) + ' horas';
  animVal('tank-hrs', hrsText + ' de reserva');

  // Pump
  animVal('pump-label', pump.label);
  animVal('tdh-val', TDH.toFixed(2));
  animVal('power-kw', (P_brake/1000).toFixed(3));
  animVal('power-hp', P_hp.toFixed(2));
  animVal('npsh-val', NPSH.toFixed(2));

  // Pressure arc gauge
  const P_MAX = 30; // m (arc full scale)
  const arcLen = 157; // stroke-dasharray total
  const arcVal = Math.min(P_sel, P_MAX);
  const dashOffset = arcLen - (arcVal / P_MAX) * arcLen;
  const arcFill = document.getElementById('pressure-arc-fill');
  if (arcFill) {
    arcFill.style.strokeDashoffset = Math.max(0, dashOffset);
    arcFill.style.stroke = P_sel >= 10 ? '#22d3ee' : P_sel >= 7 ? '#d29922' : '#f85149';
  }
  const arcValEl = document.getElementById('pressure-arc-val');
  if (arcValEl) arcValEl.textContent = P_sel !== undefined ? P_sel.toFixed(1) : '—';

  const statusEl = document.getElementById('pressure-status');
  if (statusEl) {
    if (P_sel >= 10) {
      statusEl.textContent = '✓ Presión suficiente';
      statusEl.className = 'pressure-status ok';
    } else if (P_sel >= 7) {
      statusEl.textContent = '⚠ Presión baja';
      statusEl.className = 'pressure-status warn';
    } else {
      statusEl.textContent = '✗ Presión insuficiente';
      statusEl.className = 'pressure-status bad';
    }
  }

  // Losses
  const maxLoss = Math.max(totalHf + totalHm, 0.001);
  animVal('loss-hf', totalHf.toFixed(3));
  animVal('loss-hm', totalHm.toFixed(3));
  animVal('loss-total', totalH.toFixed(3));
  const barHf = document.getElementById('loss-bar-hf');
  const barHm = document.getElementById('loss-bar-hm');
  if (barHf) barHf.style.width = (totalHf/maxLoss*100) + '%';
  if (barHm) barHm.style.width = (totalHm/maxLoss*100) + '%';

  // Active flow bar
  const afBar = document.getElementById('active-flow-bar');
  const afText = document.getElementById('active-flow-text');
  const dot = afBar?.querySelector('.flow-dot');
  if (activeF.length > 0) {
    if (afText) afText.textContent = `${activeF.length} aparato${activeF.length>1?'s':''} activo${activeF.length>1?'s':''} · ${Q_apto.toFixed(2)} L/s`;
    if (dot) dot.classList.add('active');
  } else {
    if (afText) afText.textContent = 'Ningún aparato activo';
    if (dot) dot.classList.remove('active');
  }

  // Status list
  const checks = [
    { label: `Velocidad montante: ${(Q_total/1000/(Math.PI*0.0484**2/4)).toFixed(3)} m/s`, ok: true, warn: false },
    { label: `Presión piso 5: ${P_sel>=10?'suficiente (≥10 m)':P_sel.toFixed(1)+' m < 10 m req.'}`, ok: P_sel>=10, warn: P_sel>=7&&P_sel<10 },
    { label: `NPSH disponible: ${NPSH.toFixed(2)} m ${NPSH>=3?'(seguro)':'(riesgo cavitación)'}`, ok: NPSH>=3, warn: false },
    { label: `TDH: ${TDH.toFixed(2)} m ${TDH<=30?'· rango normal':'· verificar bomba'}`, ok: TDH<=30, warn: TDH>30&&TDH<=35 },
    { label: `Tanque: ${hrsText} de autonomía`, ok: tankHrs>=3, warn: tankHrs>=1&&tankHrs<3 },
  ];
  const statusList = document.getElementById('status-list');
  if (statusList) {
    statusList.innerHTML = checks.map(c => {
      const cls = c.ok ? 'ok' : c.warn ? 'warn' : 'bad';
      const icon = c.ok ? '✓' : c.warn ? '⚠' : '✗';
      return `<div class="status-item ${cls}"><span class="status-icon">${icon}</span>${c.label}</div>`;
    }).join('');
  }
}

// ═══════════════════════════════════════════════════════════
//  TABLA COMPARATIVA POR PISO
// ═══════════════════════════════════════════════════════════
function updateFloorTable(results, pressures, cumLoss, segments) {
  const tbody = document.getElementById('floor-tbody');
  if (!tbody) return;
  const v_mont = results[0].v; // velocidad en montante

  tbody.innerHTML = [5,4,3,2,1].map(f => {
    const p = pressures[f];
    const loss = cumLoss[f];
    const qRamal = (segments[Math.max(0, f-1)]?.Q_ls || 0);
    const cls = f === sim.pisoSel ? ' class="selected-row"' : '';
    const badge = p >= 10
      ? '<span class="badge-ok">✓ OK</span>'
      : p >= 7
      ? '<span class="badge-warn">⚠ Baja</span>'
      : '<span class="badge-bad">✗ Insuf.</span>';
    return `<tr${cls}>
      <td>Piso ${f}${f===sim.pisoSel?' ◀':''}</td>
      <td>${Z_PISO(f).toFixed(2)}</td>
      <td>${qRamal.toFixed(3)}</td>
      <td>${v_mont.toFixed(3)}</td>
      <td>${loss.toFixed(4)}</td>
      <td>${p.toFixed(2)}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  RENDERIZAR APARATOS
// ═══════════════════════════════════════════════════════════
const FIXTURE_ICONS = {
  shower: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M4 4l2 2"/><path d="M4.93 4.93 A7 7 0 0 1 17 17"/><path d="M12 3 A9 9 0 0 1 21 12"/>
    <line x1="9" y1="17" x2="9" y2="20"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="15" y1="17" x2="15" y2="20"/>
    <path d="M5 17h14"/>
  </svg>`,
  faucet: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M5 13h10a3 3 0 0 0 3-3V9a1 1 0 0 0-1-1h-1V6a3 3 0 0 0-6 0v2H8a1 1 0 0 0-1 1v1a3 3 0 0 0-3 3v3"/>
    <path d="M5 16v2a2 2 0 0 0 2 2h2"/>
  </svg>`,
  toilet: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M7 3h10v4H7z"/><path d="M7 7c0 6 10 6 10 0"/><path d="M10 7v3"/><path d="M14 7v3"/>
    <path d="M8 17c0 2 8 2 8 0l-1-7H9z"/>
  </svg>`,
  kitchen: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <rect x="3" y="10" width="18" height="9" rx="2"/>
    <path d="M12 4v6"/><path d="M10 4a2 2 0 0 1 4 0"/>
    <circle cx="12" cy="14" r="2"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`,
  laundry: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <circle cx="12" cy="13" r="4"/>
    <line x1="8" y1="7" x2="10" y2="7"/>
    <circle cx="14" cy="7" r="0.5" fill="currentColor"/>
    <path d="M10 13 A2 2 0 0 1 14 13"/>
  </svg>`,
};

function renderFixtures() {
  const grid = document.getElementById('fixture-grid');
  if (!grid) return;
  grid.innerHTML = FIXTURES.map(fix => `
    <div class="fixture-card" id="fcard-${fix.id}" onclick="toggleFixture('${fix.id}')">
      <div class="fixture-icon">${FIXTURE_ICONS[fix.icon] || FIXTURE_ICONS.faucet}</div>
      <div class="fixture-name">${fix.label}</div>
      <div class="fixture-q">${fix.Q.toFixed(2)} L/s</div>
      <div class="fixture-status" id="fstatus-${fix.id}">Cerrado</div>
    </div>
  `).join('');
}

function toggleFixture(id) {
  sim.fixtures[id] = !sim.fixtures[id];
  const card = document.getElementById(`fcard-${id}`);
  const status = document.getElementById(`fstatus-${id}`);
  if (card) card.classList.toggle('active', sim.fixtures[id]);
  if (status) status.textContent = sim.fixtures[id] ? 'Abierto' : 'Cerrado';
  scheduleUpdate();
}

// ═══════════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════════
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function animVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.textContent !== val) {
    el.textContent = val;
    el.classList.remove('val-update');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('val-update');
  }
}

function fmt0(n) {
  return Math.round(n).toLocaleString('es-CO');
}
