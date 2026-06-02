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

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function fmtCOP(n) {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

// ═══════════════════════════════════════════════════════════
//  VIEW SWITCHER
// ═══════════════════════════════════════════════════════════
function switchView(v) {
  const simEl  = document.getElementById('view-sim');
  const calcEl = document.getElementById('view-calc');
  const tSim   = document.getElementById('vtab-sim');
  const tCalc  = document.getElementById('vtab-calc');
  if (v === 'calc') {
    simEl.style.display = 'none'; calcEl.style.display = 'block';
    tSim.classList.remove('active'); tCalc.classList.add('active');
    document.body.classList.add('view-calc-active');
    document.body.style.overflow = 'hidden';
    initCalcView();
  } else {
    calcEl.style.display = 'none'; simEl.style.display = 'block';
    tCalc.classList.remove('active'); tSim.classList.add('active');
    document.body.classList.remove('view-calc-active');
    document.body.style.overflow = 'hidden';
  }
}

// ═══════════════════════════════════════════════════════════
//  VISTA ANÁLISIS: DATOS POR DEFECTO
// ═══════════════════════════════════════════════════════════
const CALC_SEGS = [
  { id:'T1', desc:'Bomba → base montante',         D_mm:48.4,  L_m:3.0,  Q_ls:2.30,  K:4.3  },
  { id:'T2', desc:'Montante: sótano → P1',         D_mm:48.4,  L_m:3.5,  Q_ls:2.30,  K:0.5  },
  { id:'T3', desc:'Montante: P1 → P2',             D_mm:48.4,  L_m:2.8,  Q_ls:1.84,  K:0.5  },
  { id:'T4', desc:'Montante: P2 → P3 (reducción)', D_mm:38.1,  L_m:2.8,  Q_ls:1.38,  K:1.3  },
  { id:'T5', desc:'Montante: P3 → P4',             D_mm:38.1,  L_m:2.8,  Q_ls:0.92,  K:0.5  },
  { id:'T6', desc:'Montante: P4 → P5',             D_mm:38.1,  L_m:2.8,  Q_ls:0.46,  K:1.8  },
  { id:'T7', desc:'Distribución piso 5 → Apto 3',  D_mm:25.4,  L_m:8.0,  Q_ls:0.153, K:7.2  },
  { id:'T8', desc:'Ramal apto → baño privado',     D_mm:19.05, L_m:4.0,  Q_ls:0.15,  K:3.6  },
  { id:'T9', desc:'Conexión punto (ducha)',         D_mm:12.7,  L_m:2.0,  Q_ls:0.15,  K:1.4  },
];
const CALC_HOURLY = [
  { label:'Madrugada',      horas:'00–05', dur:5,  pct:0.05, tipo:'Valle' },
  { label:'Pico mañana',    horas:'05–07', dur:2,  pct:0.20, tipo:'Pico'  },
  { label:'Mañana',         horas:'07–11', dur:4,  pct:0.15, tipo:'Normal'},
  { label:'Pico mediodía',  horas:'11–14', dur:3,  pct:0.20, tipo:'Pico'  },
  { label:'Tarde',          horas:'14–19', dur:5,  pct:0.10, tipo:'Normal'},
  { label:'Pico noche',     horas:'19–21', dur:2,  pct:0.20, tipo:'Pico'  },
  { label:'Noche',          horas:'21–24', dur:3,  pct:0.10, tipo:'Valle' },
];
const CALC_PRICES = [
  { item:'Tubería PVC ½"',         unit:'m',   price:4500,     qty:210  },
  { item:'Tubería PVC ¾"',         unit:'m',   price:6200,     qty:60   },
  { item:'Tubería PVC 1"',         unit:'m',   price:9800,     qty:120  },
  { item:'Tubería PVC 1½"',        unit:'m',   price:18500,    qty:8.4  },
  { item:'Tubería PVC 2"',         unit:'m',   price:28000,    qty:9.3  },
  { item:'Codo 90° ½"',            unit:'u',   price:1200,     qty:105  },
  { item:'Codo 90° ¾"',            unit:'u',   price:1800,     qty:30   },
  { item:'Codo 90° 1"',            unit:'u',   price:3500,     qty:45   },
  { item:'Codo 90° 1½"',           unit:'u',   price:6000,     qty:4    },
  { item:'Codo 90° 2"',            unit:'u',   price:9500,     qty:2    },
  { item:'Tee 1"',                 unit:'u',   price:4200,     qty:30   },
  { item:'Tee 1½"',                unit:'u',   price:7500,     qty:4    },
  { item:'Tee 2"',                 unit:'u',   price:12000,    qty:3    },
  { item:'Válvula compuerta 2"',   unit:'u',   price:45000,    qty:1    },
  { item:'Válvula check 2"',       unit:'u',   price:85000,    qty:1    },
  { item:'Válvula de paso ½"',     unit:'u',   price:12000,    qty:15   },
  { item:'Reducción 2"→1½"',       unit:'u',   price:8500,     qty:1    },
  { item:'Tanque 23 m³',           unit:'u',   price:12500000, qty:1    },
  { item:'Mano de obra / punto',   unit:'pto', price:65000,    qty:105  },
];

let calcInitialized = false;
const calcState = { hyd1: null, hyd2: null, hyd3: null, hyd4: null };

function initCalcView() {
  if (calcInitialized) return;
  calcInitialized = true;

  // Segments table
  document.getElementById('c-segs-body').innerHTML = CALC_SEGS.map((s, i) =>
    `<tr>
      <td><strong>${s.id}</strong></td>
      <td style="font-size:11px;color:var(--text-3)">${s.desc}</td>
      <td><input type="number" data-cs="${i}" data-cf="D_mm" value="${s.D_mm}" step="0.1" style="width:66px"></td>
      <td><input type="number" data-cs="${i}" data-cf="L_m"  value="${s.L_m}"  step="0.1" style="width:58px"></td>
      <td><input type="number" data-cs="${i}" data-cf="Q_ls" value="${s.Q_ls}" step="0.001" style="width:64px"></td>
      <td><input type="number" data-cs="${i}" data-cf="K"    value="${s.K}"    step="0.1" style="width:58px"></td>
    </tr>`
  ).join('');

  // Hourly table
  const hourlyBody = document.getElementById('c-hourly-body');
  if (hourlyBody) {
    hourlyBody.innerHTML = CALC_HOURLY.map((h, i) =>
      `<tr>
        <td><strong>${h.label}</strong></td>
        <td style="color:var(--text-3)">${h.horas}</td>
        <td><input type="number" data-ch="${i}" data-chf="dur" value="${h.dur}" step="0.5" style="width:55px"></td>
        <td><input type="number" data-ch="${i}" data-chf="pct" value="${h.pct}" step="0.01" style="width:60px" oninput="updateCalcHourlyBadge()"></td>
        <td><span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${h.tipo==='Pico'?'var(--cyan-dim)':'var(--surface-3)'};color:${h.tipo==='Pico'?'var(--cyan)':'var(--text-3)'}">${h.tipo}</span></td>
      </tr>`
    ).join('');
  }

  // Prices table
  document.getElementById('c-prices-body').innerHTML = CALC_PRICES.map((p, i) =>
    `<tr>
      <td>${p.item}</td>
      <td style="color:var(--text-3)">${p.unit}</td>
      <td><input type="number" data-cp="${i}" data-cpf="price" value="${p.price}" step="500" style="width:110px"></td>
      <td><input type="number" data-cp="${i}" data-cpf="qty"   value="${p.qty}"   step="0.1" style="width:75px"></td>
    </tr>`
  ).join('');
}

function updateCalcHourlyBadge() {
  let sum = 0;
  CALC_HOURLY.forEach((_, i) => {
    const el = document.querySelector(`[data-ch="${i}"][data-chf="pct"]`);
    if (el) sum += parseFloat(el.value) || 0;
  });
  const badge = document.getElementById('c-pct-badge');
  if (!badge) return;
  const ok = Math.abs(sum - 1.0) < 0.001;
  badge.textContent = `Σ = ${(sum*100).toFixed(1)}%`;
  badge.className = 'cpct-badge ' + (ok ? 'cpct-ok' : 'cpct-bad');
}

function toggleCalcCard(header, bodyId) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  header.classList.toggle('open', isOpen);
  header.querySelector('.calc-chev').textContent = isOpen ? '▲' : '▼';
}

