/**
 * app.js — Simulador Hidráulico UI
 * Proyecto Final Fenómenos de Transporte — U. de La Sabana, 2026
 */
'use strict';

// ══════════════════════════════════════════════════════════════
//  DEFAULT DATA
// ══════════════════════════════════════════════════════════════

const DEFAULT_SEGMENTS = [
  { id:'T1', desc:'Bomba → base montante',         D_mm:48.4,  L_m:3.0,  Q_ls:2.30, K_total:4.3  },
  { id:'T2', desc:'Montante: sótano → P1',         D_mm:48.4,  L_m:3.5,  Q_ls:2.30, K_total:0.5  },
  { id:'T3', desc:'Montante: P1 → P2',             D_mm:48.4,  L_m:2.8,  Q_ls:2.30, K_total:0.5  },
  { id:'T4', desc:'Montante: P2 → P3 (reducción)', D_mm:38.1,  L_m:2.8,  Q_ls:1.38, K_total:1.3  },
  { id:'T5', desc:'Montante: P3 → P4',             D_mm:38.1,  L_m:2.8,  Q_ls:0.92, K_total:0.5  },
  { id:'T6', desc:'Montante: P4 → P5',             D_mm:38.1,  L_m:2.8,  Q_ls:0.46, K_total:1.8  },
  { id:'T7', desc:'Distribución piso 5 → Apto 3',  D_mm:25.4,  L_m:8.0,  Q_ls:0.46, K_total:7.2  },
  { id:'T8', desc:'Ramal apto → baño privado',     D_mm:19.05, L_m:4.0,  Q_ls:0.15, K_total:3.6  },
  { id:'T9', desc:'Conexión punto (ducha)',         D_mm:12.7,  L_m:2.0,  Q_ls:0.15, K_total:1.4  },
];

const DEFAULT_HOURLY = [
  { label:'Madrugada',      horas:'00–05', dur:5,  pct:0.05,  tipo:'Valle' },
  { label:'Pico mañana',    horas:'05–07', dur:2,  pct:0.20,  tipo:'Pico'  },
  { label:'Mañana',         horas:'07–11', dur:4,  pct:0.15,  tipo:'Normal'},
  { label:'Pico mediodía',  horas:'11–14', dur:3,  pct:0.20,  tipo:'Pico'  },
  { label:'Tarde',          horas:'14–19', dur:5,  pct:0.10,  tipo:'Normal'},
  { label:'Pico noche',     horas:'19–21', dur:2,  pct:0.20,  tipo:'Pico'  },
  { label:'Noche',          horas:'21–24', dur:3,  pct:0.10,  tipo:'Valle' },
];

