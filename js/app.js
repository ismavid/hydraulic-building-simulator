/**
 * app.js — Simulador Hidráulico UI (SCADA Dark Mode Sobrio Refinado)
 * Proyecto Final Fenómenos de Transporte — U. de La Sabana, 2026
 */
'use strict';

// ══════════════════════════════════════════════════════════════
//  DEFAULT DATA
// ══════════════════════════════════════════════════════════════

const DEFAULT_SEGMENTS = [
  { id:'T1', desc:'Bomba -> base montante',         D_mm:48.4,  L_m:3.0,  Q_ls:2.30, K_total:4.3  },
  { id:'T2', desc:'Montante: sotano -> P1',         D_mm:48.4,  L_m:3.5,  Q_ls:2.30, K_total:0.5  },
  { id:'T3', desc:'Montante: P1 -> P2',             D_mm:48.4,  L_m:2.8,  Q_ls:1.84, K_total:0.5  },
  { id:'T4', desc:'Montante: P2 -> P3 (reduccion)', D_mm:38.1,  L_m:2.8,  Q_ls:1.38, K_total:1.3  },
  { id:'T5', desc:'Montante: P3 -> P4',             D_mm:38.1,  L_m:2.8,  Q_ls:0.92, K_total:0.5  },
  { id:'T6', desc:'Montante: P4 -> P5',             D_mm:38.1,  L_m:2.8,  Q_ls:0.46, K_total:1.8  },
  { id:'T7', desc:'Distribucion piso 5 -> Apto 3',  D_mm:25.4,  L_m:8.0,  Q_ls:0.153, K_total:7.2  },
  { id:'T8', desc:'Ramal apto -> baño privado',     D_mm:19.05, L_m:4.0,  Q_ls:0.15, K_total:3.6  },
  { id:'T9', desc:'Conexion punto (ducha)',         D_mm:12.7,  L_m:2.0,  Q_ls:0.15, K_total:1.4  },
];

const DEFAULT_HOURLY = [
  { label:'Madrugada',      horas:'00-05', dur:5,  pct:0.05,  tipo:'Valle' },
  { label:'Pico mañana',    horas:'05-07', dur:2,  pct:0.20,  tipo:'Pico'  },
  { label:'Mañana',         horas:'07-11', dur:4,  pct:0.15,  tipo:'Normal'},
  { label:'Pico mediodía',  horas:'11-14', dur:3,  pct:0.20,  tipo:'Pico'  },
  { label:'Tarde',          horas:'14-19', dur:5,  pct:0.10,  tipo:'Normal'},
  { label:'Pico noche',     horas:'19-21', dur:2,  pct:0.20,  tipo:'Pico'  },
  { label:'Noche',          horas:'21-24', dur:3,  pct:0.10,  tipo:'Valle' },
];

const DEFAULT_PRICES = [
  { item:'Tubería PVC 1/2"',        unit:'m',  price:4500,    qty:210 },
  { item:'Tubería PVC 3/4"',        unit:'m',  price:6200,    qty:60  },
  { item:'Tubería PVC 1"',         unit:'m',  price:9800,    qty:120 },
  { item:'Tubería PVC 1 1/2"',     unit:'m',  price:18500,   qty:8.4 },
  { item:'Tubería PVC 2"',         unit:'m',  price:28000,   qty:9.3 },
  { item:'Codo 90° 1/2"',          unit:'u',  price:1200,    qty:105 },
  { item:'Codo 90° 3/4"',          unit:'u',  price:1800,    qty:30  },
  { item:'Codo 90° 1"',            unit:'u',  price:3500,    qty:45  },
  { item:'Codo 90° 1 1/2"',        unit:'u',  price:6000,    qty:4   },
  { item:'Codo 90° 2"',            unit:'u',  price:9500,    qty:2   },
  { item:'Tee 1"',                 unit:'u',  price:4200,    qty:30  },
  { item:'Tee 1 1/2"',             unit:'u',  price:7500,    qty:4   },
  { item:'Tee 2"',                 unit:'u',  price:12000,   qty:3   },
  { item:'Válvula compuerta 2"',   unit:'u',  price:45000,   qty:1   },
  { item:'Válvula check 2"',       unit:'u',  price:85000,   qty:1   },
  { item:'Válvula de paso 1/2"',   unit:'u',  price:12000,   qty:15  },
  { item:'Reducción 2"->1 1/2"',   unit:'u',  price:8500,    qty:1   },
  { item:'Tanque 23 m³',           unit:'u',  price:12500000,qty:1   },
  { item:'Mano de obra / punto',   unit:'pto',price:65000,   qty:105 },
];

// ══════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════
const state = {
  hyd1: null,   // { results, totalHf, totalHm, totalH, Q_design, fluid }
  hyd2: null,   // { TDH, P_hyd, P_hp, NPSH, pump, eta }
  hyd3: null,   // { rows[] }
  hyd4: null,   // { breakdown[], total, perApto }
};

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  renderBuildingSummary();
  renderSegmentsTable();
  renderHourlyTable();
  renderPricesTable();

  // Building schematic SVG
  const schEl = document.getElementById('building-schematic');
  if (schEl) schEl.innerHTML = svgBuildingSchematic();

  // Hourly badge — live update on input
  updateHourlyBadge();
  document.getElementById('hourly-body')?.addEventListener('input', updateHourlyBadge);
});

// Tab Switcher for Planos
window.switchTab = function(tabId) {
  // Hide all tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.style.display = 'none';
  });
  
  // Show active pane
  const activePane = document.getElementById(tabId);
  if (activePane) {
    activePane.style.display = (tabId === 'tab-esquema') ? 'block' : 'flex';
  }

  // Toggle active class on tab buttons
  document.querySelectorAll('.blueprint-tab').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const activeBtn = document.getElementById('btn-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }
  
  showToast(`Vista: ${tabId === 'tab-general' ? 'Plano General' : tabId === 'tab-planta' ? 'Planta por Piso' : 'Esquema de Red'}`);
};

// ── Hover highlight connection between Table and SVG ──────────────────
window.highlightSeg = function(id) {
  const groupEl = document.getElementById(`svg-seg-group-${id}`);
  if (groupEl) {
    groupEl.classList.add('svg-highlight-active');
  }
  const rows = document.querySelectorAll('#segments-body tr');
  rows.forEach(row => {
    if (row.cells[0].textContent.trim() === id) {
      row.style.background = 'rgba(6, 182, 212, 0.15)';
    }
  });
};

window.unhighlightSeg = function(id) {
  const groupEl = document.getElementById(`svg-seg-group-${id}`);
  if (groupEl) {
    groupEl.classList.remove('svg-highlight-active');
  }
  const rows = document.querySelectorAll('#segments-body tr');
  rows.forEach(row => {
    if (row.cells[0].textContent.trim() === id) {
      row.style.background = '';
    }
  });
};

function renderBuildingSummary() {
  const items = [
    { label:'Pisos', value:'5', unit:'' },
    { label:'Aptos / piso', value:'3', unit:'' },
    { label:'Personas / apto', value:'3', unit:'' },
    { label:'Población total', value:'45', unit:'hab' },
    { label:'Consumo total', value:'6,300', unit:'L/día' },
    { label:'Capacidad tanque', value:'22,680', unit:'L' },
    { label:'Caudal diseño', value:'2.30', unit:'L/s (225 UH)' },
    { label:'Alt. estática', value:'16.70', unit:'m' },
    { label:'Altura Bogotá', value:'2,640', unit:'m.s.n.m.' },
    { label:'P. atm. Bogotá', value:'74.66', unit:'kPa' },
    { label:'T° agua', value:'15°C', unit:'ρ=999.1 kg/m³' },
    { label:'Material tubería', value:'PVC', unit:'ε=1.5×10⁻⁶ m' },
  ];
  document.getElementById('building-summary').innerHTML = items.map(i =>
    `<div class="summary-item">
      <div class="label">${i.label}</div>
      <div class="value">${i.value}</div>
      <div class="unit">${i.unit}</div>
    </div>`
  ).join('');
}

function renderSegmentsTable() {
  document.getElementById('segments-body').innerHTML = DEFAULT_SEGMENTS.map((s, idx) =>
    `<tr onmouseenter="window.highlightSeg('${s.id}')" onmouseleave="window.unhighlightSeg('${s.id}')" style="cursor: pointer;">
      <td><strong>${s.id}</strong></td>
      <td style="max-width:220px;font-size:12px;color:var(--gray-500)">${s.desc}</td>
      <td><input type="number" data-seg="${idx}" data-field="D_mm" value="${s.D_mm}" step="0.1" style="width:70px"></td>
      <td><input type="number" data-seg="${idx}" data-field="L_m"  value="${s.L_m}"  step="0.1" style="width:60px"></td>
      <td><input type="number" data-seg="${idx}" data-field="Q_ls" value="${s.Q_ls}" step="0.01" style="width:60px"></td>
      <td><input type="number" data-seg="${idx}" data-field="K_total" value="${s.K_total}" step="0.1" style="width:60px"></td>
    </tr>`
  ).join('');
}