// ── Readers ─────────────────────────────────────────────────
function readCalcSegs() {
  return CALC_SEGS.map((s, i) => ({
    D_mm:    parseFloat(document.querySelector(`[data-cs="${i}"][data-cf="D_mm"]`)?.value) || s.D_mm,
    L_m:     parseFloat(document.querySelector(`[data-cs="${i}"][data-cf="L_m"]`)?.value)  || s.L_m,
    Q_ls:    parseFloat(document.querySelector(`[data-cs="${i}"][data-cf="Q_ls"]`)?.value) || s.Q_ls,
    K_total: parseFloat(document.querySelector(`[data-cs="${i}"][data-cf="K"]`)?.value)    || s.K,
  }));
}
function readCalcHourly() {
  return CALC_HOURLY.map((h, i) => ({
    ...h,
    dur: parseFloat(document.querySelector(`[data-ch="${i}"][data-chf="dur"]`)?.value) || h.dur,
    pct: parseFloat(document.querySelector(`[data-ch="${i}"][data-chf="pct"]`)?.value),
  }));
}
function readCalcPrices() {
  return CALC_PRICES.map((p, i) => ({
    ...p,
    price: parseFloat(document.querySelector(`[data-cp="${i}"][data-cpf="price"]`)?.value) || p.price,
    qty:   parseFloat(document.querySelector(`[data-cp="${i}"][data-cpf="qty"]`)?.value)   || p.qty,
  }));
}
function readCalcFluid() {
  return {
    rho:     parseFloat(document.getElementById('c-rho')?.value) || 999.1,
    mu:      parseFloat(document.getElementById('c-mu')?.value)  || 1.138e-3,
    eps_pvc: parseFloat(document.getElementById('c-eps')?.value) || 1.5e-6,
    Patm:74660, Pvapor:1705,
  };
}

// ═══════════════════════════════════════════════════════════
//  EJECUTAR TODO
// ═══════════════════════════════════════════════════════════
function runAllCalc() {
  runHyd1Calc(); runHyd2Calc(); runHyd3Calc(); runHyd4Calc();
}