const DEFAULT_PRICES = [
  { item:'Tubería PVC ½"',         unit:'m',  price:4500,    qty:210 },
  { item:'Tubería PVC ¾"',         unit:'m',  price:6200,    qty:60  },
  { item:'Tubería PVC 1"',         unit:'m',  price:9800,    qty:120 },
  { item:'Tubería PVC 1½"',        unit:'m',  price:18500,   qty:8.4 },
  { item:'Tubería PVC 2"',         unit:'m',  price:28000,   qty:9.3 },
  { item:'Codo 90° ½"',            unit:'u',  price:1200,    qty:105 },
  { item:'Codo 90° ¾"',            unit:'u',  price:1800,    qty:30  },
  { item:'Codo 90° 1"',            unit:'u',  price:3500,    qty:45  },
  { item:'Codo 90° 1½"',           unit:'u',  price:6000,    qty:4   },
  { item:'Codo 90° 2"',            unit:'u',  price:9500,    qty:2   },
  { item:'Tee 1"',                 unit:'u',  price:4200,    qty:30  },
  { item:'Tee 1½"',                unit:'u',  price:7500,    qty:4   },
  { item:'Tee 2"',                 unit:'u',  price:12000,   qty:3   },
  { item:'Válvula compuerta 2"',   unit:'u',  price:45000,   qty:1   },
  { item:'Válvula check 2"',       unit:'u',  price:85000,   qty:1   },
  { item:'Válvula de paso ½"',     unit:'u',  price:12000,   qty:15  },
  { item:'Reducción 2"→1½"',       unit:'u',  price:8500,    qty:1   },
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
});

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
    `<tr>
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
      <td><span class="badge ${h.tipo==='Pico'?'badge-blue':'badge-teal'}" style="font-size:11px">${h.tipo}</span></td>
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
  btn.textContent = isOpen ? '▲ Colapsar' : '▼ Expandir';
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
    const statusIcon = r.velWarn === 'low' ? '⚠ v baja' : r.velWarn === 'high' ? '✗ v alta' : '✓';
    if (r.velWarn === 'low')  alerts.push(`⚠ ${seg.id}: velocidad baja (${r.v.toFixed(3)} m/s < 0.5 m/s) — considere reducir diámetro.`);
    if (r.velWarn === 'high') alerts.push(`✗ ${seg.id}: velocidad excede NTC 1500 (${r.v.toFixed(3)} m/s > 2.5 m/s) — aumente diámetro.`);
    tableHtml += `<tr>
      <td><strong>${seg.id}</strong></td>
      <td>${seg.Q_ls.toFixed(3)}</td>
      <td class="${vClass}">${r.v.toFixed(3)}</td>
      <td>${Math.round(r.Re).toLocaleString()}</td>
      <td style="font-size:11px;color:var(--gray-500)">${r.regime}</td>
      <td style="font-family:var(--font-mono)">${r.f.toFixed(5)}</td>
      <td>${r.hf.toFixed(4)}</td>
      <td>${seg.K_total.toFixed(1)}</td>
      <td>${r.hm.toFixed(4)}</td>
      <td><strong>${r.ht.toFixed(4)}</strong></td>
      <td class="${vClass}" style="font-size:11px">${statusIcon}</td>
    </tr>`;
  });
  tableHtml += `</tbody><tfoot><tr>
    <td colspan="6">Σ Pérdidas totales</td>
    <td>${totalHf.toFixed(4)}</td><td>—</td>
    <td>${totalHm.toFixed(4)}</td>
    <td><strong>${totalH.toFixed(4)}</strong></td><td></td>
  </tr></tfoot></table>`;
  document.getElementById('hyd1-results-wrap').innerHTML = tableHtml;

  // ── Alerts ──
  document.getElementById('hyd1-alerts').innerHTML = [
    ...alerts.map(a => `<div class="alert ${a.startsWith('✗')?'alert-error':'alert-warn'}">${a}</div>`),
    alerts.length === 0 ? '<div class="alert alert-success">✓ Todas las velocidades dentro del rango NTC 1500 (0.5–2.5 m/s)</div>' : '',
  ].join('');

  // ── Bar chart ──
  document.getElementById('hyd1-chart-bars').innerHTML = svgBarChart(
    results.map((r, i) => ({
      label: segments[i].id,
      v1: r.hf, v2: r.hm,
      total: r.ht,
    })),
    { label1:'Fricción (hf)', label2:'Menores (hm)', color1:'#1e6dbf', color2:'#d4670a', width:700, height:260 }
  );

  // ── Gradient line ──
  document.getElementById('hyd1-chart-gradient').innerHTML = svgGradientLine(results, segments, totalH);

  document.getElementById('hyd1-output').style.display = 'block';
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
    { label:'TDH', value: TDH.toFixed(2), unit:'m c.a.', cls:'kpi-blue' },
    { label:'P. hidráulica', value: (P_hyd/1000).toFixed(3), unit:'kW', cls:'kpi-teal' },
    { label:'P. al freno', value: P_hp.toFixed(3), unit:'HP requeridos', cls:'kpi-orange' },
    { label:'Bomba comercial', value: pump.label, unit:'centrífuga', cls:'kpi-green' },
    { label:'NPSH disponible', value: NPSH.toFixed(2), unit:'m', cls: NPSH < 3 ? 'kpi-red' : 'kpi-green' },
    { label:'Eficiencia η', value: (eta*100).toFixed(0), unit:'%', cls:'kpi-blue' },
  ].map(k => `<div class="kpi-card ${k.cls}">
    <div class="kpi-label">${k.label}</div>
    <div class="kpi-value">${k.value}</div>
    <div class="kpi-unit">${k.unit}</div>
  </div>`).join('');

  // ── Alerts ──
  const alertsHtml = [
    NPSH < 3 ? '<div class="alert alert-error">⚠ NPSH disponible < 3 m — riesgo de cavitación. Revisar instalación de succión.</div>' : '',
    TDH > 30 ? '<div class="alert alert-warn">ℹ TDH > 30 m — verificar selección de bomba multietapa si es necesario.</div>' : '',
    '<div class="alert alert-success">✓ Bomba ' + pump.label + ' centrífuga es suficiente para abastecer el Piso 5.</div>',
  ].join('');
  document.getElementById('hyd2-alerts').innerHTML = alertsHtml;

  // ── Donut chart ──
  const slices = [
    { label:'Altura estática', value: dz,     color:'#1a4a7a' },
    { label:'Pérd. fricción',  value: (state.hyd1 ? state.hyd1.totalHf : losses * 0.7), color:'#1e6dbf' },
    { label:'Pérd. menores',   value: (state.hyd1 ? state.hyd1.totalHm : losses * 0.3), color:'#2e86de' },
    { label:'Presión req.',    value: pReq,    color:'#0d8a8a' },
  ];
  document.getElementById('hyd2-chart-donut').innerHTML = svgDonut(slices, TDH, 220, 220);

  // ── Pump card ──
  document.getElementById('hyd2-pump-card').innerHTML = `
    <div style="background:var(--blue-900);color:white;border-radius:var(--r-lg);padding:20px">
      <div style="font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Bomba Recomendada</div>
      <div style="font-size:32px;font-weight:700;letter-spacing:-1px">${pump.label}</div>
      <div style="font-size:14px;opacity:.8;margin-top:4px">Centrífuga monoetapa</div>
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px;font-size:13px">
        <div>TDH = <strong>${TDH.toFixed(2)} m</strong></div>
        <div>Q = <strong>${Q_ls.toFixed(3)} L/s</strong></div>
        <div>P freno = <strong>${P_hp.toFixed(3)} HP</strong></div>
        <div>NPSH disp. = <strong>${NPSH.toFixed(2)} m</strong></div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.2)">
          Precio ref. = <strong>${fmt(pump.cost)} COP</strong>
        </div>
      </div>
    </div>`;

  document.getElementById('hyd2-output').style.display = 'block';
  showToast('HYD-2 calculado — TDH: ' + TDH.toFixed(2) + ' m, Bomba: ' + pump.label);
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
      <th>Franja</th><th>Horas</th><th>Q (L/s)</th>
      <th>v montante (m/s)</th><th>Pérdidas (m)</th>
      <th>P piso 5 (m.c.a.)</th><th>Estado</th>
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
      <td class="${okCls}">${r.ok ? '✓ OK' : '✗ Insuficiente'}</td>
    </tr>`;
  });
  tHtml += '</tbody></table>';
  document.getElementById('hyd3-results-wrap').innerHTML = tHtml;

  // ── Valve interactive panel ──
  renderValvePanel(TDH, dz, href, Qref, Pmin);

  document.getElementById('hyd3-output').style.display = 'block';
  showToast('HYD-3 calculado — ' + rows.filter(r=>r.ok).length + '/7 franjas con presión suficiente');
}