function renderHourlyTable() {
  document.getElementById('hourly-body').innerHTML = DEFAULT_HOURLY.map((h, idx) =>
    `<tr>
      <td><strong>${h.label}</strong></td>
      <td style="color:var(--gray-500)">${h.horas}</td>
      <td><input type="number" data-hour="${idx}" data-field="dur" value="${h.dur}" step="0.5" style="width:55px"></td>
      <td><input type="number" data-hour="${idx}" data-field="pct" value="${h.pct}" step="0.01" min="0" max="1" style="width:65px"></td>
      <td><span class="badge ${h.tipo==='Pico'?'badge-blue':'badge-teal'}" style="font-size:10px">${h.tipo}</span></td>
    </tr>`
  ).join('');
}

function renderPricesTable() {
  document.getElementById('prices-body').innerHTML = DEFAULT_PRICES.map((p, idx) =>
    `<tr>
      <td>${p.item}</td>
      <td style="color:var(--gray-500)">${p.unit}</td>
      <td><input type="number" data-price="${idx}" data-field="price" value="${p.price}" step="500" style="width:110px"></td>
      <td><input type="number" data-price="${idx}" data-field="qty"   value="${p.qty}"  step="0.1" style="width:80px"></td>
    </tr>`
  ).join('');
}

// ══════════════════════════════════════════════════════════════
//  HELPERS — read table inputs
// ══════════════════════════════════════════════════════════════
function readSegments() {
  return DEFAULT_SEGMENTS.map((s, idx) => ({
    ...s,
    D_mm:    parseFloat(document.querySelector(`[data-seg="${idx}"][data-field="D_mm"]`).value)   || s.D_mm,
    L_m:     parseFloat(document.querySelector(`[data-seg="${idx}"][data-field="L_m"]`).value)    || s.L_m,
    Q_ls:    parseFloat(document.querySelector(`[data-seg="${idx}"][data-field="Q_ls"]`).value)   || s.Q_ls,
    K_total: parseFloat(document.querySelector(`[data-seg="${idx}"][data-field="K_total"]`).value)|| s.K_total,
  }));
}

function readHourly() {
  return DEFAULT_HOURLY.map((h, idx) => ({
    ...h,
    dur: parseFloat(document.querySelector(`[data-hour="${idx}"][data-field="dur"]`).value) || h.dur,
    pct: parseFloat(document.querySelector(`[data-hour="${idx}"][data-field="pct"]`).value),
  }));
}

function readPrices() {
  return DEFAULT_PRICES.map((p, idx) => ({
    ...p,
    price: parseFloat(document.querySelector(`[data-price="${idx}"][data-field="price"]`).value) || p.price,
    qty:   parseFloat(document.querySelector(`[data-price="${idx}"][data-field="qty"]`).value)   || p.qty,
  }));
}

function readFluid() {
  return {
    rho:    parseFloat(document.getElementById('f-rho').value)  || 999.1,
    mu:     parseFloat(document.getElementById('f-mu').value)   || 1.138e-3,
    eps_pvc:parseFloat(document.getElementById('f-eps').value)  || 1.5e-6,
    Patm:   74660,
    Pvapor: 1705,
  };
}

// ══════════════════════════════════════════════════════════════
//  TOGGLE CARD
// ══════════════════════════════════════════════════════════════
function toggleCard(header) {
  const card = header.closest('.card');
  const id   = card.id;
  const bodyId = 'body-' + (id === 'card-export' ? 'export' : id.replace('card-',''));
  const body = document.getElementById(bodyId);
  const btn  = header.querySelector('.card-toggle');
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  header.classList.toggle('open', isOpen);
  if (btn) btn.textContent = isOpen ? 'Colapsar' : 'Expandir';
}

// ══════════════════════════════════════════════════════════════
//  HYD-1: PÉRDIDAS HIDRÁULICAS
// ══════════════════════════════════════════════════════════════
function runHyd1() {
  const fluid    = readFluid();
  const segments = readSegments();
  const Q_design = parseFloat(document.getElementById('q-design').value) || 2.30;

  const { results, totalHf, totalHm, totalH } = HydEngine.analyzePipeline(segments, fluid);
  state.hyd1 = { results, totalHf, totalHm, totalH, Q_design, fluid };

  // Auto-fill HYD-2 losses input
  document.getElementById('p-losses').value = totalH.toFixed(4);

  // ── Results table ──
  const alerts = [];
  let tableHtml = `<table class="results-table">
    <thead><tr>
      <th>Tramo</th><th>Q (L/s)</th><th>v (m/s)</th><th>Re</th><th>Régimen</th>
      <th>f</th><th>hf (m)</th><th>ΣK</th><th>hm (m)</th><th>h_total (m)</th><th>Estado</th>
    </tr></thead><tbody>`;

  results.forEach((r, i) => {
    const seg = segments[i];
    const vClass = r.velWarn === 'low' ? 'warn-low' : r.velWarn === 'high' ? 'warn-high' : 'ok';
    const statusIcon = r.velWarn === 'low' ? 'v baja' : r.velWarn === 'high' ? 'v alta' : 'OK';
    if (r.velWarn === 'low')  alerts.push(`Advertencia: velocidad baja en ${seg.id} (${r.v.toFixed(3)} m/s < 0.5 m/s) — aceptable en ramales de baja demanda.`);
    if (r.velWarn === 'high') alerts.push(`Alarma: velocidad excede NTC 1500 en ${seg.id} (${r.v.toFixed(3)} m/s > 2.5 m/s) — aumente diámetro.`);
    tableHtml += `<tr>
      <td><strong>${seg.id}</strong></td>
      <td>${seg.Q_ls.toFixed(3)}</td>
      <td class="${vClass}">${r.v.toFixed(3)}</td>
      <td>${Math.round(r.Re).toLocaleString()}</td>
      <td style="font-size:11px;color:var(--gray-500)">${r.regime}</td>
      <td style="font-family:var(--font-mono);color:var(--cyan-400)">${r.f.toFixed(5)}</td>
      <td>${r.hf.toFixed(4)}</td>
      <td>${seg.K_total.toFixed(1)}</td>
      <td>${r.hm.toFixed(4)}</td>
      <td><strong>${r.ht.toFixed(4)}</strong></td>
      <td class="${vClass}" style="font-size:11px">${statusIcon}</td>
    </tr>`;
  });
  tableHtml += `</tbody><tfoot><tr>
    <td colspan="6">Pérdidas totales</td>
    <td>${totalHf.toFixed(4)}</td><td>—</td>
    <td>${totalHm.toFixed(4)}</td>
    <td style="color:var(--cyan-400)"><strong>${totalH.toFixed(4)}</strong></td><td></td>
  </tr></tfoot></table>`;
  document.getElementById('hyd1-results-wrap').innerHTML = tableHtml;

  // ── Alerts ──
  document.getElementById('hyd1-alerts').innerHTML = [
    ...alerts.map(a => `<div class="alert ${a.startsWith('Alarma')?'alert-error':'alert-warn'}">${a}</div>`),
    alerts.length === 0 ? '<div class="alert alert-success">Todas las velocidades dentro del rango NTC 1500 (0.5-2.5 m/s)</div>' : '',
  ].join('');

  // ── Bar chart ──
  document.getElementById('hyd1-chart-bars').innerHTML = svgBarChart(
    results.map((r, i) => ({
      label: segments[i].id,
      v1: r.hf, v2: r.hm,
      total: r.ht,
    })),
    { label1:'Fricción (hf)', label2:'Accesorios (hm)', color1:'#06b6d4', color2:'#f59e0b', width:700, height:260 }
  );

  // ── Gradient line ──
  const startHead = state.hyd2 ? state.hyd2.TDH : (totalH + 16.70 + 10.0);
  document.getElementById('hyd1-chart-gradient').innerHTML = svgGradientLine(results, segments, startHead);

  document.getElementById('hyd1-output').style.display = 'block';
  document.getElementById('card-hyd1').classList.add('card-active');
  showToast('HYD-1 calculado — pérdidas totales: ' + totalH.toFixed(3) + ' m');
}