// ═══════════════════════════════════════════════════════════
//  HYD-1 CALC
// ═══════════════════════════════════════════════════════════
function runHyd1Calc() {
  const fluid = readCalcFluid();
  const segs  = readCalcSegs();
  const Q_design = parseFloat(document.getElementById('c-qd')?.value) || 2.30;
  const { results, totalHf, totalHm, totalH } = HydEngine.analyzePipeline(segs, fluid);
  calcState.hyd1 = { results, totalHf, totalHm, totalH, Q_design, fluid, segs };

  // Auto-fill HYD-2
  const lEl = document.getElementById('c-losses');
  if (lEl) lEl.value = totalH.toFixed(4);

  // Results table
  const alerts = [];
  let tbl = `<table class="calc-table"><thead><tr>
    <th>Tramo</th><th>Q (L/s)</th><th>v (m/s)</th><th>Re</th><th>Régimen</th>
    <th>f</th><th>hf (m)</th><th>ΣK</th><th>hm (m)</th><th>h_total (m)</th><th>Estado</th>
  </tr></thead><tbody>`;
  results.forEach((r, i) => {
    const s = segs[i];
    const vc = r.velWarn==='low'?'ct-warn-low':r.velWarn==='high'?'ct-warn-high':'ct-ok';
    const icon = r.velWarn==='low'?'⚠ v baja':r.velWarn==='high'?'✗ v alta':'✓';
    if (r.velWarn==='low')  alerts.push(`⚠ T${i+1}: velocidad baja (${r.v.toFixed(3)} m/s < 0.5) — aceptable en ramal terminal.`);
    if (r.velWarn==='high') alerts.push(`✗ T${i+1}: velocidad excede NTC 1500 (${r.v.toFixed(3)} m/s > 2.5) — aumente diámetro.`);
    tbl += `<tr>
      <td><strong>${CALC_SEGS[i].id}</strong></td>
      <td>${s.Q_ls.toFixed(3)}</td>
      <td class="${vc}">${r.v.toFixed(3)}</td>
      <td>${Math.round(r.Re).toLocaleString()}</td>
      <td style="font-size:11px;color:var(--text-3)">${r.regime}</td>
      <td class="ct-mono">${r.f.toFixed(5)}</td>
      <td>${r.hf.toFixed(4)}</td>
      <td>${s.K_total.toFixed(1)}</td>
      <td>${r.hm.toFixed(4)}</td>
      <td><strong>${r.ht.toFixed(4)}</strong></td>
      <td class="${vc}" style="font-size:10px">${icon}</td>
    </tr>`;
  });
  tbl += `</tbody><tfoot><tr>
    <td colspan="6">Σ Pérdidas totales</td>
    <td>${totalHf.toFixed(4)}</td><td>—</td>
    <td>${totalHm.toFixed(4)}</td>
    <td><strong>${totalH.toFixed(4)}</strong></td><td></td>
  </tr></tfoot></table>`;
  document.getElementById('c-hyd1-tbl').innerHTML = tbl;

  const alertsEl = document.getElementById('c-hyd1-alerts');
  if (alertsEl) {
    alertsEl.innerHTML = alerts.map(a => `<div class="calc-alert ${a.startsWith('✗')?'calc-alert-danger':'calc-alert-warn'}">${a}</div>`).join('')
      + (alerts.length===0 ? '<div class="calc-alert calc-alert-success">✓ Todas las velocidades dentro del rango NTC 1500 (0.5–2.5 m/s)</div>' : '');
  }

  // Charts
  const startH = calcState.hyd2 ? calcState.hyd2.TDH : (totalH + 16.70 + 10.0);
  document.getElementById('c-hyd1-bars').innerHTML = cSvgBarChart(
    results.map((r, i) => ({ label: CALC_SEGS[i].id, v1: r.hf, v2: r.hm, total: r.ht })),
    { color1:'#388bfd', color2:'#d29922', label1:'Fricción (hf)', label2:'Menores (hm)' }
  );
  document.getElementById('c-hyd1-grad').innerHTML = cSvgGradientLine(results, segs, startH);

  document.getElementById('c-hyd1-out').style.display = 'block';
  setCalcStatus('hyd1', 'Calculado');
  showToast('HYD-1 — pérdidas: ' + totalH.toFixed(3) + ' m');
}

