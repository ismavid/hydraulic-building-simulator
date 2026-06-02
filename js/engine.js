/**
 * engine.js — Hydraulic System Calculation Engine
 * Pure functions, no DOM dependencies.
 * Proyecto Final Fenómenos de Transporte — U. de La Sabana, 2026
 */
'use strict';

const HydEngine = (() => {

    const G = 9.81; // m/s²

    // ── Fluid properties ─────────────────────────────────────────────────────
    const FLUID = {
        rho: 999.1,        // kg/m³ at 15°C
        mu: 1.138e-3,      // Pa·s at 15°C
        Patm: 74660,       // Pa (Bogotá 2640 m.a.s.l.)
        Pvapor: 1705,      // Pa at 15°C
        eps_pvc: 1.5e-6    // m (PVC smooth pipe)
    };

    // ── Friction factor (Colebrook-White, Newton-Raphson) ─────────────────────
    function frictionFactor(Re, eps_m, D_m) {
        if (Re < 2300) return 64 / Re;
        const r = eps_m / (3.7 * D_m);
        
        // Initial guess for x = 1/sqrt(f) using Haaland equation
        let x = -1.8 * Math.log10(Math.pow(r, 1.11) + 6.9 / Re);
        if (isNaN(x) || x <= 0) x = 7.0; // fallback guess
        
        const ln10 = Math.log(10);
        for (let i = 0; i < 12; i++) {
            const term = r + 2.51 * x / Re;
            if (term <= 0) break;
            const F = x + 2 * Math.log10(term);
            const dF = 1 + 5.02 / (ln10 * (Re * r + 2.51 * x));
            const x_next = x - F / dF;
            if (Math.abs(x_next - x) < 1e-10) {
                x = x_next;
                break;
            }
            x = x_next;
        }
        return 1 / (x * x);
    }

    // ── Single segment analysis ───────────────────────────────────────────────
    function analyzeSegment(D_mm, L_m, Q_ls, K_total, fluid) {
        const f = fluid || FLUID;
        const D = D_mm / 1000;
        const Q = Q_ls / 1000; // m³/s
        const A = Math.PI * D * D / 4;
        const v = Q / A;
        const Re = f.rho * v * D / f.mu;
        const regime = Re < 2300 ? 'Laminar' : Re < 4000 ? 'Transición' : 'Turbulento';
        const fric = frictionFactor(Re, f.eps_pvc, D);
        const hf = fric * (L_m / D) * (v * v) / (2 * G);
        const hm = K_total * (v * v) / (2 * G);
        const ht = hf + hm;
        const velOk = v >= 0.5 && v <= 2.5;
        const velWarn = v < 0.5 ? 'low' : v > 2.5 ? 'high' : 'ok';
        return { v, Re, regime, f: fric, hf, hm, ht, velOk, velWarn };
    }

    // ── Full pipeline analysis ────────────────────────────────────────────────
    function analyzePipeline(segments, fluid) {
        let totalHf = 0, totalHm = 0;
        const results = segments.map(seg => {
            const r = analyzeSegment(seg.D_mm, seg.L_m, seg.Q_ls, seg.K_total, fluid);
            totalHf += r.hf;
            totalHm += r.hm;
            return { ...seg, ...r };
        });
        return { results, totalHf, totalHm, totalH: totalHf + totalHm };
    }

    // ── Pump TDH ──────────────────────────────────────────────────────────────
    function pumpTDH(dz_m, losses_m, p_req_mca) {
        return dz_m + losses_m + p_req_mca;
    }

    // ── Pump power ────────────────────────────────────────────────────────────
    function pumpPower(Q_ls, rho, TDH_m, eta) {
        const Q = Q_ls / 1000;
        const P_hyd = rho * G * Q * TDH_m; // W
        const P_brake = P_hyd / eta;
        const P_hp = P_brake / 745.7;
        return { P_hyd, P_brake, P_hp };
    }

    // ── NPSH available ────────────────────────────────────────────────────────
    function npshAvailable(fluid, dz_succ_m, hf_succ_m) {
        const f = fluid || FLUID;
        const Patm_m = f.Patm / (f.rho * G);
        const Pv_m = f.Pvapor / (f.rho * G);
        return Patm_m + dz_succ_m - hf_succ_m - Pv_m;
    }

    // ── Commercial pump selection ─────────────────────────────────────────────
    const PUMP_TIERS = [
        { hp: 0.5,  label: '0.5 HP', cost: 620000 },
        { hp: 0.75, label: '0.75 HP', cost: 720000 },
        { hp: 1.0,  label: '1 HP',   cost: 850000 },
        { hp: 1.5,  label: '1.5 HP', cost: 1200000 },
        { hp: 2.0,  label: '2 HP',   cost: 1650000 },
        { hp: 3.0,  label: '3 HP',   cost: 2400000 },
    ];
    function selectPump(P_hp_req) {
        return PUMP_TIERS.find(t => t.hp >= P_hp_req) || PUMP_TIERS[PUMP_TIERS.length - 1];
    }

    // ── Hourly average flow ───────────────────────────────────────────────────
    function hourlyQ(pct, Q_daily_ls_total, duration_h) {
        // Q_daily_ls_total = total daily volume in Litres
        // returns L/s average for this band
        return (pct * Q_daily_ls_total) / (duration_h * 3600);
    }

    // ── Scale losses quadratically ────────────────────────────────────────────
    function scaleLosses(h_ref_m, Q_new_ls, Q_ref_ls) {
        if (Q_ref_ls === 0) return 0;
        return h_ref_m * Math.pow(Q_new_ls / Q_ref_ls, 2);
    }

    // ── Pressure at top floor ─────────────────────────────────────────────────
    function pressureAtTop(TDH_m, dz_m, losses_m) {
        return TDH_m - dz_m - losses_m;
    }

    return {
        FLUID, G, PUMP_TIERS,
        frictionFactor, analyzeSegment, analyzePipeline,
        pumpTDH, pumpPower, npshAvailable, selectPump,
        hourlyQ, scaleLosses, pressureAtTop
    };
})();