// ══════════════════════════════════════════════════════════════
//  HYD-2: BOMBA
// ══════════════════════════════════════════════════════════════
function runHyd2() {
  const dz      = parseFloat(document.getElementById('p-dz').value)      || 16.70;
  const pReq    = parseFloat(document.getElementById('p-req').value)     || 10.0;
  const eta     = parseFloat(document.getElementById('p-eta').value)     || 0.65;
  const dzSucc  = parseFloat(document.getElementById('p-dz-succ').value) || 0;
  const hfSucc  = parseFloat(document.getElementById('p-hf-succ').value) || 0.20;
  const losses  = parseFloat(document.getElementById('p-losses').value)  || (state.hyd1 ? state.hyd1.totalH : 0);
  const Q_ls    = state.hyd1 ? state.hyd1.Q_design : parseFloat(document.getElementById('q-design').value) || 2.30;
  const fluid   = readFluid();

  const TDH   = HydEngine.pumpTDH(dz, losses, pReq);
  const { P_hyd, P_brake, P_hp } = HydEngine.pumpPower(Q_ls, fluid.rho, TDH, eta);
  const NPSH  = HydEngine.npshAvailable(fluid, dzSucc, hfSucc);
  const pump  = HydEngine.selectPump(P_hp);

  state.hyd2 = { TDH, P_hyd, P_hp, P_hp_req: P_hp, pump, eta, NPSH, dz, pReq, losses, Q_ls };

  // Auto-fill HYD-3
  document.getElementById('h3-tdh').value = TDH.toFixed(3);
  document.getElementById('h4-pump-hp').value = pump.hp;

  // ── KPIs ──
  document.getElementById('hyd2-kpis').innerHTML = [
    { label:'TDH (Cabeza total)', value: TDH.toFixed(2), unit:'m c.a.', cls:'kpi-blue' },
    { label:'P. hidráulica', value: (P_hyd/1000).toFixed(3), unit:'kW', cls:'kpi-teal' },
    { label:'Potencia Freno', value: P_hp.toFixed(3), unit:'HP requeridos', cls:'kpi-orange' },
    { label:'Bomba comercial', value: pump.label, unit:'centrífuga', cls:'kpi-green' },
    { label:'NPSH disponible', value: NPSH.toFixed(2), unit:'m (Bogotá)', cls: NPSH < 3 ? 'kpi-red' : 'kpi-green' },
    { label:'Eficiencia', value: (eta*100).toFixed(0), unit:'%', cls:'kpi-blue' },
  ].map(k => `<div class="kpi-card ${k.cls}">
    <div class="kpi-label">${k.label}</div>
    <div class="kpi-value">${k.value}</div>
    <div class="kpi-unit">${k.unit}</div>
  </div>`).join('');

  // ── Alerts ──
  const alertsHtml = [
    NPSH < 3 ? '<div class="alert alert-error">NPSH disponible < 3 m — riesgo latente de cavitación. Revisar instalación de succión.</div>' : '',
    TDH > 30 ? '<div class="alert alert-warn">TDH > 30 m — verificar viabilidad de selección multietapa comercial.</div>' : '',
    '<div class="alert alert-success">La bomba comercial de ' + pump.label + ' es suficiente para abastecer el Piso 5.</div>',
  ].join('');
  document.getElementById('hyd2-alerts').innerHTML = alertsHtml;

  // ── Donut chart ──
  const slices = state.hyd1
    ? [
        { label:'Alt. estática', value: dz,                  color:'#0c2340' },
        { label:'Pérd. fricción',  value: state.hyd1.totalHf,  color:'#06b6d4' },
        { label:'Pérd. menores',   value: state.hyd1.totalHm,  color:'#3b82f6' },
        { label:'Presión req.',    value: pReq,                 color:'#0d9488' },
      ]
    : [
        { label:'Alt. estática', value: dz,     color:'#0c2340' },
        { label:'Pérd. totales',   value: losses,  color:'#06b6d4' },
        { label:'Presión req.',    value: pReq,    color:'#0d9488' },
      ];
  const donutNote = state.hyd1 ? '' : '<div class="alert alert-info" style="margin-top:8px;font-size:12px">Ejecute HYD-1 para ver desglose de fricción vs pérdidas menores.</div>';
  document.getElementById('hyd2-chart-donut').innerHTML = svgDonut(slices, TDH, 220, 220) + donutNote;

  // ── Pump card ──
  document.getElementById('hyd2-pump-card').innerHTML = `
    <div style="background: linear-gradient(135deg, #0f172a, #0b0f19); color:white; border-radius:var(--r-lg); border:1px solid var(--border-glow); box-shadow: var(--shadow-glow); padding:20px">
      <div style="font-size:9.5px; opacity:.7; text-transform:uppercase; letter-spacing:1px; color:var(--cyan-400); margin-bottom:8px">Especificación Comercial</div>
      <div style="font-family:var(--font-title); font-size:30px; font-weight:700; letter-spacing:-1px">${pump.label}</div>
      <div style="font-size:12.5px; opacity:.8; margin-top:2px">Bomba Centrífuga Pedrollo o similar</div>
      <div style="margin-top:16px; display:flex; flex-direction:column; gap:6px; font-size:12.5px; font-family:var(--font-mono)">
        <div>TDH = <span style="color:var(--white); font-weight:600">${TDH.toFixed(2)} m</span></div>
        <div>Q max = <span style="color:var(--cyan-400); font-weight:600">${Q_ls.toFixed(3)} L/s</span></div>
        <div>P freno = <span style="color:var(--orange-400); font-weight:600">${P_hp.toFixed(3)} HP</span></div>
        <div>NPSH disp. = <span style="color:var(--green-400); font-weight:600">${NPSH.toFixed(2)} m</span></div>
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-subtle); font-family:var(--font-sans)">
          Precio ref. = <span style="color:var(--white); font-weight:600">${fmt(pump.cost)} COP</span>
        </div>
      </div>
    </div>`;

  document.getElementById('hyd2-output').style.display = 'block';
  document.getElementById('card-hyd2').classList.add('card-active');
  showToast('HYD-2 calculado — TDH: ' + TDH.toFixed(2) + ' m, Bomba comercial: ' + pump.label);
}

// ══════════════════════════════════════════════════════════════
//  HYD-3: SIMULACIÓN HORARIA + VÁLVULAS
// ══════════════════════════════════════════════════════════════
function runHyd3() {
  const TDH    = parseFloat(document.getElementById('h3-tdh').value) || (state.hyd2 ? state.hyd2.TDH : 30);
  const Qdaily = parseFloat(document.getElementById('h3-qdaily').value) || 6300;
  const Pmin   = parseFloat(document.getElementById('h3-pmin').value) || 10.0;
  const Qref   = state.hyd1 ? state.hyd1.Q_design : 2.30;
  const href   = state.hyd1 ? state.hyd1.totalH : 8.0;
  const dz     = state.hyd2 ? state.hyd2.dz : 16.70;
  const hourly = readHourly();

  const rows = hourly.map(h => {
    const Q = HydEngine.hourlyQ(h.pct, Qdaily, h.dur);
    const losses = HydEngine.scaleLosses(href, Q, Qref);
    const v_mont = Q / 1000 / (Math.PI * 0.0484 * 0.0484 / 4);
    const P5 = HydEngine.pressureAtTop(TDH, dz, losses);
    return { ...h, Q, losses, v_mont, P5, ok: P5 >= Pmin };
  });
  state.hyd3 = { rows, TDH, Pmin, dz, Qref, href };

  // ── Combo chart ──
  document.getElementById('hyd3-chart').innerHTML = svgComboChart(rows, Pmin);

  // ── Table ──
  let tHtml = `<table class="hourly-table">
    <thead><tr>
      <th>Franja Horaria</th><th>Horas</th><th>Q (L/s)</th>
      <th>v montante (m/s)</th><th>Pérdidas (m)</th>
      <th>P piso 5 (m.c.a.)</th><th>Estado SCADA</th>
    </tr></thead><tbody>`;
  rows.forEach(r => {
    const cls = r.tipo === 'Pico' ? 'peak' : '';
    const okCls = r.ok ? 'ok' : 'bad';
    tHtml += `<tr>
      <td><strong>${r.label}</strong></td>
      <td class="${cls}">${r.horas}</td>
      <td>${r.Q.toFixed(3)}</td>
      <td>${r.v_mont.toFixed(3)}</td>
      <td>${r.losses.toFixed(4)}</td>
      <td class="${okCls}">${r.P5.toFixed(3)}</td>
      <td class="${okCls}">${r.ok ? 'OPERATIVO' : 'ALARMA DE PRESIÓN'}</td>
    </tr>`;
  });
  tHtml += '</tbody></table>';
  document.getElementById('hyd3-results-wrap').innerHTML = tHtml;

  // ── Valve interactive panel ──
  renderValvePanel(TDH, dz, href, Qref, Pmin);

  document.getElementById('hyd3-output').style.display = 'block';
  document.getElementById('card-hyd3').classList.add('card-active');
  showToast('HYD-3 calculado — ' + rows.filter(r=>r.ok).length + '/7 franjas operativas');
}

// ── Valve panel (interactive) ─────────────────────────────────
function renderValvePanel(TDH, dz, href, Qref, Pmin) {
  const floors = [5,4,3,2,1];
  let html = '';
  floors.forEach(f => {
    html += `<div class="valve-floor-row" id="vrow-${f}">
      <span class="floor-label">Piso ${f}</span>
      <input type="range" id="valve-${f}" min="0" max="100" value="100" step="5"
        oninput="updateValvePiso(${f},${TDH},${dz},${href},${Qref},${Pmin})">
      <span class="slider-val" id="valve-val-${f}">100%</span>
      <span id="valve-q-${f}" class="floor-q" style="font-size:12px;font-family:var(--font-mono)">-</span>
      <span id="valve-p-${f}" class="floor-p" style="font-size:12px;font-family:var(--font-mono)">-</span>
    </div>`;
  });
  document.getElementById('valve-rows').innerHTML = html;
  
  // Initial calculation
  updateValveAll(TDH, dz, href, Qref, Pmin);
}