// ═══════════════════════════════════════════════════════════
//  HYD-2 CALC
// ═══════════════════════════════════════════════════════════
function runHyd2Calc() {
  const dz    = parseFloat(document.getElementById('c-dz')?.value)    || 16.70;
  const pReq  = parseFloat(document.getElementById('c-preq')?.value)  || 10.0;
  const eta   = parseFloat(document.getElementById('c-eta')?.value)   || 0.65;
  const dzs   = parseFloat(document.getElementById('c-dzs')?.value)   || 0;
  const hfs   = parseFloat(document.getElementById('c-hfs')?.value)   || 0.20;
  const losses= parseFloat(document.getElementById('c-losses')?.value)|| (calcState.hyd1?.totalH || 0);
  const Q_ls  = calcState.hyd1?.Q_design || 2.30;
  const fluid = readCalcFluid();

  const TDH   = HydEngine.pumpTDH(dz, losses, pReq);
  const { P_hyd, P_brake, P_hp } = HydEngine.pumpPower(Q_ls, fluid.rho, TDH, eta);
  const NPSH  = HydEngine.npshAvailable(fluid, dzs, hfs);
  const pump  = HydEngine.selectPump(P_hp);
  calcState.hyd2 = { TDH, P_hyd, P_brake, P_hp, pump, eta, NPSH, dz, pReq, losses, Q_ls };

  // Auto-fill HYD-3
  const tdh3 = document.getElementById('c-tdh');
  if (tdh3) tdh3.value = TDH.toFixed(3);
  const ph = document.getElementById('c-pumphp');
  if (ph) ph.value = pump.hp;

  // KPIs
  const kpis = [
    { lbl:'TDH', val: TDH.toFixed(2),             unit:'m c.a.',   cls:'c-teal'  },
    { lbl:'P. hidráulica', val:(P_hyd/1000).toFixed(3), unit:'kW', cls:'c-blue'  },
    { lbl:'P. al freno',   val:(P_brake/1000).toFixed(3),unit:`kW · ${P_hp.toFixed(2)} HP`, cls:'c-amber' },
    { lbl:'Bomba',         val: pump.label,         unit:'centrífuga',cls:'c-green'},
    { lbl:'NPSH disp.',    val: NPSH.toFixed(2),    unit:'m',        cls: NPSH<3?'c-amber':'c-green' },
    { lbl:'Eficiencia η',  val:(eta*100).toFixed(0),unit:'%',        cls:'c-blue'  },
  ];
  document.getElementById('c-hyd2-kpis').innerHTML = kpis.map(k =>
    `<div class="calc-kpi ${k.cls}">
      <div class="calc-kpi-lbl">${k.lbl}</div>
      <div class="calc-kpi-val">${k.val}</div>
      <div class="calc-kpi-unit">${k.unit}</div>
    </div>`
  ).join('');

  // Alerts
  const aEl = document.getElementById('c-hyd2-alerts');
  if (aEl) aEl.innerHTML = [
    NPSH<3 ? '<div class="calc-alert calc-alert-danger">⚠ NPSH disponible < 3 m — riesgo de cavitación.</div>' : '',
    TDH>30 ? '<div class="calc-alert calc-alert-warn">TDH > 30 m — considere bomba multietapa.</div>' : '',
    `<div class="calc-alert calc-alert-success">✓ Bomba ${pump.label} centrífuga suficiente para Piso 5.</div>`,
  ].join('');

  // Donut
  const slices = calcState.hyd1
    ? [
        { label:'Altura estática', value:dz,                     color:'#164e63' },
        { label:'Pérd. fricción',  value:calcState.hyd1.totalHf, color:'#388bfd' },
        { label:'Pérd. menores',   value:calcState.hyd1.totalHm, color:'#d29922' },
        { label:'Presión req.',    value:pReq,                    color:'#0d9488' },
      ]
    : [
        { label:'Altura estática', value:dz,     color:'#164e63' },
        { label:'Pérd. totales',   value:losses,  color:'#388bfd' },
        { label:'Presión req.',    value:pReq,    color:'#0d9488' },
      ];
  document.getElementById('c-hyd2-donut').innerHTML = cSvgDonut(slices, TDH, 200, 200);

  // Pump card
  document.getElementById('c-hyd2-pump').innerHTML = `
    <div class="calc-pump-card">
      <div class="cpc-label">Bomba recomendada</div>
      <div class="cpc-hp">${pump.label}</div>
      <div class="cpc-sub">Centrífuga monoetapa</div>
      <div class="cpc-row">TDH = <strong>${TDH.toFixed(2)} m</strong></div>
      <div class="cpc-row">Q = <strong>${Q_ls.toFixed(3)} L/s</strong></div>
      <div class="cpc-row">P freno = <strong>${(P_brake/1000).toFixed(3)} kW · ${P_hp.toFixed(2)} HP</strong></div>
      <div class="cpc-row">NPSH disp. = <strong>${NPSH.toFixed(2)} m</strong></div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.2);font-size:12px;opacity:.8">
        Precio ref. = <strong>${fmtCOP(pump.cost)} COP</strong>
      </div>
    </div>`;

  document.getElementById('c-hyd2-out').style.display = 'block';
  setCalcStatus('hyd2', 'Calculado');

  // Refresh HYD-1 gradient with correct TDH
  if (calcState.hyd1) {
    document.getElementById('c-hyd1-grad').innerHTML = cSvgGradientLine(calcState.hyd1.results, calcState.hyd1.segs, TDH);
  }
  showToast('HYD-2 — TDH: ' + TDH.toFixed(2) + ' m · Bomba: ' + pump.label);
}

