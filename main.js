/* ─────────────────────────────────────────────────────────────
   main.js  –  Interactive CO2 Emissions Chart (D3 v7)
   Features: country toggles, dual year-range slider,
             hover highlight + tooltip, animated transitions
───────────────────────────────────────────────────────────── */

// ── Color palette (matches Assignment 1) ─────────────────────
const COLOR = {
  "United States": "#1f77b4",
  "China":         "#d62728",
  "Germany":       "#2ca02c",
  "India":         "#ff7f0e",
  "Japan":         "#9467bd"
};

// ── Chart dimensions ─────────────────────────────────────────
const MARGIN = { top: 30, right: 30, bottom: 50, left: 80 };
let   WIDTH, HEIGHT;          // set from container

// ── State ────────────────────────────────────────────────────
let allData    = [];
let activeSet  = new Set();   // active countries
let yearMin    = 1990;
let yearMax    = 2019;
let hoveredCountry = null;

// ── D3 Selections / Scales ───────────────────────────────────
let svg, chartG, xScale, yScale, xAxis, yAxis, xAxisG, yAxisG;
let lineGen;
const tooltip = document.getElementById("tooltip");

// ═══════════════════════════════════════════════════════════════
// 1. LOAD DATA
// ═══════════════════════════════════════════════════════════════
d3.json("data/co2_data.json").then(data => {
  allData = data;

  // Initialise active set with all countries
  const countries = [...new Set(data.map(d => d.country))];
  countries.forEach(c => activeSet.add(c));

  buildToggles(countries);
  buildChart();
  setupSliders();
  updateChart(true);
}).catch(err => {
  console.error("Failed to load data:", err);
  document.getElementById("chart-container").innerHTML =
    `<p style="padding:40px;color:red;">Error loading data: ${err.message}</p>`;
});

// ═══════════════════════════════════════════════════════════════
// 2. COUNTRY TOGGLE BUTTONS
// ═══════════════════════════════════════════════════════════════
function buildToggles(countries) {
  const container = document.getElementById("country-toggles");
  countries.forEach(country => {
    const btn = document.createElement("button");
    btn.className  = "toggle-btn active";
    btn.style.setProperty("--color", COLOR[country] || "#888");
    btn.dataset.country = country;

    btn.innerHTML = `<span class="swatch"></span>${country}`;

    btn.addEventListener("click", () => {
      if (activeSet.has(country)) {
        if (activeSet.size === 1) return;   // keep at least one
        activeSet.delete(country);
        btn.className = "toggle-btn inactive";
      } else {
        activeSet.add(country);
        btn.className = "toggle-btn active";
      }
      updateChart(false);
    });

    container.appendChild(btn);
  });
}