function updateValvePiso(floor, TDH, dz, href, Qref, Pmin) {
  const pct = parseInt(document.getElementById(`valve-${floor}`).value);
  document.getElementById(`valve-val-${floor}`).textContent = pct + '%';
  updateValveAll(TDH, dz, href, Qref, Pmin);
}

function updateValveAll(TDH, dz, href, Qref, Pmin) {
  const floors = [5,4,3,2,1];
  const results = floors.map(f => {
    const apertura = parseInt(document.getElementById(`valve-${f}`)?.value || 100) / 100;
    // Partially-closed valve adds K ≈ 2 × (1/apertura² - 1) to that floor's branch
    const K_extra = apertura > 0 ? 2 * (1/(apertura*apertura) - 1) : 999;
    const Q_floor = (Qref / 5) * apertura; // floor takes proportional flow
    const v_branch = Q_floor / 1000 / (Math.PI * 0.0254 * 0.0254 / 4);
    const hm_valve = K_extra * (v_branch * v_branch) / (2 * 9.81);
    const h_floor = HydEngine.scaleLosses(href, Q_floor * 5, Qref); // main riser losses
    const elev = (f-1) * 2.8 + 3.5;
    const P = TDH - elev - h_floor - hm_valve;
    return { f, apertura, Q_floor, P, ok: P >= Pmin };
  });

  results.forEach(r => {
    const qEl = document.getElementById(`valve-q-${r.f}`);
    const pEl = document.getElementById(`valve-p-${r.f}`);
    if (qEl) qEl.textContent = r.Q_floor.toFixed(3) + ' L/s';
    if (pEl) {
      pEl.textContent = r.P.toFixed(2) + ' m';
      pEl.style.color = r.ok ? 'var(--green-400)' : 'var(--red-400)';
    }

    // Update SCADA facade building floors & LEDs
    const ledEl = document.getElementById(`led-floor-${r.f}`);
    const floorDiv = document.getElementById(`ffloor-${r.f}`);
    if (ledEl && floorDiv) {
      // Clear classes
      ledEl.className = 'facade-led';
      floorDiv.classList.remove('active-floor');
      
      if (r.apertura === 0 || r.P <= 0) {
        // Red LED (default) & not active
      } else if (r.ok) {
        ledEl.classList.add('led-ok');
        floorDiv.classList.add('active-floor');
      } else {
        ledEl.classList.add('led-warn');
        floorDiv.classList.add('active-floor');
      }
    }
  });

  // Update valve chart
  document.getElementById('valve-chart').innerHTML = svgValveBar(results, Pmin);
}

// ══════════════════════════════════════════════════════════════
//  HYD-4: COSTOS
// ══════════════════════════════════════════════════════════════
function runHyd4() {
  const prices   = readPrices();
  const pumpHP   = parseFloat(document.getElementById('h4-pump-hp').value) || (state.hyd2 ? state.hyd2.pump.hp : 1.0);
  const nPoints  = parseFloat(document.getElementById('h4-points').value) || 105;
  const pump     = HydEngine.selectPump(pumpHP);

  // Calculate line items
  const breakdown = prices.map(p => {
    let subtotal;
    if (p.item === 'Mano de obra / punto') {
      subtotal = p.price * nPoints;
    } else if (p.item === 'Tanque 23 m³') {
      subtotal = p.price * 1;
    } else {
      subtotal = p.price * p.qty;
    }
    return { ...p, subtotal };
  });

  // Override pump line with selected pump cost
  let pumpLine = breakdown.find(b => b.item.includes('Tanque') === false && b.item.toLowerCase().includes('bomba'));
  if (!pumpLine) {
    breakdown.push({ item: `Bomba ${pump.label} centrífuga`, unit:'u', price:pump.cost, qty:1, subtotal:pump.cost });
  } else {
    pumpLine.subtotal = pump.cost;
    pumpLine.item = `Bomba ${pump.label} centrífuga`;
    pumpLine.price = pump.cost;
  }

  const total = breakdown.reduce((s, b) => s + b.subtotal, 0);
  const perApto = total / 15;
  state.hyd4 = { breakdown, total, perApto };

  // ── Table ──
  let tHtml = `<table>
    <thead><tr><th>Material / Item</th><th>Und.</th><th>Precio unit. (COP)</th><th>Cantidad</th><th>Subtotal (COP)</th><th>%</th></tr></thead>
    <tbody>`;
  breakdown.forEach(b => {
    tHtml += `<tr>
      <td><strong>${b.item}</strong></td>
      <td style="color:var(--gray-500)">${b.unit}</td>
      <td style="font-family:var(--font-mono)">${fmt(b.price)}</td>
      <td>${b.qty}</td>
      <td style="font-family:var(--font-mono);font-weight:600;color:var(--white)">${fmt(b.subtotal)}</td>
      <td style="color:var(--cyan-400)">${((b.subtotal/total)*100).toFixed(1)}%</td>
    </tr>`;
  });
  tHtml += `</tbody><tfoot><tr>
    <td colspan="4"><strong>PRESUPUESTO TOTAL GENERAL</strong></td>
    <td style="font-family:var(--font-mono);color:var(--white)"><strong>${fmt(total)}</strong></td>
    <td></td>
  </tr></tfoot></table>`;
  document.getElementById('hyd4-results-wrap').innerHTML = tHtml;

  // ── Donut ──
  const colorPalette = ['#0c2340','#06b6d4','#3b82f6','#10b981','#f59e0b','#ef4444','#0d9488','#1e293b'];
  const grouped = groupCostItems(breakdown);
  document.getElementById('hyd4-chart-donut').innerHTML = svgDonut(
    grouped.map((g, i) => ({ label: g.label, value: g.total, color: colorPalette[i % colorPalette.length] })),
    total, 220, 220
  );

  // ── Total cards ──
  document.getElementById('hyd4-totals').innerHTML = `
    <div class="cost-total-card">
      <div class="label">Costo Total Red Hidráulica</div>
      <div class="big-number" style="margin:12px 0; color:var(--cyan-400);">${fmt(total)}</div>
      <div style="font-size:12px;opacity:.7">COP (pesos colombianos)</div>
    </div>
    <div class="cost-total-card" style="background: linear-gradient(180deg, #0f272a, #0b1329);">
      <div class="label">Inversión por Apartamento</div>
      <div class="big-number" style="margin:12px 0; color:var(--green-400);">${fmt(Math.round(perApto))}</div>
      <div style="font-size:12px;opacity:.7">COP - Dividido en 15 apartamentos</div>
    </div>`;

  document.getElementById('hyd4-output').style.display = 'block';
  document.getElementById('card-hyd4').classList.add('card-active');
  showToast('HYD-4 presupuestado — Costo total: ' + fmt(total) + ' COP');
}

function groupCostItems(breakdown) {
  const groups = [
    { label:'Tuberías',    match: i => i.item.startsWith('Tubería') },
    { label:'Accesorios',  match: i => ['Codo','Tee','Válvula','Reducción'].some(k => i.item.startsWith(k)) },
    { label:'Bomba',       match: i => i.item.toLowerCase().includes('bomba') },
    { label:'Tanque',      match: i => i.item.includes('Tanque') },
    { label:'Mano de obra',match: i => i.item.includes('Mano') },
  ];
  return groups.map(g => ({
    label: g.label,
    total: breakdown.filter(g.match).reduce((s, b) => s + b.subtotal, 0),
  })).filter(g => g.total > 0);
}