// ── Valve panel (interactive) ─────────────────────────────────
function renderValvePanel(TDH, dz, href, Qref, Pmin) {
  const floors = [5,4,3,2,1];
  // Pressure at each floor without valve restrictions
  // Assume each floor taps ~20% of Q_design from the riser
  const Q_design = Qref;

  let html = '';
  floors.forEach(f => {
    const hPiso = (f-1) * 2.8 + 3.5; // elevation of this floor
    html += `<div class="valve-floor-row" id="vrow-${f}">
      <span class="floor-label">Piso ${f}</span>
      <input type="range" id="valve-${f}" min="0" max="100" value="100" step="5"
        oninput="updateValvePiso(${f},${TDH},${dz},${href},${Qref},${Pmin})">
      <span class="slider-val" id="valve-val-${f}">100%</span>
      <span id="valve-q-${f}" class="floor-q" style="font-size:12px;font-family:var(--font-mono)">—</span>
      <span id="valve-p-${f}" class="floor-p" style="font-size:12px;font-family:var(--font-mono)">—</span>
    </div>`;
  });
  document.getElementById('valve-rows').innerHTML = html;
  // Initial calc
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
    if (qEl) qEl.textContent = (r.Q_floor * 1000).toFixed(2) + ' L/s';
    if (pEl) {
      pEl.textContent = r.P.toFixed(2) + ' m';
      pEl.style.color = r.ok ? 'var(--green-500)' : 'var(--red-500)';
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
    } else if (p.item.startsWith('Tubería') || p.item.startsWith('Válvula') || p.item.startsWith('Codo') || p.item.startsWith('Tee') || p.item.startsWith('Redu')) {
      subtotal = p.price * p.qty;
    } else {
      subtotal = p.price * p.qty;
    }
    return { ...p, subtotal };
  });

  // Override pump line with selected pump cost
  // Find pump item or add it
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
    <thead><tr><th>Ítem</th><th>Und.</th><th>Precio unit. (COP)</th><th>Cantidad</th><th>Subtotal (COP)</th><th>%</th></tr></thead>
    <tbody>`;
  breakdown.forEach(b => {
    tHtml += `<tr>
      <td>${b.item}</td>
      <td style="color:var(--gray-500)">${b.unit}</td>
      <td style="font-family:var(--font-mono)">${fmt(b.price)}</td>
      <td>${b.qty}</td>
      <td style="font-family:var(--font-mono);font-weight:600">${fmt(b.subtotal)}</td>
      <td style="color:var(--gray-500)">${((b.subtotal/total)*100).toFixed(1)}%</td>
    </tr>`;
  });
  tHtml += `</tbody><tfoot><tr>
    <td colspan="4"><strong>TOTAL</strong></td>
    <td style="font-family:var(--font-mono)"><strong>${fmt(total)}</strong></td>
    <td></td>
  </tr></tfoot></table>`;
  document.getElementById('hyd4-results-wrap').innerHTML = tHtml;

  // ── Donut ──
  const colorPalette = ['#0c2340','#1a4a7a','#1e6dbf','#2e86de','#0d8a8a','#1a8a4a','#d4670a','#c0392b'];
  const grouped = groupCostItems(breakdown);
  document.getElementById('hyd4-chart-donut').innerHTML = svgDonut(
    grouped.map((g, i) => ({ label: g.label, value: g.total, color: colorPalette[i % colorPalette.length] })),
    total, 220, 220
  );

  // ── Total cards ──
  document.getElementById('hyd4-totals').innerHTML = `
    <div class="cost-total-card">
      <div class="label">Costo total del sistema</div>
      <div class="big-number" style="margin:12px 0">${fmt(total)}</div>
      <div style="font-size:13px;opacity:.7">COP (pesos colombianos)</div>
    </div>
    <div class="cost-total-card" style="background:linear-gradient(135deg,var(--teal-500),var(--blue-700))">
      <div class="label">Costo por apartamento</div>
      <div class="big-number" style="margin:12px 0">${fmt(Math.round(perApto))}</div>
      <div style="font-size:13px;opacity:.7">COP · 15 apartamentos</div>
    </div>`;

  document.getElementById('hyd4-output').style.display = 'block';
  showToast('HYD-4 calculado — Total: ' + fmt(total) + ' COP');
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

  lines.push('=== RESULTADOS DEL ANÁLISIS HIDRÁULICO ===');
  lines.push('Proyecto: Sistema Hidráulico — Edificio Residencial 5 Pisos, Bogotá D.C.');
  lines.push(`Fecha: ${now}`);
  lines.push('Autores: M.A. Casas · L.F. Lasso · I.D. Lora · N. Valencia');
  lines.push('Universidad de La Sabana — Ing. Química — Fenómenos de Transporte 2026');
  lines.push('');

  lines.push('── PARÁMETROS DEL EDIFICIO ──────────────────────────────────────────────');
  lines.push('Pisos: 5 | Aptos/piso: 3 | Personas/apto: 3 | Total: 45 hab.');
  lines.push('Consumo per cápita: 140 L/hab·día | Consumo total: 6,300 L/día');
  lines.push('Tanque de almacenamiento: 22,680 L (3 días + 20% seg.)');
  lines.push('Caudal de diseño: 2.30 L/s (225 UH → tabla Hunter / NTC 1500)');
  lines.push('Agua @ 15°C: ρ = 999.1 kg/m³, μ = 1.138×10⁻³ Pa·s');
  lines.push('Altitud Bogotá: 2,640 m.s.n.m. | P_atm = 74.66 kPa');
  lines.push('');

  if (state.hyd1) {
    lines.push('── PÉRDIDAS POR TRAMO (HYD-1) ──────────────────────────────────────────');
    lines.push('Tramo  | Q (L/s) | v (m/s) |   Re    |   f      | hf (m)  | ΣK  | hm (m)  | h_total (m)');
    lines.push('-'.repeat(90));
    state.hyd1.results.forEach((r, i) => {
      const s = DEFAULT_SEGMENTS[i];
      lines.push(
        `${s.id.padEnd(6)} | ${s.Q_ls.toFixed(3).padStart(7)} | ${r.v.toFixed(3).padStart(7)} | ${Math.round(r.Re).toLocaleString().padStart(7)} | ${r.f.toFixed(5)} | ${r.hf.toFixed(4).padStart(7)} | ${s.K_total.toFixed(1).padStart(3)} | ${r.hm.toFixed(4).padStart(7)} | ${r.ht.toFixed(4)}`
      );
    });
    lines.push('-'.repeat(90));
    lines.push(`${'TOTAL'.padEnd(6)} |         |         |         |          | ${state.hyd1.totalHf.toFixed(4).padStart(7)} |     | ${state.hyd1.totalHm.toFixed(4).padStart(7)} | ${state.hyd1.totalH.toFixed(4)}`);
    lines.push('');
  }

  if (state.hyd2) {
    lines.push('── DIMENSIONAMIENTO DE BOMBA (HYD-2) ───────────────────────────────────');
    lines.push(`Altura estática Δz          = ${state.hyd2.dz.toFixed(2)} m`);
    lines.push(`Pérdidas totales del sistema = ${state.hyd2.losses.toFixed(4)} m`);
    lines.push(`Presión requerida piso 5     = ${state.hyd2.pReq.toFixed(2)} m.c.a.`);
    lines.push(`TDH (Cabeza Dinámica Total)  = ${state.hyd2.TDH.toFixed(3)} m`);
    lines.push(`Potencia hidráulica          = ${(state.hyd2.P_hyd/1000).toFixed(3)} kW`);
    lines.push(`Potencia al freno (η=${state.hyd2.eta}) = ${state.hyd2.P_hp.toFixed(4)} HP requeridos`);
    lines.push(`Bomba seleccionada           = ${state.hyd2.pump.label} centrífuga`);
    lines.push(`NPSH disponible              = ${state.hyd2.NPSH.toFixed(3)} m`);
    lines.push('');
    lines.push(`VERIFICACIÓN: TDH = Δz + Σpérd + P_req`);
    lines.push(`  ${state.hyd2.TDH.toFixed(3)} = ${state.hyd2.dz.toFixed(2)} + ${state.hyd2.losses.toFixed(4)} + ${state.hyd2.pReq.toFixed(2)}`);
    lines.push('');
  }

  if (state.hyd3) {
    lines.push('── SIMULACIÓN HORARIA (HYD-3) ──────────────────────────────────────────');
    lines.push('Franja            | Horas | Q (L/s) | Pérdidas (m) | P_piso5 (m.c.a.) | Estado');
    lines.push('-'.repeat(80));
    state.hyd3.rows.forEach(r => {
      lines.push(`${r.label.padEnd(17)} | ${r.horas.padEnd(5)} | ${r.Q.toFixed(3).padStart(7)} | ${r.losses.toFixed(4).padStart(12)} | ${r.P5.toFixed(3).padStart(16)} | ${r.ok?'✓ OK':'✗ Insuficiente'}`);
    });
    lines.push('');
  }

  if (state.hyd4) {
    lines.push('── ESTIMACIÓN DE COSTOS (HYD-4) ────────────────────────────────────────');
    const groups = groupCostItems(state.hyd4.breakdown);
    groups.forEach(g => lines.push(`  ${g.label.padEnd(15)}: ${fmt(g.total).padStart(18)} COP  (${((g.total/state.hyd4.total)*100).toFixed(1)}%)`));
    lines.push('-'.repeat(52));
    lines.push(`  ${'TOTAL'.padEnd(15)}: ${fmt(state.hyd4.total).padStart(18)} COP`);
    lines.push(`  ${'Por apartamento'.padEnd(15)}: ${fmt(Math.round(state.hyd4.perApto)).padStart(18)} COP`);
    lines.push('');
  }

  lines.push('─────────────────────────────────────────────────────────────────────────');
  lines.push('Generado con Simulador Hidráulico — github.com/ismavid/hydraulic-building-simulator');

  const text = lines.join('\n');
  document.getElementById('export-text').value = text;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('✓ Resultados copiados al portapapeles'));
  } else {
    const ta = document.getElementById('export-text');
    ta.select();
    showToast('Selecciona el texto y copia manualmente (Ctrl+C)');
  }
}

// ══════════════════════════════════════════════════════════════
//  SVG HELPERS
// ══════════════════════════════════════════════════════════════

function svgBarChart(data, opts) {
  const W = opts.width || 700, H = opts.height || 260;
  const margin = { top:20, right:20, bottom:50, left:55 };
  const w = W - margin.left - margin.right;
  const h = H - margin.top - margin.bottom;
  const maxVal = Math.max(...data.map(d => d.total)) * 1.15 || 1;
  const bw = (w / data.length) * 0.7;
  const gap = w / data.length;

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">
    <defs>
      <linearGradient id="gb1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${opts.color1}" stop-opacity=".9"/>
        <stop offset="100%" stop-color="${opts.color1}" stop-opacity=".6"/>
      </linearGradient>
      <linearGradient id="gb2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${opts.color2}" stop-opacity=".9"/>
        <stop offset="100%" stop-color="${opts.color2}" stop-opacity=".6"/>
      </linearGradient>
    </defs>
    <g transform="translate(${margin.left},${margin.top})">`;

  // Y gridlines
  for (let i=0; i<=4; i++) {
    const yy = h - (i/4) * h;
    const val = (maxVal * i/4).toFixed(3);
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="-6" y="${yy+4}" text-anchor="end" font-size="10" fill="#6b7280">${val}</text>`;
  }

  // Bars
  data.forEach((d, i) => {
    const x = i * gap + gap * 0.15;
    const h1 = (d.v1 / maxVal) * h;
    const h2 = (d.v2 / maxVal) * h;
    s += `<rect x="${x}" y="${h - h1 - h2}" width="${bw*0.48}" height="${h1+h2}" fill="url(#gb1)" rx="2"/>`;
    s += `<rect x="${x + bw*0.52}" y="${h - h2}" width="${bw*0.48}" height="${h2}" fill="url(#gb2)" rx="2"/>`;
    s += `<text x="${x + bw*0.5}" y="${h + 16}" text-anchor="middle" font-size="11" font-weight="600" fill="#374151">${d.label}</text>`;
    if (d.total > 0.001) {
      s += `<text x="${x + bw*0.5}" y="${h - h1 - h2 - 4}" text-anchor="middle" font-size="9" fill="#374151">${d.total.toFixed(3)}</text>`;
    }
  });

  // Axes
  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#374151" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#374151" stroke-width="1.5"/>`;

  // Y axis label
  s += `<text transform="rotate(-90)" x="${-h/2}" y="-42" text-anchor="middle" font-size="11" fill="#6b7280">Pérdida (m c.a.)</text>`;

  // Legend
  s += `<rect x="${w-160}" y="-16" width="12" height="12" fill="${opts.color1}" rx="2"/>
    <text x="${w-145}" y="-6" font-size="10" fill="#374151">${opts.label1}</text>
    <rect x="${w-80}" y="-16" width="12" height="12" fill="${opts.color2}" rx="2"/>
    <text x="${w-65}" y="-6" font-size="10" fill="#374151">${opts.label2}</text>`;

  s += '</g></svg>';
  return s;
}