// ═══════════════════════════════════════════════════════════
//  HYD-3 CALC
// ═══════════════════════════════════════════════════════════
function runHyd3Calc() {
  const TDH    = parseFloat(document.getElementById('c-tdh')?.value)   || (calcState.hyd2?.TDH || 28.4);
  const Qdaily = parseFloat(document.getElementById('c-qdaily')?.value) || 6300;
  const Pmin   = parseFloat(document.getElementById('c-pmin')?.value)  || 10.0;
  const Qref   = calcState.hyd1?.Q_design || 2.30;
  const href   = calcState.hyd1?.totalH   || 1.68;
  const dz     = calcState.hyd2?.dz       || 16.70;
  const hourly = readCalcHourly();

  const rows = hourly.map(h => {
    const Q = HydEngine.hourlyQ(h.pct, Qdaily, h.dur);
    const losses = HydEngine.scaleLosses(href, Q, Qref);
    const v_mont = Q / 1000 / (Math.PI * 0.0484 * 0.0484 / 4);
    const P5 = HydEngine.pressureAtTop(TDH, dz, losses);
    return { ...h, Q, losses, v_mont, P5, ok: P5 >= Pmin };
  });
  calcState.hyd3 = { rows };

  document.getElementById('c-hyd3-chart').innerHTML = cSvgComboChart(rows, Pmin);

  let tbl = `<table class="calc-table"><thead><tr>
    <th>Franja</th><th>Horas</th><th>Q (L/s)</th><th>v montante (m/s)</th>
    <th>Pérdidas (m)</th><th>P piso 5 (m)</th><th>Estado</th>
  </tr></thead><tbody>`;
  rows.forEach(r => {
    const ok = r.ok ? 'ct-ok' : 'ct-warn-high';
    tbl += `<tr>
      <td><strong>${r.label}</strong></td>
      <td>${r.horas}</td>
      <td>${r.Q.toFixed(3)}</td>
      <td>${r.v_mont.toFixed(3)}</td>
      <td>${r.losses.toFixed(4)}</td>
      <td class="${ok}">${r.P5.toFixed(3)}</td>
      <td class="${ok}">${r.ok?'✓ OK':'✗ Insuficiente'}</td>
    </tr>`;
  });
  tbl += '</tbody></table>';
  document.getElementById('c-hyd3-tbl').innerHTML = tbl;

  document.getElementById('c-hyd3-out').style.display = 'block';
  setCalcStatus('hyd3', 'Calculado');
  showToast('HYD-3 — ' + rows.filter(r=>r.ok).length + '/7 franjas con presión suficiente');
}

// ═══════════════════════════════════════════════════════════
//  HYD-4 CALC
// ═══════════════════════════════════════════════════════════
function runHyd4Calc() {
  const prices  = readCalcPrices();
  const pumpHP  = parseFloat(document.getElementById('c-pumphp')?.value) || (calcState.hyd2?.pump.hp || 1.5);
  const nPoints = parseFloat(document.getElementById('c-points')?.value) || 105;
  const pump    = HydEngine.selectPump(pumpHP);

  const breakdown = prices.map(p => ({
    ...p, subtotal: p.item.includes('Mano') ? p.price * nPoints : p.price * p.qty
  }));
  // Update pump item
  let pumpLine = breakdown.find(b => b.item.toLowerCase().includes('bomba'));
  if (!pumpLine) breakdown.push({ item:`Bomba ${pump.label}`, unit:'u', price:pump.cost, qty:1, subtotal:pump.cost });
  else { pumpLine.subtotal = pump.cost; pumpLine.item = `Bomba ${pump.label} centrífuga`; pumpLine.price = pump.cost; }

  const total = breakdown.reduce((s,b) => s + b.subtotal, 0);
  const perApto = total / 15;
  calcState.hyd4 = { breakdown, total, perApto };

  // Table
  let tbl = `<table class="calc-table"><thead><tr>
    <th>Ítem</th><th>Und.</th><th>Precio unit. (COP)</th><th>Cant.</th><th>Subtotal (COP)</th><th>%</th>
  </tr></thead><tbody>`;
  breakdown.forEach(b => {
    tbl += `<tr>
      <td>${b.item}</td>
      <td style="color:var(--text-3)">${b.unit}</td>
      <td class="ct-mono">${fmtCOP(b.price)}</td>
      <td>${b.qty}</td>
      <td class="ct-mono"><strong>${fmtCOP(b.subtotal)}</strong></td>
      <td style="color:var(--text-3)">${((b.subtotal/total)*100).toFixed(1)}%</td>
    </tr>`;
  });
  tbl += `</tbody><tfoot><tr>
    <td colspan="4"><strong>TOTAL</strong></td>
    <td class="ct-mono"><strong>${fmtCOP(total)}</strong></td><td></td>
  </tr></tfoot></table>`;
  document.getElementById('c-hyd4-tbl').innerHTML = tbl;

  // Donut
  const palette = ['#164e63','#0e7490','#388bfd','#3fb950','#d29922'];
  const groups = [
    { label:'Tuberías',     total: breakdown.filter(b=>b.item.startsWith('Tubería')).reduce((s,b)=>s+b.subtotal,0) },
    { label:'Accesorios',   total: breakdown.filter(b=>['Codo','Tee','Válvula','Reducción'].some(k=>b.item.startsWith(k))).reduce((s,b)=>s+b.subtotal,0) },
    { label:'Bomba',        total: breakdown.filter(b=>b.item.toLowerCase().includes('bomba')).reduce((s,b)=>s+b.subtotal,0) },
    { label:'Tanque',       total: breakdown.filter(b=>b.item.includes('Tanque')).reduce((s,b)=>s+b.subtotal,0) },
    { label:'Mano de obra', total: breakdown.filter(b=>b.item.includes('Mano')).reduce((s,b)=>s+b.subtotal,0) },
  ].filter(g=>g.total>0);
  document.getElementById('c-hyd4-donut').innerHTML = cSvgDonut(groups.map((g,i)=>({label:g.label,value:g.total,color:palette[i%palette.length]})), total, 200, 200, true);

  // Total cards
  document.getElementById('c-hyd4-totals').innerHTML = `
    <div class="calc-cost-card total">
      <div class="ccc-lbl">Costo total del sistema</div>
      <div class="ccc-val">${fmtCOP(total)}</div>
      <div class="ccc-sub">COP (pesos colombianos)</div>
    </div>
    <div class="calc-cost-card per">
      <div class="ccc-lbl">Costo por apartamento</div>
      <div class="ccc-val">${fmtCOP(Math.round(perApto))}</div>
      <div class="ccc-sub">15 apartamentos · 5 pisos</div>
    </div>`;

  document.getElementById('c-hyd4-out').style.display = 'block';
  setCalcStatus('hyd4', 'Calculado');
  showToast('HYD-4 — Total: ' + fmtCOP(total) + ' COP');
}