// ══════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════
function doExport() {
  const lines = [];
  const now = new Date().toLocaleDateString('es-CO', {year:'numeric',month:'long',day:'numeric'});

  lines.push('=========================================================================');
  lines.push('=== REPORTE TÉCNICO DE MEMORIA HIDRÁULICA - PROYECTO FINAL EDIFICIO ===');
  lines.push('=========================================================================');
  lines.push('Proyecto: Red de Suministro Hidráulico - Edificio de 5 Pisos, Bogotá D.C.');
  lines.push(`Fecha: ${now}`);
  lines.push('Diseñadores: M.A. Casas Sierra · L.F. Lasso González · I.D. Lora García · N. Valencia Toledo');
  lines.push('Universidad de La Sabana - Ingeniería Química - Fenómenos de Transporte 2026');
  lines.push('Docente: Sandra Rodríguez');
  lines.push('');

  lines.push('── 1. PARÁMETROS BASE DEL EDIFICIO ──────────────────────────────────────');
  lines.push('Población residencial: 15 Apartamentos · 3 Hab/Apto = 45 habitantes.');
  lines.push('Consumo diario estimado: 140 L/hab·día | Consumo diario total: 6,300 L/día.');
  lines.push('Capacidad del tanque de almacenamiento: 22,680 L (Margen de contingencia 3 días + 20% seg).');
  lines.push('Caudal de diseño (Método de Unidades Hunter / NTC 1500): 2.30 L/s (225 UH).');
  lines.push('Propiedades del fluido (Agua a 15°C): ρ = 999.1 kg/m³, μ = 1.138×10⁻³ Pa·s.');
  lines.push('Ubicación: Bogotá D.C. (Altitud 2,640 m.s.n.m.) | P_atmosférica = 74.66 kPa.');
  lines.push('');

  if (state.hyd1) {
    lines.push('── 2. ANÁLISIS DE PÉRDIDAS EN TUBERÍAS Y ACCESORIOS (HYD-1) ─────────────');
    lines.push('Ecuaciones de Darcy-Weisbach y Colebrook-White (Iteración de Newton-Raphson)');
    lines.push('');
    lines.push('Tramo  | Q (L/s) | v (m/s) |   Re    |   f      | hf (m)  | ΣK  | hm (m)  | h_total (m)');
    lines.push('-'.repeat(95));
    state.hyd1.results.forEach((r, i) => {
      const s = DEFAULT_SEGMENTS[i];
      lines.push(
        `${s.id.padEnd(6)} | ${s.Q_ls.toFixed(3).padStart(7)} | ${r.v.toFixed(3).padStart(7)} | ${Math.round(r.Re).toLocaleString().padStart(7)} | ${r.f.toFixed(5)} | ${r.hf.toFixed(4).padStart(7)} | ${s.K_total.toFixed(1).padStart(3)} | ${r.hm.toFixed(4).padStart(7)} | ${r.ht.toFixed(4)}`
      );
    });
    lines.push('-'.repeat(95));
    lines.push(`${'TOTAL'.padEnd(6)} |         |         |         |          | ${state.hyd1.totalHf.toFixed(4).padStart(7)} |     | ${state.hyd1.totalHm.toFixed(4).padStart(7)} | ${state.hyd1.totalH.toFixed(4)}`);
    lines.push('');
  }

  if (state.hyd2) {
    lines.push('── 3. ESPECIFICACIÓN Y DIMENSIONAMIENTO DE LA BOMBA (HYD-2) ─────────────');
    lines.push(`Altura geométrica estática (Δz)  = ${state.hyd2.dz.toFixed(2)} m`);
    lines.push(`Pérdidas acumuladas del sistema  = ${state.hyd2.losses.toFixed(4)} m`);
    lines.push(`Presión residual mínima Piso 5   = ${state.hyd2.pReq.toFixed(2)} m.c.a. (NTC 1500)`);
    lines.push(`Cabeza Dinámica Total (TDH)      = ${state.hyd2.TDH.toFixed(3)} m`);
    lines.push(`Potencia Hidráulica del Sistema  = ${(state.hyd2.P_hyd/1000).toFixed(3)} kW`);
    lines.push(`Potencia al Freno (Eficiencia η=${state.hyd2.eta}) = ${state.hyd2.P_hp.toFixed(4)} HP`);
    lines.push(`Recomendación comercial          = Bomba Centrífuga de ${state.hyd2.pump.label}`);
    lines.push(`NPSH Disponible (en Bogotá)      = ${state.hyd2.NPSH.toFixed(3)} m c.a.`);
    lines.push('');
    lines.push(`Ecuación de balance energético (TDH):`);
    lines.push(`  TDH = Δz + Σpérdidas + P_entrega`);
    lines.push(`  ${state.hyd2.TDH.toFixed(3)} m = ${state.hyd2.dz.toFixed(2)} m + ${state.hyd2.losses.toFixed(4)} m + ${state.hyd2.pReq.toFixed(2)} m`);
    lines.push('');
  }

  if (state.hyd3) {
    lines.push('── 4. VERIFICACIÓN OPERATIVA POR FRANJA HORARIA (HYD-3) ─────────────────');
    lines.push('Franja            | Horas | Q (L/s) | Pérdidas (m) | P_piso 5 (mca)  | Estado');
    lines.push('-'.repeat(80));
    state.hyd3.rows.forEach(r => {
      lines.push(`${r.label.padEnd(17)} | ${r.horas.padEnd(5)} | ${r.Q.toFixed(3).padStart(7)} | ${r.losses.toFixed(4).padStart(12)} | ${r.P5.toFixed(3).padStart(16)} | ${r.ok?'OPERATIVO':'PRESIÓN BAJA'}`);
    });
    lines.push('');
  }

  if (state.hyd4) {
    lines.push('── 5. ANÁLISIS FINANCIERO Y PRESUPUESTO COMERCIAL (HYD-4) ───────────────');
    const groups = groupCostItems(state.hyd4.breakdown);
    groups.forEach(g => lines.push(`  ${g.label.padEnd(15)}: ${fmt(g.total).padStart(18)} COP  (${((g.total/state.hyd4.total)*100).toFixed(1)}%)`));
    lines.push('-'.repeat(52));
    lines.push(`  PRESUPUESTO NETO: ${fmt(state.hyd4.total).padStart(18)} COP`);
    lines.push(`  Costo prorrateado/Apto: ${fmt(Math.round(state.hyd4.perApto)).padStart(18)} COP`);
    lines.push('');
  }

  lines.push('=========================================================================');
  lines.push('Memoria técnica autogenerada por Simulador Hidráulico en GitHub Pages.');
  lines.push('Desarrollado bajo estándares NTC 1500 y ecuaciones fundamentales de fluidos.');

  const text = lines.join('\n');
  document.getElementById('export-text').value = text;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('Resultados copiados al portapapeles'));
  } else {
    const ta = document.getElementById('export-text');
    ta.select();
    showToast('Selecciona el texto de la memoria y copia manualmente (Ctrl+C)');
  }
}

// ══════════════════════════════════════════════════════════════
//  SVG CHART HELPERS WITH DARK SCADA ESTHETICS (No overlap)
// ══════════════════════════════════════════════════════════════

function svgBarChart(data, opts) {
  const W = opts.width || 700, H = opts.height || 260;
  const margin = { top:20, right:20, bottom:50, left:55 };
  const w = W - margin.left - margin.right;
  const h = H - margin.top - margin.bottom;
  const maxVal = Math.max(...data.map(d => d.total)) * 1.15 || 1;
  const bw = (w / data.length) * 0.7;
  const gap = w / data.length;

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;background:transparent">
    <defs>
      <linearGradient id="gb1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${opts.color1}" stop-opacity=".95"/>
        <stop offset="100%" stop-color="${opts.color1}" stop-opacity=".4"/>
      </linearGradient>
      <linearGradient id="gb2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${opts.color2}" stop-opacity=".95"/>
        <stop offset="100%" stop-color="${opts.color2}" stop-opacity=".4"/>
      </linearGradient>
    </defs>
    <g transform="translate(${margin.left},${margin.top})">`;

  // Y gridlines (Darker lines)
  for (let i=0; i<=4; i++) {
    const yy = h - (i/4) * h;
    const val = (maxVal * i/4).toFixed(3);
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="-8" y="${yy+4}" text-anchor="end" font-size="9" font-family="JetBrains Mono" fill="#94a3b8">${val}</text>`;
  }

  // Bars
  data.forEach((d, i) => {
    const x = i * gap + gap * 0.15;
    const h1 = (d.v1 / maxVal) * h;
    const h2 = (d.v2 / maxVal) * h;
    
    // Friction losses bar (rounded corners)
    s += `<rect x="${x}" y="${h - h1 - h2}" width="${bw*0.46}" height="${h1+h2}" fill="url(#gb1)" rx="3" stroke="rgba(6,182,212,0.15)"/>`;
    // Minor losses bar
    s += `<rect x="${x + bw*0.50}" y="${h - h2}" width="${bw*0.46}" height="${h2}" fill="url(#gb2)" rx="3" stroke="rgba(245,158,11,0.15)"/>`;
    
    // Labels (No overlapping, balanced spacing)
    s += `<text x="${x + bw*0.48}" y="${h + 16}" text-anchor="middle" font-size="10" font-weight="600" fill="#e2e8f0">${d.label}</text>`;
    
    if (d.total > 0.001) {
      s += `<text x="${x + bw*0.24}" y="${h - h1 - h2 - 5}" text-anchor="middle" font-size="8.5" font-family="JetBrains Mono" fill="#3b82f6">${d.total.toFixed(3)}</text>`;
    }
  });

  // Axes
  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#475569" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#475569" stroke-width="1.5"/>`;

  // Y axis label
  s += `<text transform="rotate(-90)" x="${-h/2}" y="-42" text-anchor="middle" font-size="10" font-weight="500" fill="#94a3b8">Pérdida de Carga (m.c.a.)</text>`;

  // Legend
  s += `<rect x="${w-220}" y="-16" width="10" height="10" fill="${opts.color1}" rx="2"/>
    <text x="${w-205}" y="-8" font-size="9" fill="#94a3b8">${opts.label1}</text>
    <rect x="${w-110}" y="-16" width="10" height="10" fill="${opts.color2}" rx="2"/>
    <text x="${w-95}" y="-8" font-size="9" fill="#94a3b8">${opts.label2}</text>`;

  s += '</g></svg>';
  return s;
}