function svgGradientLine(results, segments, totalH) {
  const W = 680, H = 220;
  const margin = { top:20, right:20, bottom:40, left:55 };
  const w = W - margin.left - margin.right;
  const h = H - margin.top - margin.bottom;

  // cumulative distance and pressure
  let cumDist = 0, cumLoss = 0;
  const maxDist = segments.reduce((s, seg) => s + seg.L_m, 0) || 1;
  const maxP = totalH * 1.2 || 1;
  const points = [{ x: 0, y: totalH }];
  results.forEach((r, i) => {
    cumDist += segments[i].L_m;
    cumLoss += r.ht;
    points.push({ x: cumDist, y: totalH - cumLoss });
  });

  const px = d => (d.x / maxDist) * w;
  const py = d => h - (Math.max(0, d.y) / maxP) * h;
  const path = 'M ' + points.map(p => `${px(p)},${py(p)}`).join(' L ');

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">
    <g transform="translate(${margin.left},${margin.top})">`;

  // Grid
  for (let i=0; i<=4; i++) {
    const yy = (i/4) * h;
    const val = (maxP * (1 - i/4)).toFixed(2);
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="-6" y="${yy+4}" text-anchor="end" font-size="10" fill="#6b7280">${val}</text>`;
  }

  // Minimum pressure line
  const ymin = h - (10 / maxP) * h;
  s += `<line x1="0" y1="${ymin}" x2="${w}" y2="${ymin}" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="${w+2}" y="${ymin+4}" font-size="9" fill="#c0392b">P_mín</text>`;

  // Gradient line
  s += `<path d="${path}" fill="none" stroke="#1e6dbf" stroke-width="2.5" stroke-linejoin="round"/>`;
  // Points
  points.forEach(p => {
    s += `<circle cx="${px(p)}" cy="${py(p)}" r="4" fill="#1e6dbf" stroke="white" stroke-width="1.5"/>`;
  });

  // Axes
  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#374151" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#374151" stroke-width="1.5"/>`;
  s += `<text x="${w/2}" y="${h+30}" text-anchor="middle" font-size="11" fill="#6b7280">Distancia acumulada desde bomba (m)</text>`;
  s += `<text transform="rotate(-90)" x="${-h/2}" y="-42" text-anchor="middle" font-size="11" fill="#6b7280">Presión disponible (m c.a.)</text>`;
  s += '</g></svg>';
  return s;
}