// ═══════════════════════════════════════════════════════════════
// 3. BUILD SVG CHART SKELETON
// ═══════════════════════════════════════════════════════════════
function buildChart() {
  const container = document.getElementById("chart-container");
  const totalW    = container.clientWidth || 880;
  WIDTH  = totalW - MARGIN.left - MARGIN.right;
  HEIGHT = Math.min(420, Math.round(WIDTH * 0.48));

  svg = d3.select("#chart-container")
    .append("svg")
    .attr("viewBox", `0 0 ${totalW} ${HEIGHT + MARGIN.top + MARGIN.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  chartG = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // Scales
  xScale = d3.scaleLinear().domain([1990, 2019]).range([0, WIDTH]);
  yScale = d3.scaleLinear().domain([0, 14000]).range([HEIGHT, 0]);

  // Gridlines
  chartG.append("g").attr("class", "grid y-grid")
    .call(d3.axisLeft(yScale).tickSize(-WIDTH).tickFormat(""));

  // Axes
  xAxisG = chartG.append("g").attr("class", "axis x-axis")
    .attr("transform", `translate(0,${HEIGHT})`);
  yAxisG = chartG.append("g").attr("class", "axis y-axis");

  xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d")).ticks(10);
  yAxis = d3.axisLeft(yScale)
    .tickFormat(d => d === 0 ? "0" : (d / 1000).toFixed(0) + "k");

  xAxisG.call(xAxis);
  yAxisG.call(yAxis);

  // Axis labels
  chartG.append("text").attr("class", "y-axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -HEIGHT / 2).attr("y", -62)
    .attr("text-anchor", "middle")
    .text("CO₂ Emissions (kt)");

  chartG.append("text").attr("class", "y-axis-label")
    .attr("x", WIDTH / 2).attr("y", HEIGHT + 42)
    .attr("text-anchor", "middle")
    .text("Year");

  // Clip path so lines don't overflow
  svg.append("defs").append("clipPath").attr("id", "chart-clip")
    .append("rect").attr("width", WIDTH).attr("height", HEIGHT);

  // Groups for lines and dots (inside clip)
  chartG.append("g").attr("class", "lines-group")
    .attr("clip-path", "url(#chart-clip)");
  chartG.append("g").attr("class", "dots-group")
    .attr("clip-path", "url(#chart-clip)");

  // Invisible overlay for mouse tracking
  chartG.append("rect")
    .attr("class", "mouse-overlay")
    .attr("width", WIDTH).attr("height", HEIGHT)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mousemove", onMouseMove)
    .on("mouseleave", onMouseLeave);

  // Line generator
  lineGen = d3.line()
    .x(d => xScale(d.year))
    .y(d => yScale(d.emissions))
    .curve(d3.curveMonotoneX);
}

// ═══════════════════════════════════════════════════════════════
// 4. UPDATE CHART (filtered + animated)
// ═══════════════════════════════════════════════════════════════
function updateChart(initial) {
  const dur = initial ? 0 : 600;

  // Filter data
  const visible = allData.filter(d =>
    activeSet.has(d.country) &&
    d.year >= yearMin && d.year <= yearMax
  );

  // Group by country
  const grouped = d3.group(visible, d => d.country);

  // Update scales
  const yMax = d3.max(visible, d => d.emissions) || 1000;
  yScale.domain([0, yMax * 1.08]);
  xScale.domain([yearMin, yearMax]);

  // Update gridlines
  chartG.select(".y-grid")
    .transition().duration(dur)
    .call(d3.axisLeft(yScale).tickSize(-WIDTH).tickFormat(""));
  chartG.select(".y-grid").selectAll("line").attr("stroke", "#eee").attr("stroke-dasharray", "3,3");
  chartG.select(".y-grid").select(".domain").remove();

  // Update axes
  xAxisG.transition().duration(dur).call(xAxis);
  yAxisG.transition().duration(dur).call(yAxis);

  // ── Lines ────────────────────────────────────────────────
  const linesG = chartG.select(".lines-group");
  const lines  = linesG.selectAll(".country-line")
    .data([...grouped.entries()], d => d[0]);

  lines.enter()
    .append("path")
    .attr("class", "country-line")
    .attr("data-country", d => d[0])
    .attr("stroke", d => COLOR[d[0]] || "#888")
    .attr("d", d => lineGen(d[1]))
    .style("opacity", 0)
    .transition().duration(dur)
    .style("opacity", 1)
    .attr("d", d => lineGen(d[1]));

  lines.transition().duration(dur)
    .attr("d", d => lineGen(d[1]))
    .attr("stroke", d => COLOR[d[0]] || "#888")
    .style("opacity", 1);

  lines.exit().transition().duration(dur / 2)
    .style("opacity", 0).remove();

  // ── Dots (one per country for end-point label + hover area) ──
  const dotsG = chartG.select(".dots-group");
  const dotData = [];
  grouped.forEach((vals, country) => {
    vals.forEach(d => dotData.push({ ...d, country }));
  });

  const dots = dotsG.selectAll(".dot")
    .data(dotData, d => d.country + d.year);

  dots.enter()
    .append("circle")
    .attr("class", "dot")
    .attr("data-country", d => d.country)
    .attr("r", 0)
    .attr("cx", d => xScale(d.year))
    .attr("cy", d => yScale(d.emissions))
    .attr("fill", d => COLOR[d.country] || "#888")
    .on("mouseover", (event, d) => showTooltip(event, d))
    .on("mousemove", (event, d) => moveTooltip(event))
    .on("mouseleave",  () => hideTooltip())
    .transition().duration(dur)
    .attr("r", 3.5)
    .attr("cx", d => xScale(d.year))
    .attr("cy", d => yScale(d.emissions));

  dots.transition().duration(dur)
    .attr("cx", d => xScale(d.year))
    .attr("cy", d => yScale(d.emissions))
    .attr("r", 3.5);

  dots.exit().transition().duration(dur / 2)
    .attr("r", 0).remove();

  // Re-apply highlight state after update
  applyHighlight(hoveredCountry);
}

// ═══════════════════════════════════════════════════════════════
// 5. HOVER HIGHLIGHT
// ═══════════════════════════════════════════════════════════════
function applyHighlight(country) {
  chartG.selectAll(".country-line")
    .classed("dimmed",      d => country && d[0] !== country)
    .classed("highlighted", d => country && d[0] === country);

  chartG.selectAll(".dot")
    .classed("dimmed", d => country && d.country !== country);
}

function onMouseMove(event) {
  const [mx] = d3.pointer(event);
  const year = Math.round(xScale.invert(mx));

  // Find closest data point across visible countries
  const candidates = allData.filter(d =>
    activeSet.has(d.country) &&
    d.year === year &&
    d.year >= yearMin && d.year <= yearMax
  );
  if (!candidates.length) { hideTooltip(); return; }

  // Closest by y
  const [, my] = d3.pointer(event);
  const closest = candidates.reduce((a, b) =>
    Math.abs(yScale(a.emissions) - my) < Math.abs(yScale(b.emissions) - my) ? a : b
  );

  hoveredCountry = closest.country;
  applyHighlight(hoveredCountry);
  showTooltip(event, closest);
}

function onMouseLeave() {
  hoveredCountry = null;
  applyHighlight(null);
  hideTooltip();
}

// ═══════════════════════════════════════════════════════════════
// 6. TOOLTIP
// ═══════════════════════════════════════════════════════════════
function showTooltip(event, d) {
  tooltip.innerHTML = `
    <div class="tooltip-country" style="color:${COLOR[d.country] || '#fff'}">${d.country}</div>
    <div class="tooltip-year">${d.year}</div>
    <div class="tooltip-value">CO₂: <strong>${d3.format(",")(d.emissions)} kt</strong></div>
  `;
  tooltip.classList.remove("hidden");
  moveTooltip(event);
}

function moveTooltip(event) {
  const container = document.getElementById("chart-container");
  const rect      = container.getBoundingClientRect();
  let   x = event.clientX - rect.left + 14;
  let   y = event.clientY - rect.top  - 10;

  // Keep inside container
  const tipW = tooltip.offsetWidth;
  const tipH = tooltip.offsetHeight;
  if (x + tipW > rect.width  - 10) x = x - tipW - 28;
  if (y + tipH > rect.height - 10) y = rect.height - tipH - 10;

  tooltip.style.left = x + "px";
  tooltip.style.top  = y + "px";
}

function hideTooltip() {
  tooltip.classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════════
// 7. DUAL YEAR-RANGE SLIDER
// ═══════════════════════════════════════════════════════════════
function setupSliders() {
  const sliderMin   = document.getElementById("year-min");
  const sliderMax   = document.getElementById("year-max");
  const rangeLabel  = document.getElementById("year-range-label");
  const trackColor  = "#1a1a2e";

  function syncSliders() {
    let lo = parseInt(sliderMin.value);
    let hi = parseInt(sliderMax.value);
    if (lo > hi - 1) { lo = hi - 1; sliderMin.value = lo; }
    if (hi < lo + 1) { hi = lo + 1; sliderMax.value = hi; }

    yearMin = lo;
    yearMax = hi;
    rangeLabel.textContent = `${lo} – ${hi}`;

    // Visual track fill
    const pct1 = ((lo - 1990) / 29) * 100;
    const pct2 = ((hi - 1990) / 29) * 100;
    sliderMin.style.background =
      `linear-gradient(to right, #ddd ${pct1}%, ${trackColor} ${pct1}%, ${trackColor} ${pct2}%, #ddd ${pct2}%)`;
    sliderMax.style.background = "transparent";

    updateChart(false);
  }

  sliderMin.addEventListener("input", syncSliders);
  sliderMax.addEventListener("input", syncSliders);
  syncSliders();   // initial draw
}