function svgGradientLine(results, segments, startHead) {
  const W = 680, H = 220;
  const margin = { top:20, right:20, bottom:40, left:55 };
  const w = W - margin.left - margin.right;
  const h = H - margin.top - margin.bottom;

  let cumDist = 0, cumLoss = 0;
  const maxDist = segments.reduce((s, seg) => s + seg.L_m, 0) || 1;
  const maxP = startHead * 1.1 || 1;
  const points = [{ x: 0, y: startHead }];
  results.forEach((r, i) => {
    cumDist += segments[i].L_m;
    cumLoss += r.ht;
    points.push({ x: cumDist, y: startHead - cumLoss });
  });

  const px = d => (d.x / maxDist) * w;
  const py = d => h - (Math.max(0, d.y) / maxP) * h;
  const path = 'M ' + points.map(p => `${px(p)},${py(p)}`).join(' L ');

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;background:transparent">
    <g transform="translate(${margin.left},${margin.top})">`;

  // Grid
  for (let i=0; i<=4; i++) {
    const yy = (i/4) * h;
    const val = (maxP * (1 - i/4)).toFixed(2);
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="-8" y="${yy+4}" text-anchor="end" font-size="9" font-family="JetBrains Mono" fill="#94a3b8">${val}</text>`;
  }

  // Minimum pressure line (Red alarm dash) - Placed safely to avoid overlap
  const ymin = h - (10 / maxP) * h;
  s += `<line x1="0" y1="${ymin}" x2="${w}" y2="${ymin}" stroke="var(--red-500)" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="${w-80}" y="${ymin-6}" font-size="8.5" font-weight="600" fill="var(--red-400)">Presión mínima (10 m.c.a.)</text>`;

  // Gradient line (Neon Blue)
  s += `<path d="${path}" fill="none" stroke="var(--cyan-400)" stroke-width="2.5" stroke-linejoin="round" style="filter:drop-shadow(0px 0px 3px rgba(34,211,238,0.4))"/>`;
  
  // Points
  points.forEach(p => {
    s += `<circle cx="${px(p)}" cy="${py(p)}" r="4.5" fill="var(--cyan-400)" stroke="#090f1a" stroke-width="2"/>`;
  });

  // Axes
  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#475569" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#475569" stroke-width="1.5"/>`;
  s += `<text x="${w/2}" y="${h+28}" text-anchor="middle" font-size="10" fill="#94a3b8">Distancia acumulada de tuberías desde bomba (m)</text>`;
  s += `<text transform="rotate(-90)" x="${-h/2}" y="-42" text-anchor="middle" font-size="10" fill="#94a3b8">Presión disponible (m c.a.)</text>`;
  s += '</g></svg>';
  return s;
}

function svgDonut(slices, total, W, H) {
  const cx = W/2, cy = H/2 - 10, R = Math.min(W,H)*0.32, r = R*0.58;
  const totalVal = slices.reduce((s,sl) => s + sl.value, 0) || 1;
  let angle = -Math.PI/2;

  let paths = '', legends = '';
  slices.forEach((sl, i) => {
    const a = (sl.value / totalVal) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle+a), y2 = cy + R * Math.sin(angle+a);
    const xi1 = cx + r * Math.cos(angle), yi1 = cy + r * Math.sin(angle);
    const xi2 = cx + r * Math.cos(angle+a), yi2 = cy + r * Math.sin(angle+a);
    const large = a > Math.PI ? 1 : 0;
    paths += `<path d="M${xi1},${yi1} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${r},${r} 0 ${large} 0 ${xi1},${yi1} Z"
      fill="${sl.color}" stroke="#0b1329" stroke-width="1.5" opacity=".95">
      <title>${sl.label}: ${sl.value.toFixed(2)} m (${((sl.value/totalVal)*100).toFixed(1)}%)</title>
    </path>`;
    const ly = 12 + i * 18;
    legends += `<rect x="${W-110}" y="${ly-10}" width="10" height="10" fill="${sl.color}" rx="2"/>
      <text x="${W-95}" y="${ly}" font-size="9" fill="#94a3b8">${sl.label} (${((sl.value/totalVal)*100).toFixed(0)}%)</text>`;
    angle += a;
  });

  const label = typeof total === 'number' ? total.toFixed(2) : total;
  return `<svg viewBox="0 0 ${W} ${H+20}" style="width:100%;max-width:${W}px;background:transparent">
    ${paths}
    <text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="21" font-family="Outfit" font-weight="700" fill="#ffffff">${label}</text>
    <text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="9" font-family="Inter" fill="#94a3b8">m c.a. total</text>
    ${legends}
  </svg>`;
}

function svgComboChart(rows, Pmin) {
  const W=680, H=260, margin={top:30,right:60,bottom:60,left:55};
  const w=W-margin.left-margin.right, h=H-margin.top-margin.bottom;
  const maxQ = Math.max(...rows.map(r=>r.Q)) * 1.3 || 1;
  const minP = Math.min(...rows.map(r=>r.P5)) * 0.85;
  const maxP = Math.max(...rows.map(r=>r.P5)) * 1.15 || 1;
  const bw = (w / rows.length) * 0.6;
  const gap = w / rows.length;

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;background:transparent">
    <g transform="translate(${margin.left},${margin.top})">`;

  // Q bars
  rows.forEach((r, i) => {
    const bh = (r.Q / maxQ) * h;
    const x = i * gap + gap * 0.2;
    const color = r.tipo==='Pico' ? '#1e3a8a' : r.tipo==='Normal' ? '#0d9488' : '#1e293b';
    s += `<rect x="${x}" y="${h-bh}" width="${bw}" height="${bh}" fill="${color}" rx="2" opacity=".85" stroke="rgba(255,255,255,0.04)">
      <title>${r.label}: ${r.Q.toFixed(3)} L/s</title></rect>`;
    s += `<text x="${x+bw/2}" y="${h+14}" text-anchor="middle" font-size="9" fill="#94a3b8" transform="rotate(-30,${x+bw/2},${h+14})">${r.horas}</text>`;
  });

  // Pressure line (Right Axis)
  const pScale = v => h - ((v - minP) / (maxP - minP)) * h;
  const pPoints = rows.map((r, i) => `${i * gap + gap * 0.5},${pScale(r.P5)}`).join(' ');
  
  s += `<polyline points="${pPoints}" fill="none" stroke="var(--cyan-400)" stroke-width="2.5" stroke-linejoin="round" style="filter:drop-shadow(0px 0px 3px rgba(34,211,238,0.4))"/>`;
  
  rows.forEach((r, i) => {
    s += `<circle cx="${i * gap + gap * 0.5}" cy="${pScale(r.P5)}" r="4.5" fill="${r.ok?'var(--green-400)':'var(--red-400)'}" stroke="#090f1a" stroke-width="2"><title>${r.label}: P = ${r.P5.toFixed(2)} m.c.a. (${r.ok?'✓ OK':'✗ Baja Presión'})</title></circle>`;
  });

  // Pmin line
  const yPmin = pScale(Pmin);
  s += `<line x1="0" y1="${yPmin}" x2="${w}" y2="${yPmin}" stroke="var(--red-500)" stroke-width="1.5" stroke-dasharray="6,3"/>
    <text x="${w+4}" y="${yPmin+3}" font-size="8.5" fill="var(--red-400)">${Pmin} m</text>`;

  // Left axis (Q)
  for (let i=0; i<=3; i++) {
    const yy = h - (i/3)*h;
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="-8" y="${yy+3}" text-anchor="end" font-size="8.5" font-family="JetBrains Mono" fill="#94a3b8">${(maxQ*i/3).toFixed(2)}</text>`;
  }
  
  // Right axis (P)
  for (let i=0; i<=3; i++) {
    const yy = h - (i/3)*h;
    const pv = minP + (maxP - minP) * i/3;
    s += `<text x="${w+32}" y="${yy+3}" text-anchor="end" font-size="8.5" font-family="JetBrains Mono" fill="var(--cyan-400)">${pv.toFixed(1)}</text>`;
  }

  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#475569" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#475569" stroke-width="1.5"/>`;
  s += `<text x="${w/2}" y="${h+44}" text-anchor="middle" font-size="10.5" font-weight="500" fill="#94a3b8">Franja Horaria</text>`;
  s += `<text transform="rotate(-90)" x="${-h/2}" y="-40" text-anchor="middle" font-size="9.5" fill="#94a3b8">Caudal Q (L/s)</text>`;
  s += `<text transform="rotate(90)" x="${h/2}" y="${-w-44}" text-anchor="middle" font-size="9.5" fill="var(--cyan-400)">Presión Piso 5 (m.c.a.)</text>`;

  // Legend
  s += `<rect x="0" y="-22" width="10" height="10" fill="#1e3a8a" rx="2"/>
    <text x="14" y="-13" font-size="9" fill="#94a3b8">Q pico</text>
    <rect x="65" y="-22" width="10" height="10" fill="#0d9488" rx="2"/>
    <text x="79" y="-13" font-size="9" fill="#94a3b8">Q normal</text>
    <line x1="135" y1="-17" x2="150" y2="-17" stroke="var(--cyan-400)" stroke-width="2"/>
    <text x="155" y="-13" font-size="9" fill="var(--cyan-400)">P disponible</text>`;

  s += '</g></svg>';
  return s;
}