// ═══════════════════════════════════════════════════════════
//  EXPORTAR (vista análisis)
// ═══════════════════════════════════════════════════════════
function doCalcExport() {
  const now = new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});
  const lines = [
    '=== RESULTADOS DEL ANÁLISIS HIDRÁULICO ===',
    'Proyecto: Sistema Hidráulico — Edificio Residencial 5 Pisos, Bogotá D.C.',
    `Fecha: ${now}`,
    'Autores: M.A. Casas · L.F. Lasso · I.D. Lora · N. Valencia',
    'Universidad de La Sabana — Ing. Química — Fenómenos de Transporte 2026','',
  ];
  if (calcState.hyd1) {
    const { results, totalHf, totalHm, totalH } = calcState.hyd1;
    lines.push('── PÉRDIDAS POR TRAMO (HYD-1) ──────────────────────────────────────');
    lines.push('Tramo  | Q (L/s) | v (m/s) |   Re    |   f      | hf (m)  | ΣK  | hm (m)  | h_total');
    lines.push('-'.repeat(85));
    results.forEach((r,i) => {
      const s = CALC_SEGS[i];
      lines.push(`${s.id.padEnd(6)} | ${CALC_SEGS[i].Q_ls.toFixed(3).padStart(7)} | ${r.v.toFixed(3).padStart(7)} | ${Math.round(r.Re).toLocaleString().padStart(7)} | ${r.f.toFixed(5)} | ${r.hf.toFixed(4).padStart(7)} | ${s.K.toFixed(1).padStart(3)} | ${r.hm.toFixed(4).padStart(7)} | ${r.ht.toFixed(4)}`);
    });
    lines.push('-'.repeat(85));
    lines.push(`${'TOTAL'.padEnd(6)} |         |         |         |          | ${totalHf.toFixed(4).padStart(7)} |     | ${totalHm.toFixed(4).padStart(7)} | ${totalH.toFixed(4)}`,'');
  }
  if (calcState.hyd2) {
    const h = calcState.hyd2;
    lines.push('── DIMENSIONAMIENTO DE BOMBA (HYD-2) ───────────────────────────────');
    lines.push(`Altura estática Δz          = ${h.dz.toFixed(2)} m`);
    lines.push(`Pérdidas totales del sistema = ${h.losses.toFixed(4)} m`);
    lines.push(`Presión requerida piso 5     = ${h.pReq.toFixed(2)} m`);
    lines.push(`TDH (Cabeza Dinámica Total)  = ${h.TDH.toFixed(3)} m`);
    lines.push(`Potencia hidráulica          = ${(h.P_hyd/1000).toFixed(3)} kW`);
    lines.push(`Potencia al freno (η=${h.eta})  = ${(h.P_brake/1000).toFixed(3)} kW (${h.P_hp.toFixed(3)} HP)`);
    lines.push(`Bomba seleccionada           = ${h.pump.label} centrífuga`);
    lines.push(`NPSH disponible              = ${h.NPSH.toFixed(3)} m`,'');
  }
  if (calcState.hyd3) {
    lines.push('── SIMULACIÓN HORARIA (HYD-3) ──────────────────────────────────────');
    calcState.hyd3.rows.forEach(r => {
      lines.push(`${r.label.padEnd(17)} | ${r.horas.padEnd(5)} | Q=${r.Q.toFixed(3)} L/s | P5=${r.P5.toFixed(2)} m | ${r.ok?'✓ OK':'✗'}`);
    });
    lines.push('');
  }
  if (calcState.hyd4) {
    lines.push('── ESTIMACIÓN DE COSTOS (HYD-4) ────────────────────────────────────');
    lines.push(`TOTAL: ${fmtCOP(calcState.hyd4.total)} COP`);
    lines.push(`Por apartamento: ${fmtCOP(Math.round(calcState.hyd4.perApto))} COP`,'');
  }
  lines.push('─'.repeat(70));
  lines.push('Generado con Simulador Hidráulico — github.com/ismavid/hydraulic-building-simulator');

  const text = lines.join('\n');
  const ta = document.getElementById('c-export-text');
  if (ta) ta.value = text;
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast('✓ Copiado al portapapeles'));
  else showToast('Copia manualmente del área de texto');
}

function setCalcStatus(key, txt) {
  const el = document.getElementById(`cst-${key}`);
  if (el) { el.textContent = txt; el.classList.add('done'); }
}