function svgDonut(slices, total, W, H) {
  const cx = W/2, cy = H/2 - 20, R = Math.min(W,H)*0.32, r = R*0.55;
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
      fill="${sl.color}" opacity=".9">
      <title>${sl.label}: ${sl.value.toFixed(2)} m (${((sl.value/totalVal)*100).toFixed(1)}%)</title>
    </path>`;
    const ly = 12 + i * 18;
    legends += `<rect x="${W-110}" y="${ly-10}" width="12" height="12" fill="${sl.color}" rx="2"/>
      <text x="${W-94}" y="${ly}" font-size="10" fill="#374151">${sl.label} (${((sl.value/totalVal)*100).toFixed(0)}%)</text>`;
    angle += a;
  });

  const label = typeof total === 'number' ? total.toFixed(2) : total;
  return `<svg viewBox="0 0 ${W} ${H+40}" style="width:100%;max-width:${W}px">
    ${paths}
    <text x="${cx}" y="${cy}" text-anchor="middle" font-size="22" font-weight="700" fill="#0c2340">${label}</text>
    <text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="11" fill="#6b7280">m c.a. / total</text>
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

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">
    <g transform="translate(${margin.left},${margin.top})">`;

  // Q bars
  rows.forEach((r, i) => {
    const bh = (r.Q / maxQ) * h;
    const x = i * gap + gap * 0.2;
    const color = r.tipo==='Pico' ? '#1a4a7a' : r.tipo==='Normal' ? '#2e86de' : '#a8d4f5';
    s += `<rect x="${x}" y="${h-bh}" width="${bw}" height="${bh}" fill="${color}" rx="2" opacity=".85">
      <title>${r.label}: ${r.Q.toFixed(3)} L/s</title></rect>`;
    s += `<text x="${x+bw/2}" y="${h+14}" text-anchor="middle" font-size="9" fill="#374151" transform="rotate(-30,${x+bw/2},${h+14})">${r.horas}</text>`;
  });

  // Pressure line (right axis scaled to h)
  const pScale = v => h - ((v - minP) / (maxP - minP)) * h;
  const pPoints = rows.map((r, i) => `${i * gap + gap * 0.5},${pScale(r.P5)}`).join(' ');
  s += `<polyline points="${pPoints}" fill="none" stroke="#0d8a8a" stroke-width="2.5" stroke-linejoin="round"/>`;
  rows.forEach((r, i) => {
    s += `<circle cx="${i * gap + gap * 0.5}" cy="${pScale(r.P5)}" r="4" fill="${r.ok?'#0d8a8a':'#c0392b'}" stroke="white" stroke-width="1.5"/>`;
  });

  // Pmin line
  const yPmin = pScale(Pmin);
  s += `<line x1="0" y1="${yPmin}" x2="${w}" y2="${yPmin}" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="6,3"/>
    <text x="${w+4}" y="${yPmin+4}" font-size="9" fill="#c0392b">${Pmin}m</text>`;

  // Left axis (Q)
  for (let i=0; i<=3; i++) {
    const yy = h - (i/3)*h;
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="-6" y="${yy+4}" text-anchor="end" font-size="9" fill="#6b7280">${(maxQ*i/3).toFixed(2)}</text>`;
  }
  // Right axis (P)
  for (let i=0; i<=3; i++) {
    const yy = h - (i/3)*h;
    const pv = minP + (maxP - minP) * i/3;
    s += `<text x="${w+6}" y="${yy+4}" font-size="9" fill="#0d8a8a">${pv.toFixed(1)}</text>`;
  }

  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#374151" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#374151" stroke-width="1.5"/>`;
  s += `<text x="${w/2}" y="${h+44}" text-anchor="middle" font-size="10" fill="#6b7280">Franja horaria</text>`;
  s += `<text transform="rotate(-90)" x="${-h/2}" y="-40" text-anchor="middle" font-size="10" fill="#374151">Caudal (L/s)</text>`;
  s += `<text transform="rotate(90)" x="${h/2}" y="${-w-42}" text-anchor="middle" font-size="10" fill="#0d8a8a">Presión piso 5 (m.c.a.)</text>`;

  // Legend
  s += `<rect x="0" y="-22" width="10" height="10" fill="#1a4a7a" rx="1"/>
    <text x="14" y="-13" font-size="9" fill="#374151">Q pico</text>
    <rect x="60" y="-22" width="10" height="10" fill="#2e86de" rx="1"/>
    <text x="74" y="-13" font-size="9" fill="#374151">Q normal</text>
    <line x1="120" y1="-17" x2="140" y2="-17" stroke="#0d8a8a" stroke-width="2"/>
    <text x="144" y="-13" font-size="9" fill="#0d8a8a">P piso 5</text>`;

  s += '</g></svg>';
  return s;
}