function svgValveBar(results, Pmin) {
  const W=600, H=200, margin={top:20,right:30,bottom:40,left:55};
  const w=W-margin.left-margin.right, h=H-margin.top-margin.bottom;
  const maxP = Math.max(Pmin*1.5, ...results.map(r=>Math.max(0,r.P))) || 1;
  const bw = (w / results.length) * 0.6;
  const gap = w / results.length;

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;background:transparent">
    <g transform="translate(${margin.left},${margin.top})">`;

  results.forEach((r, i) => {
    const bh = (Math.max(0,r.P) / maxP) * h;
    const x = i * gap + gap * 0.2;
    const color = r.ok ? 'var(--green-500)' : 'var(--red-500)';
    s += `<rect x="${x}" y="${h-bh}" width="${bw}" height="${bh}" fill="${color}" rx="3" opacity=".8" stroke="rgba(255,255,255,0.06)"/>`;
    s += `<text x="${x+bw/2}" y="${h-bh-4}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono" fill="#ffffff">${r.P.toFixed(1)}</text>`;
    s += `<text x="${x+bw/2}" y="${h+16}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#94a3b8">Piso ${r.f}</text>`;
  });

  const yPmin = h - (Pmin/maxP)*h;
  s += `<line x1="0" y1="${yPmin}" x2="${w}" y2="${yPmin}" stroke="var(--red-500)" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="${w+4}" y="${yPmin+3}" font-size="8.5" fill="var(--red-400)">P_mín (${Pmin} m)</text>`;

  for (let i=0; i<=4; i++) {
    const yy = h - (i/4)*h;
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>
      <text x="-8" y="${yy+3}" text-anchor="end" font-size="8.5" font-family="JetBrains Mono" fill="#94a3b8">${(maxP*i/4).toFixed(1)}</text>`;
  }
  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#475569" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#475569" stroke-width="1.5"/>`;
  s += `<text x="${w/2}" y="${h+32}" text-anchor="middle" font-size="10" fill="#94a3b8">Presión dinámica disponible por nivel (m c.a.)</text>`;
  s += '</g></svg>';
  return s;
}