// ═══════════════════════════════════════════════════════════
//  SVG HELPERS (Vista Análisis)
// ═══════════════════════════════════════════════════════════
function cSvgBarChart(data, opts) {
  const W=680,H=240,mg={top:20,right:20,bottom:48,left:50};
  const w=W-mg.left-mg.right,h=H-mg.top-mg.bottom;
  const maxV = Math.max(...data.map(d=>d.total))*1.15||1;
  const gap=w/data.length,bw=gap*0.7;
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px"><g transform="translate(${mg.left},${mg.top})">`;
  for(let i=0;i<=4;i++){const yy=h-(i/4)*h;s+=`<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#2d333b" stroke-width="1"/><text x="-4" y="${yy+4}" text-anchor="end" font-size="9" fill="#6e7681">${(maxV*i/4).toFixed(3)}</text>`;}
  data.forEach((d,i)=>{
    const x=i*gap+gap*.15;
    const h1=(d.v1/maxV)*h,h2=(d.v2/maxV)*h;
    s+=`<rect x="${x}" y="${h-h1-h2}" width="${bw*.48}" height="${h1+h2}" fill="${opts.color1}" rx="2" opacity=".85"/>`;
    s+=`<rect x="${x+bw*.52}" y="${h-h2}" width="${bw*.48}" height="${h2}" fill="${opts.color2}" rx="2" opacity=".85"/>`;
    s+=`<text x="${x+bw*.5}" y="${h+14}" text-anchor="middle" font-size="10" font-weight="600" fill="#8b949e">${d.label}</text>`;
    if(d.total>0.001)s+=`<text x="${x+bw*.5}" y="${h-h1-h2-4}" text-anchor="middle" font-size="8" fill="#8b949e">${d.total.toFixed(3)}</text>`;
  });
  s+=`<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#444c56" stroke-width="1.5"/>
  <line x1="0" y1="0" x2="0" y2="${h}" stroke="#444c56" stroke-width="1.5"/>
  <text transform="rotate(-90)" x="${-h/2}" y="-38" text-anchor="middle" font-size="10" fill="#6e7681">Pérdida (m)</text>
  <rect x="${w-150}" y="-16" width="10" height="10" fill="${opts.color1}" rx="2"/>
  <text x="${w-136}" y="-7" font-size="9" fill="#8b949e">${opts.label1}</text>
  <rect x="${w-70}" y="-16" width="10" height="10" fill="${opts.color2}" rx="2"/>
  <text x="${w-56}" y="-7" font-size="9" fill="#8b949e">${opts.label2}</text>`;
  s+='</g></svg>';
  return s;
}

function cSvgGradientLine(results, segs, startH) {
  const W=640,H=200,mg={top:20,right:30,bottom:40,left:50};
  const w=W-mg.left-mg.right,h=H-mg.top-mg.bottom;
  let cumDist=0,cumLoss=0;
  const maxDist=segs.reduce((s,seg)=>s+seg.L_m,0)||1;
  const maxP=startH*1.1||1;
  const pts=[{x:0,y:startH}];
  results.forEach((r,i)=>{cumDist+=segs[i].L_m;cumLoss+=r.ht;pts.push({x:cumDist,y:startH-cumLoss});});
  const px=d=>(d.x/maxDist)*w,py=d=>h-(Math.max(0,d.y)/maxP)*h;
  const path='M '+pts.map(p=>`${px(p)},${py(p)}`).join(' L ');
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px"><g transform="translate(${mg.left},${mg.top})">`;
  for(let i=0;i<=4;i++){const yy=(i/4)*h;s+=`<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#2d333b" stroke-width="1"/><text x="-4" y="${yy+4}" text-anchor="end" font-size="9" fill="#6e7681">${(maxP*(1-i/4)).toFixed(1)}</text>`;}
  const ymin=h-(10/maxP)*h;
  s+=`<line x1="0" y1="${ymin}" x2="${w}" y2="${ymin}" stroke="#f85149" stroke-width="1.5" stroke-dasharray="5,3"/><text x="${w+2}" y="${ymin+4}" font-size="8" fill="#f85149">10m</text>`;
  s+=`<path d="${path}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round"/>`;
  pts.forEach(p=>{s+=`<circle cx="${px(p)}" cy="${py(p)}" r="3.5" fill="#22d3ee" stroke="#0d1117" stroke-width="1.5"/>`;});
  s+=`<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#444c56" stroke-width="1.5"/><line x1="0" y1="0" x2="0" y2="${h}" stroke="#444c56" stroke-width="1.5"/>`;
  s+=`<text x="${w/2}" y="${h+30}" text-anchor="middle" font-size="10" fill="#6e7681">Distancia acumulada desde bomba (m)</text>`;
  s+=`<text transform="rotate(-90)" x="${-h/2}" y="-38" text-anchor="middle" font-size="10" fill="#6e7681">Presión disponible (m)</text>`;
  s+='</g></svg>';
  return s;
}

