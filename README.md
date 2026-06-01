# Simulador Hidráulico — Edificio Residencial 5 Pisos, Bogotá D.C.

Proyecto Final de **Fenómenos de Transporte** — Ingeniería Química  
Universidad de La Sabana · 2026

**Autores:** M.A. Casas Sierra · L.F. Lasso González · I.D. Lora García · N. Valencia Toledo  
**Docente:** Sandra Rodríguez

---

## 🔗 Demo en vivo

**[ismavid.github.io/hydraulic-building-simulator](https://ismavid.github.io/hydraulic-building-simulator)**

---

## Descripción

Simulador web completo para el diseño y análisis del sistema hidráulico de un edificio residencial de 5 pisos en Bogotá D.C. Incluye cuatro módulos encadenados:

| Módulo | Descripción |
|--------|-------------|
| **HYD-1** | Análisis de pérdidas hidráulicas (Darcy-Weisbach + Colebrook-White) |
| **HYD-2** | Dimensionamiento de bomba (TDH, potencia, NPSH, selección comercial) |
| **HYD-3** | Simulación horaria + control interactivo de válvulas por piso |
| **HYD-4** | Estimación de costos en COP (Colombia 2024-2025) |

### Características

- Todos los parámetros pre-cargados con valores del proyecto
- Tabla de tramos T1–T9 editable en el browser
- Gráficos SVG inline (barras, gradiente hidráulico, dona, combo)
- Verificación automática NTC 1500 (velocidades 0.5–2.5 m/s)
- Control interactivo de válvulas por piso con actualización en tiempo real
- Exportar resultados formateados para informe Word
- Sin dependencias externas — vanilla HTML/CSS/JS

### Especificaciones del edificio (por defecto)

- 5 pisos · 3 aptos/piso · 3 personas/apto = **45 habitantes**
- Consumo total: **6,300 L/día**
- Caudal de diseño: **2.30 L/s** (225 Unidades Hunter)
- Altura estática bomba→P5: **16.70 m**
- Tanque de almacenamiento: **22,680 L** (3 días + 20% seguridad)
- Agua a 15°C, Bogotá 2,640 m.s.n.m.

---

## Tecnologías

- HTML5 / CSS3 / JavaScript (ES6+)
- SVG para gráficos (sin librerías externas)
- GitHub Pages para despliegue

## Referencia normativa

- NTC 1500 (Código Colombiano de Fontanería)
- Método de Unidades Hunter para caudal de diseño
- Ecuación de Colebrook-White (Newton-Raphson) para factor de fricción
- Ecuación de Darcy-Weisbach para pérdidas por fricción