// ══════════════════════════════════════════════════════════════
//  BUILDING SCHEMATIC SVG (REFINED - LABELED TRAMOS T1-T9 - NO OVERLAPPING)
// ══════════════════════════════════════════════════════════════
function svgBuildingSchematic() {
  const W = 600, H = 650;
  const wallX = 140, wallW = 280;
  const sotanoY = 560, sotanoH = 60;
  const pisoH = 76; 
  
  const floorY = f => sotanoY - f * pisoH; 

  const riserX = 190;
  const riserTop = floorY(5) - 10;
  
  // Floor branches vertical coordinates (midpoint of each floor)
  const fY = f => floorY(f) + pisoH * 0.55;

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;background:#050a14;font-family:Inter,sans-serif;border-radius:var(--r-md);border:1px solid rgba(255,255,255,0.04)">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 Z" fill="var(--cyan-400)"/>
      </marker>
      <marker id="arrS" markerWidth="6" markerHeight="6" refX="5" refY="2" orient="auto">
        <path d="M0,0 L0,4 L6,2 Z" fill="var(--teal-500)"/>
      </marker>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/>
      </pattern>
    </defs>

    <!-- Background Grid -->
    <rect width="${W}" height="${H}" fill="url(#grid)"/>

    <!-- Title -->
    <text x="${W/2}" y="24" text-anchor="middle" font-family="Outfit" font-size="12.5" font-weight="700" fill="var(--cyan-400)" letter-spacing="1">
      ESQUEMA UNIFILAR DE LA RED HIDRÁULICA
    </text>
    
    <!-- Legend / Instructions -->
    <text x="${W/2}" y="42" text-anchor="middle" font-size="9" fill="#6b7280">
      Pase el cursor sobre un tramo en la tabla o en el esquema para resaltarlo
    </text>`;

  // ── DRAW BUILDING WIREFRAME ──────────────────────────────────────────
  for (let f = 1; f <= 5; f++) {
    const y = floorY(f);
    // Concrete slabs
    s += `<rect x="${wallX}" y="${y}" width="${wallW}" height="5" fill="#1e293b" rx="1"/>`;
    // Left & Right columns
    s += `<line x1="${wallX}" y1="${y+5}" x2="${wallX}" y2="${y+pisoH}" stroke="#334155" stroke-width="1.2" stroke-opacity="0.7"/>`;
    s += `<line x1="${wallX+wallW}" y1="${y+5}" x2="${wallX+wallW}" y2="${y+pisoH}" stroke="#334155" stroke-width="1.2" stroke-opacity="0.7"/>`;
    
    // Floor tags (Aligned far right to prevent overlap)
    s += `<text x="${wallX+wallW+14}" y="${y+pisoH/2+4}" font-family="Outfit" font-size="11.5" font-weight="600" fill="#e2e8f0">Piso ${f}</text>`;
    
    // Elevation annotations and connection dotted lines (far left)
    const elevVal = f === 1 ? '3.50 m' : f === 2 ? '6.30 m' : f === 3 ? '9.10 m' : f === 4 ? '11.90 m' : '14.70 m';
    s += `<line x1="50" y1="${fY(f)}" x2="${wallX}" y2="${fY(f)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2"/>`;
    s += `<text x="45" y="${fY(f)+3}" text-anchor="end" font-size="8.5" font-family="JetBrains Mono" fill="#6b7280">${elevVal}</text>`;
  }

  // Basement Block
  s += `<rect x="${wallX}" y="${sotanoY}" width="${wallW}" height="${sotanoH}" fill="rgba(15,23,42,0.6)" rx="2" stroke="rgba(255,255,255,0.03)"/>`;
  s += `<rect x="${wallX}" y="${sotanoY}" width="${wallW}" height="5" fill="#1e293b" rx="1"/>`;
  s += `<text x="${wallX+wallW+14}" y="${sotanoY+sotanoH/2+4}" font-family="Outfit" font-size="11.5" font-weight="600" fill="#e2e8f0">Sótano</text>`;
  s += `<line x1="50" y1="${sotanoY+sotanoH/2}" x2="${wallX}" y2="${sotanoY+sotanoH/2}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2"/>`;
  s += `<text x="45" y="${sotanoY+sotanoH/2+3}" text-anchor="end" font-size="8.5" font-family="JetBrains Mono" fill="#6b7280">0.00 m</text>`;

  // ── DRAW PIPELINES WITH INTERACTIVE GROUPS (T1 - T9) ──────────────────

  // Helper function to build group elements in string format
  const makeSegGroup = (id, lineHtml, badgeX, badgeY) => {
    return `<g id="svg-seg-group-${id}" class="svg-highlight-group" onmouseenter="window.highlightSeg('${id}')" onmouseleave="window.unhighlightSeg('${id}')">
      ${lineHtml}
      <!-- Segment Badge (Sleek professional capsule) -->
      <rect x="${badgeX}" y="${badgeY}" width="24" height="14" fill="#090e17" stroke="#475569" stroke-width="1" rx="3"/>
      <text x="${badgeX + 12}" y="${badgeY + 10.5}" fill="#94a3b8" font-size="8.5" font-family="JetBrains Mono" font-weight="600" text-anchor="middle">${id}</text>
    </g>`;
  };

  // T1: Pump outlet to riser base (Horizontal in basement)
  s += makeSegGroup('T1', 
    `<line x1="320" y1="585" x2="190" y2="585" stroke="var(--cyan-500)" stroke-width="2.5" stroke-linecap="square"/>`,
    235, 578
  );

  // T2: Montante basement to Floor 1 branch
  s += makeSegGroup('T2', 
    `<line x1="190" y1="585" x2="190" y2="${fY(1)}" stroke="var(--cyan-500)" stroke-width="3" />`,
    152, 547
  );

  // T3: Montante Floor 1 to Floor 2 branch
  s += makeSegGroup('T3', 
    `<line x1="190" y1="${fY(1)}" x2="190" y2="${fY(2)}" stroke="var(--cyan-500)" stroke-width="3" />`,
    152, 479
  );

  // T4: Montante Floor 2 to Floor 3 branch (Reducción)
  s += makeSegGroup('T4', 
    `<line x1="190" y1="${fY(2)}" x2="190" y2="${fY(3)}" stroke="var(--cyan-500)" stroke-width="2.5" />`,
    152, 403
  );

  // T5: Montante Floor 3 to Floor 4 branch
  s += makeSegGroup('T5', 
    `<line x1="190" y1="${fY(3)}" x2="190" y2="${fY(4)}" stroke="var(--cyan-500)" stroke-width="2.5" />`,
    152, 327
  );

  // T6: Montante Floor 4 to Floor 5 branch
  s += makeSegGroup('T6', 
    `<line x1="190" y1="${fY(4)}" x2="190" y2="${fY(5)}" stroke="var(--cyan-500)" stroke-width="2.5" />`,
    152, 251
  );

  // T7: Floor 5 distribution horizontal branch (riser to Apto 3 entrance)
  s += makeSegGroup('T7', 
    `<line x1="190" y1="${fY(5)}" x2="330" y2="${fY(5)}" stroke="var(--red-500)" stroke-width="2.2" />`,
    248, 195
  );

  // T8: Floor 5 internal apartment branch (entrance to bathroom)
  s += makeSegGroup('T8', 
    `<line x1="330" y1="${fY(5)}" x2="410" y2="${fY(5)}" stroke="var(--red-500)" stroke-width="2.2" />`,
    354, 195
  );

  // T9: Shower connection critical point
  s += makeSegGroup('T9', 
    `<line x1="410" y1="${fY(5)}" x2="460" y2="${fY(5)}" stroke="var(--red-500)" stroke-width="2" />`,
    420, 195
  );

  // ── NON-CRITICAL FLOORS SCHEMATIC REPRESENTATION (Dashed) ─────────
  for (let f = 1; f <= 4; f++) {
    const y = fY(f);
    const bx2 = wallX + wallW - 20;
    // Tee symbol
    s += `<circle cx="${riserX}" cy="${y}" r="3" fill="#1e293b" stroke="#334155" stroke-width="1"/>`;
    // Horizontal branch (dashed)
    s += `<line x1="${riserX+3}" y1="${y}" x2="${bx2}" y2="${y}" stroke="#475569" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>`;
    s += `<line x1="${bx2-5}" y1="${y}" x2="${bx2}" y2="${y}" stroke="#475569" stroke-width="1" marker-end="url(#arrS)" opacity="0.6"/>`;
    s += `<text x="${bx2+6}" y="${y+3}" font-size="8.5" fill="#6b7280" opacity="0.7">Aptos</text>`;
  }

  // ── CRITICAL POINT AND HIGHLIGHTED LABELS ─────────────────────────
  const px5 = 460, py5 = fY(5);
  // Red glowing node for critical point
  s += `<circle cx="${px5}" cy="${py5}" r="5.5" fill="var(--red-500)" stroke="#ffffff" stroke-width="1.5" style="filter:drop-shadow(0px 0px 4px rgba(239,68,68,0.85))"/>`;
  
  // Point most unfavorable text labels (Perfect alignment, no overlaps)
  s += `<text x="${px5+12}" y="${py5-8}" font-family="Outfit" font-size="10" font-weight="700" fill="var(--red-400)">Punto Crítico</text>`;
  s += `<text x="${px5+12}" y="${py5+3}" font-size="8.5" fill="#94a3b8">(P5 Apto 3 Ducha)</text>`;
  s += `<text x="${px5+12}" y="${py5+13}" font-size="8" font-family="JetBrains Mono" fill="#6b7280">z = 16.70 m</text>`;

  // ── EQUIPMENT REPRESENTATION (Basement) ──────────────────────────
  
  // Pump
  const pumpX = riserX, pumpY = sotanoY + 25;
  s += `<ellipse cx="${pumpX}" cy="${pumpY}" rx="18" ry="12" fill="#0d9488" stroke="#115e59" stroke-width="1.5"/>`;
  s += `<text x="${pumpX}" y="${pumpY+3}" text-anchor="middle" font-family="Outfit" font-size="8" font-weight="700" fill="white">BOMBA</text>`;
  s += `<text x="${pumpX}" y="${pumpY+17}" text-anchor="middle" font-size="8" font-family="JetBrains Mono" fill="var(--teal-500)">1.5 HP</text>`;
  
  // Tank
  const tankX = wallX + wallW - 55, tankY = sotanoY + 8, tankW = 50, tankH = 44;
  s += `<rect x="${tankX}" y="${tankY}" width="${tankW}" height="${tankH}" fill="#0f172a" stroke="var(--cyan-500)" stroke-width="1.5" rx="3"/>`;
  s += `<rect x="${tankX}" y="${tankY}" width="${tankW}" height="8" fill="#1e293b" rx="2" stroke="rgba(255,255,255,0.03)"/>`;
  s += `<text x="${tankX+tankW/2}" y="${tankY+22}" text-anchor="middle" font-family="Outfit" font-size="8.5" font-weight="600" fill="#e2e8f0">TANQUE</text>`;
  s += `<text x="${tankX+tankW/2}" y="${tankY+34}" text-anchor="middle" font-size="8" font-family="JetBrains Mono" fill="var(--cyan-400)">22,680 L</text>`;

  // Tank connection
  s += `<line x1="${tankX}" y1="${pumpY}" x2="${pumpX+18}" y2="${pumpY}" stroke="var(--cyan-400)" stroke-width="1.5" stroke-dasharray="3,2"/>`;

  // ── LEGEND BOX (Perfect layout, no overlaps) ──────────────────────
  const lx = 20, ly = H - 90;
  s += `<rect x="${lx}" y="${ly}" width="145" height="76" fill="#090f1a" stroke="rgba(255,255,255,0.05)" stroke-width="1" rx="4"/>`;
  s += `<rect x="${lx+6}" y="${ly+8}" width="10" height="6" fill="#083344" stroke="var(--cyan-400)" stroke-width="1" rx="1"/>`;
  s += `<text x="${lx+22}" y="${ly+13}" font-size="8.5" fill="#94a3b8">Montante principal (Cyan)</text>`;
  s += `<line x1="${lx+6}" y1="${ly+26}" x2="${lx+16}" y2="${ly+26}" stroke="#475569" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.6"/>`;
  s += `<text x="${lx+22}" y="${ly+30}" font-size="8.5" fill="#6b7280">Ramales otros pisos (Dashed)</text>`;
  s += `<line x1="${lx+6}" y1="${ly+42}" x2="${lx+16}" y2="${ly+42}" stroke="var(--red-500)" stroke-width="1.8"/>`;
  s += `<text x="${lx+22}" y="${ly+46}" font-size="8.5" fill="var(--red-400)">Tramo crítico (T7-T9, Rojo)</text>`;
  s += `<ellipse cx="${lx+11}" cy="${ly+59}" rx="6.5" ry="4.5" fill="#0d9488"/>`;
  s += `<text x="${lx+22}" y="${ly+63}" font-size="8.5" fill="#94a3b8">Bomba de Impulsión</text>`;

  s += '</svg>';
  return s;
}

// ══════════════════════════════════════════════════════════════
//  RUN ALL
// ══════════════════════════════════════════════════════════════
function runAll() {
  const btn = document.getElementById('run-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando motor hidráulico...'; }

  // Ensure all modules are visible
  ['card-hyd1','card-hyd2','card-hyd3','card-hyd4'].forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    const body = card.querySelector('.card-body');
    const header = card.querySelector('.card-header');
    const toggle = card.querySelector('.card-toggle');
    if (body && !body.classList.contains('open')) {
      body.classList.add('open');
      header && header.classList.add('open');
      toggle && (toggle.textContent = 'Colapsar');
    }
  });

  runHyd1();
  runHyd2();
  runHyd3();
  runHyd4();

  if (btn) { btn.disabled = false; btn.textContent = 'Ejecutar Simulación Completa (Módulos HYD-1 -> HYD-4)'; }
  showToast('Simulación completada con éxito. Todos los módulos operativos.');
}

// ══════════════════════════════════════════════════════════════
//  HOURLY SUM BADGE
// ══════════════════════════════════════════════════════════════
function updateHourlyBadge() {
  const badge = document.getElementById('hourly-pct-badge');
  if (!badge) return;
  let sum = 0;
  DEFAULT_HOURLY.forEach((_, idx) => {
    const el = document.querySelector(`[data-hour="${idx}"][data-field="pct"]`);
    if (el) sum += parseFloat(el.value) || 0;
  });
  const pct = (sum * 100).toFixed(1);
  const ok = Math.abs(sum - 1.0) < 0.001;
  badge.textContent = `Suma = ${pct}%`;
  badge.className = 'pct-badge ' + (ok ? 'pct-ok' : 'pct-bad');
}

// ══════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════
function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