function cSvgDonut(slices, total, W, H, isCost=false) {
  const cx=W/2,cy=H/2-10,R=Math.min(W,H)*.30,r=R*.55;
  const tv=slices.reduce((s,sl)=>s+sl.value,0)||1;
  let angle=-Math.PI/2,paths='',legs='';
  slices.forEach((sl,i)=>{
    const a=(sl.value/tv)*2*Math.PI;
    const x1=cx+R*Math.cos(angle),y1=cy+R*Math.sin(angle);
    const x2=cx+R*Math.cos(angle+a),y2=cy+R*Math.sin(angle+a);
    const xi1=cx+r*Math.cos(angle),yi1=cy+r*Math.sin(angle);
    const xi2=cx+r*Math.cos(angle+a),yi2=cy+r*Math.sin(angle+a);
    const lg=a>Math.PI?1:0;
    paths+=`<path d="M${xi1},${yi1} L${x1},${y1} A${R},${R} 0 ${lg} 1 ${x2},${y2} L${xi2},${yi2} A${r},${r} 0 ${lg} 0 ${xi1},${yi1} Z" fill="${sl.color}" opacity=".9"><title>${sl.label}: ${((sl.value/tv)*100).toFixed(1)}%</title></path>`;
    const ly=16+i*18;
    legs+=`<rect x="${W-108}" y="${ly-10}" width="10" height="10" fill="${sl.color}" rx="2"/><text x="${W-94}" y="${ly}" font-size="9" fill="#8b949e">${sl.label} (${((sl.value/tv)*100).toFixed(0)}%)</text>`;
    angle+=a;
  });
  const label = isCost ? fmtCOP(typeof total==='number'?total:0) : (typeof total==='number'?total.toFixed(2):total);
  return `<svg viewBox="0 0 ${W} ${H+40}" style="width:100%;max-width:${W}px">${paths}
    <text x="${cx}" y="${cy}" text-anchor="middle" font-size="${isCost?11:18}" font-weight="700" fill="#e6edf3">${label}</text>
    <text x="${cx}" y="${cy+16}" text-anchor="middle" font-size="9" fill="#6e7681">${isCost?'COP':'m c.a.'}</text>
    ${legs}</svg>`;
}

function cSvgComboChart(rows, Pmin) {
  const W=660,H=240,mg={top:24,right:55,bottom:56,left:50};
  const w=W-mg.left-mg.right,h=H-mg.top-mg.bottom;
  const maxQ=Math.max(...rows.map(r=>r.Q))*1.3||1;
  const minP=Math.min(...rows.map(r=>r.P5))*0.85;
  const maxP=Math.max(...rows.map(r=>r.P5))*1.15||1;
  const bw=(w/rows.length)*0.6,gap=w/rows.length;
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px"><g transform="translate(${mg.left},${mg.top})">`;
  rows.forEach((r,i)=>{
    const bh=(r.Q/maxQ)*h,x=i*gap+gap*.2;
    const color=r.tipo==='Pico'?'#164e63':r.tipo==='Normal'?'#22d3ee':'#a8d4f5';
    s+=`<rect x="${x}" y="${h-bh}" width="${bw}" height="${bh}" fill="${color}" rx="2" opacity=".8"><title>${r.label}: ${r.Q.toFixed(3)} L/s</title></rect>`;
    s+=`<text x="${x+bw/2}" y="${h+14}" text-anchor="middle" font-size="8" fill="#6e7681" transform="rotate(-30,${x+bw/2},${h+14})">${r.horas}</text>`;
  });
  const pS=v=>h-((v-minP)/(maxP-minP))*h;
  const pts=rows.map((r,i)=>`${i*gap+gap*.5},${pS(r.P5)}`).join(' ');
  s+=`<polyline points="${pts}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round"/>`;
  rows.forEach((r,i)=>{s+=`<circle cx="${i*gap+gap*.5}" cy="${pS(r.P5)}" r="3.5" fill="${r.ok?'#22d3ee':'#f85149'}" stroke="#0d1117" stroke-width="1.5"><title>${r.label}: P=${r.P5.toFixed(2)} m</title></circle>`;});
  const ypm=pS(Pmin);
  s+=`<line x1="0" y1="${ypm}" x2="${w}" y2="${ypm}" stroke="#f85149" stroke-width="1.5" stroke-dasharray="5,3"/><text x="${w+3}" y="${ypm+4}" font-size="8" fill="#f85149">${Pmin}m</text>`;
  for(let i=0;i<=3;i++){const yy=h-(i/3)*h;s+=`<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#2d333b"/><text x="-4" y="${yy+4}" text-anchor="end" font-size="8" fill="#6e7681">${(maxQ*i/3).toFixed(2)}</text>`;}
  for(let i=0;i<=3;i++){const yy=h-(i/3)*h;const pv=minP+(maxP-minP)*i/3;s+=`<text x="${w+3}" y="${yy+4}" font-size="8" fill="#0e7490">${pv.toFixed(1)}</text>`;}
  s+=`<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#444c56" stroke-width="1.5"/><line x1="0" y1="0" x2="0" y2="${h}" stroke="#444c56" stroke-width="1.5"/>`;
  s+=`<text transform="rotate(-90)" x="${-h/2}" y="-38" text-anchor="middle" font-size="9" fill="#8b949e">Caudal (L/s)</text>`;
  s+=`<text transform="rotate(90)" x="${h/2}" y="${-w-40}" text-anchor="middle" font-size="9" fill="#0e7490">Presión piso 5 (m)</text>`;
  s+=`<rect x="0" y="-18" width="10" height="10" fill="#164e63" rx="1"/><text x="14" y="-9" font-size="8" fill="#8b949e">Q pico</text>
  <rect x="55" y="-18" width="10" height="10" fill="#22d3ee" rx="1"/><text x="69" y="-9" font-size="8" fill="#8b949e">Q normal</text>
  <line x1="108" y1="-13" x2="124" y2="-13" stroke="#22d3ee" stroke-width="2"/><text x="128" y="-9" font-size="8" fill="#0e7490">P piso 5</text>`;
  s+='</g></svg>';
  return s;
}