function svgValveBar(results, Pmin) {
  const W=600, H=200, margin={top:20,right:30,bottom:40,left:55};
  const w=W-margin.left-margin.right, h=H-margin.top-margin.bottom;
  const maxP = Math.max(Pmin*1.5, ...results.map(r=>Math.max(0,r.P))) || 1;
  const bw = (w / results.length) * 0.6;
  const gap = w / results.length;

  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">
    <g transform="translate(${margin.left},${margin.top})">`;

  results.forEach((r, i) => {
    const bh = (Math.max(0,r.P) / maxP) * h;
    const x = i * gap + gap * 0.2;
    const color = r.ok ? '#1a8a4a' : '#c0392b';
    s += `<rect x="${x}" y="${h-bh}" width="${bw}" height="${bh}" fill="${color}" rx="3" opacity=".8"/>`;
    s += `<text x="${x+bw/2}" y="${h-bh-4}" text-anchor="middle" font-size="10" fill="#374151">${r.P.toFixed(1)}</text>`;
    s += `<text x="${x+bw/2}" y="${h+16}" text-anchor="middle" font-size="11" font-weight="600" fill="#374151">Piso ${r.f}</text>`;
  });

  const yPmin = h - (Pmin/maxP)*h;
  s += `<line x1="0" y1="${yPmin}" x2="${w}" y2="${yPmin}" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="${w+2}" y="${yPmin+4}" font-size="9" fill="#c0392b">P_mín</text>`;

  for (let i=0; i<=4; i++) {
    const yy = h - (i/4)*h;
    s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#e5e7eb"/>
      <text x="-6" y="${yy+4}" text-anchor="end" font-size="9" fill="#6b7280">${(maxP*i/4).toFixed(1)}</text>`;
  }
  s += `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#374151" stroke-width="1.5"/>
    <line x1="0" y1="0" x2="0" y2="${h}" stroke="#374151" stroke-width="1.5"/>`;
  s += `<text x="${w/2}" y="${h+32}" text-anchor="middle" font-size="10" fill="#6b7280">Presión disponible por piso (m c.a.)</text>`;
  s += '</g></svg>';
  return s;
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
  setTimeout(() => t.remove(), 2800);
}
