/* ═══════════════════════════════════════════════════════════
   main.js  –  CO2 Dashboard  (D3 v7)
   Views: main line chart · ranking bar chart · brush context
   Features: scrubber · playback · per-capita · annotations ·
             hover highlight · coordinated linked views
═══════════════════════════════════════════════════════════ */

// ── Constants ────────────────────────────────────────────────
const COLOR = {
  "United States": "#60a5fa",
  "China":         "#f87171",
  "Germany":       "#4ade80",
  "India":         "#fb923c",
  "Japan":         "#c084fc"
};

const EVENTS = [
  { year: 2001, label: "China WTO entry",    dy: -18 },
  { year: 2005, label: "US peak emissions",  dy: -18 },
  { year: 2008, label: "Financial crisis",   dy: 22  },
  { year: 2015, label: "Paris Agreement",    dy: -18 }
];

const MM  = { top: 28, right: 100, bottom: 36, left: 68 };
const BMM = { top: 6,  right: 100, bottom: 22, left: 68 };
const BAR = { top: 14, right: 14,  bottom: 14, left: 110 };

// ── State ────────────────────────────────────────────────────
let allData       = [];
let activeSet     = new Set();
let perCapita     = false;
let scrubYear     = 2005;
let brushDomain   = [1990, 2019];  // current zoom window
let hoveredCntry  = null;
let playing       = false;
let playTimer     = null;

// ── Cached DOM ───────────────────────────────────────────────
const tooltip         = document.getElementById("tooltip");
const scrubYearEl     = document.getElementById("scrubber-year-display");
const barYearLabel    = document.getElementById("bar-year-label");
const playBtn         = document.getElementById("play-btn");
const speedSelect     = document.getElementById("speed-select");
const btnAbsolute     = document.getElementById("btn-absolute");
const btnPercapita    = document.getElementById("btn-percapita");

// ── D3 chart state ───────────────────────────────────────────
let mainSvg, mainG, mainW, mainH;
let xMain, yMain, xMainAxis, yMainAxis, xMainG, yMainG;
let lineGen;

let brushSvg, brushG, brushW, brushH;
let xBrush, yBrush;
let d3brush;

let barSvg, barG, barW, barH;
let xBar, yBar;

// ══════════════════════════════════════════════════════════════
// 1. BOOT
// ══════════════════════════════════════════════════════════════
d3.json("data/co2_data.json").then(raw => {
  allData = raw;
  const countries = [...new Set(raw.map(d => d.country))];
  countries.forEach(c => activeSet.add(c));

  buildToggles(countries);
  initMainChart();
  initBrushChart();
  initBarChart();
  setupControls();

  updateMain(true);
  updateBrush();
  updateBar();
}).catch(err => {
  document.getElementById("main-chart-container").innerHTML =
    `<p style="padding:40px;color:#f87171">Error loading data: ${err}</p>`;
});

// ══════════════════════════════════════════════════════════════
// 2. DATA HELPERS
// ══════════════════════════════════════════════════════════════
function getValue(d) {
  // per-capita: kt → tonnes per person  (kt*1000 / pop_millions*1e6 = t/person)
  return perCapita ? (d.emissions * 1000) / (d.population * 1e6) : d.emissions;
}

function getLabel() {
  return perCapita ? "CO₂ per Capita (tonnes)" : "CO₂ Emissions (kt)";
}

function visibleData() {
  return allData.filter(d =>
    activeSet.has(d.country) &&
    d.year >= brushDomain[0] && d.year <= brushDomain[1]
  );
}

function allActiveData() {
  return allData.filter(d => activeSet.has(d.country));
}

// ══════════════════════════════════════════════════════════════
// 3. COUNTRY TOGGLE BUTTONS
// ══════════════════════════════════════════════════════════════
function buildToggles(countries) {
  const wrap = document.getElementById("country-toggles");
  countries.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "toggle-btn active";
    btn.style.setProperty("--color", COLOR[c] || "#888");
    btn.dataset.country = c;
    btn.innerHTML = `<span class="swatch"></span>${c}`;
    btn.addEventListener("click", () => {
      if (activeSet.has(c)) {
        if (activeSet.size === 1) return;
        activeSet.delete(c);
        btn.className = "toggle-btn inactive";
      } else {
        activeSet.add(c);
        btn.className = "toggle-btn active";
      }
      updateMain(false);
      updateBrush();
      updateBar();
    });
    wrap.appendChild(btn);
  });
}

// ══════════════════════════════════════════════════════════════
// 4. MAIN LINE CHART
// ══════════════════════════════════════════════════════════════
function initMainChart() {
  const el  = document.getElementById("main-chart-container");
  const tot = el.clientWidth || 700;
  mainW = tot - MM.left - MM.right;
  mainH = Math.min(380, Math.round(mainW * 0.5));

  mainSvg = d3.select("#main-chart-container").append("svg")
    .attr("viewBox", `0 0 ${tot} ${mainH + MM.top + MM.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  mainG = mainSvg.append("g").attr("transform", `translate(${MM.left},${MM.top})`);

  xMain = d3.scaleLinear().domain([1990, 2019]).range([0, mainW]);
  yMain = d3.scaleLinear().domain([0, 14000]).range([mainH, 0]);

  // Gridlines
  mainG.append("g").attr("class", "grid y-grid")
    .call(d3.axisLeft(yMain).tickSize(-mainW).tickFormat(""));

  // Axes
  xMainG = mainG.append("g").attr("class", "axis x-axis")
    .attr("transform", `translate(0,${mainH})`);
  yMainG = mainG.append("g").attr("class", "axis y-axis");

  xMainAxis = d3.axisBottom(xMain).tickFormat(d3.format("d")).ticks(8);
  yMainAxis = d3.axisLeft(yMain).ticks(6);

  xMainG.call(xMainAxis);
  yMainG.call(yMainAxis);

  // Axis labels
  mainG.append("text").attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -mainH / 2).attr("y", -54)
    .attr("text-anchor", "middle")
    .attr("id", "y-axis-label")
    .text(getLabel());

  // Clip path
  mainSvg.append("defs").append("clipPath").attr("id", "main-clip")
    .append("rect").attr("width", mainW).attr("height", mainH + 2).attr("y", -1);

  mainG.append("g").attr("class", "lines-group").attr("clip-path", "url(#main-clip)");
  mainG.append("g").attr("class", "events-group");
  mainG.append("g").attr("class", "labels-group");

  // Scrubber (drawn on top)
  mainG.append("line").attr("class", "scrubber-line").attr("id", "scrubber-line")
    .attr("y1", 0).attr("y2", mainH);
  mainG.append("circle").attr("class", "scrubber-handle").attr("id", "scrubber-handle")
    .attr("r", 6).attr("cy", mainH - 8);

  // Invisible drag overlay for scrubber
  mainG.append("rect")
    .attr("class", "mouse-overlay")
    .attr("width", mainW).attr("height", mainH)
    .attr("fill", "none").attr("pointer-events", "all")
    .call(d3.drag()
      .on("drag", (event) => {
        const x = Math.max(0, Math.min(mainW, event.x));
        const yr = Math.round(xMain.invert(x));
        setScrubYear(Math.max(brushDomain[0], Math.min(brushDomain[1], yr)));
      })
    )
    .on("mousemove", onMainMouseMove)
    .on("mouseleave", onMainMouseLeave);

  lineGen = d3.line()
    .x(d => xMain(d.year))
    .y(d => yMain(getValue(d)))
    .curve(d3.curveMonotoneX);
}

function updateMain(initial) {
  const dur = initial ? 0 : 500;
  const vis = visibleData();
  const grouped = d3.group(vis, d => d.country);

  // Rescale
  const yMax = d3.max(vis, d => getValue(d)) || 1;
  yMain.domain([0, yMax * 1.1]);
  xMain.domain(brushDomain);

  // Update Y tick format
  if (perCapita) {
    yMainAxis.tickFormat(d => d === 0 ? "0" : d.toFixed(1));
  } else {
    yMainAxis.tickFormat(d => d === 0 ? "0" : (d / 1000).toFixed(0) + "k");
  }

  // Grid
  mainG.select(".y-grid").transition().duration(dur)
    .call(d3.axisLeft(yMain).tickSize(-mainW).tickFormat(""));
  mainG.select(".y-grid").selectAll("line").attr("stroke-dasharray", "3,3");
  mainG.select(".y-grid").select(".domain").remove();

  // Axes
  xMainG.transition().duration(dur).call(xMainAxis);
  yMainG.transition().duration(dur).call(yMainAxis);
  mainG.select("#y-axis-label").text(getLabel());

  // ── Lines ──────────────────────────────────────────────────
  const linesG = mainG.select(".lines-group");
  const lines  = linesG.selectAll(".country-line")
    .data([...grouped.entries()], d => d[0]);

  const linesEnter = lines.enter().append("path")
    .attr("class", "country-line")
    .attr("data-country", d => d[0])
    .attr("stroke", d => COLOR[d[0]] || "#888")
    .attr("d", d => lineGen(d[1]));

  if (initial) {
    // Animated path reveal on first load
    linesEnter.each(function() {
      const len = this.getTotalLength();
      d3.select(this)
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", len)
        .transition().duration(1200).ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0)
        .on("end", function() {
          d3.select(this).attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
        });
    });
  } else {
    linesEnter.style("opacity", 0)
      .transition().duration(dur).style("opacity", 1);
  }

  lines.transition().duration(dur)
    .attr("d", d => lineGen(d[1]))
    .attr("stroke", d => COLOR[d[0]] || "#888")
    .style("opacity", 1);

  lines.exit().transition().duration(dur / 2).style("opacity", 0).remove();

  // ── End-of-line labels ─────────────────────────────────────
  const labelsG = mainG.select(".labels-group");
  const labelData = [...grouped.entries()].map(([country, vals]) => {
    const last = vals[vals.length - 1];
    return { country, val: getValue(last), year: last.year };
  });

  const lbls = labelsG.selectAll(".line-label").data(labelData, d => d.country);

  lbls.enter().append("text")
    .attr("class", "line-label")
    .attr("fill", d => COLOR[d.country] || "#888")
    .attr("dominant-baseline", "middle")
    .merge(lbls)
    .transition().duration(dur)
    .attr("x", d => xMain(d.year) + 6)
    .attr("y", d => yMain(d.val))
    .text(d => d.country.split(" ").pop()); // last word only

  lbls.exit().remove();

  // ── Event annotations ──────────────────────────────────────
  const evG = mainG.select(".events-group");
  evG.selectAll("*").remove();

  EVENTS.forEach(ev => {
    if (ev.year < brushDomain[0] || ev.year > brushDomain[1]) return;
    const x = xMain(ev.year);

    evG.append("line").attr("class", "annotation-line")
      .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", mainH);

    const g = evG.append("g").attr("class", "annotation-dot-group")
      .style("cursor", "pointer")
      .on("click", () => setScrubYear(ev.year));

    g.append("circle").attr("class", "annotation-dot")
      .attr("cx", x).attr("cy", ev.dy < 0 ? 4 : mainH - 4).attr("r", 4);

    g.append("text").attr("class", "annotation-label")
      .attr("x", x).attr("y", ev.dy < 0 ? ev.dy : mainH + Math.abs(ev.dy))
      .attr("text-anchor", "middle")
      .text(ev.label);
  });

  // ── Scrubber position ──────────────────────────────────────
  updateScrubberPos();
  applyHighlight(hoveredCntry);
}

function updateScrubberPos() {
  const x = xMain(Math.max(brushDomain[0], Math.min(brushDomain[1], scrubYear)));
  mainG.select("#scrubber-line").attr("x1", x).attr("x2", x);
  mainG.select("#scrubber-handle").attr("cx", x);
}

function setScrubYear(y) {
  scrubYear = y;
  scrubYearEl.textContent = y;
  barYearLabel.textContent = y;
  updateScrubberPos();
  updateBar();
}

// ══════════════════════════════════════════════════════════════
// 5. HOVER HIGHLIGHT
// ══════════════════════════════════════════════════════════════
function applyHighlight(country) {
  mainG.selectAll(".country-line")
    .classed("dimmed",      d => country && d[0] !== country)
    .classed("highlighted", d => country && d[0] === country);
  mainG.selectAll(".line-label")
    .style("opacity", d => (!country || d.country === country) ? 1 : 0.15);
}

function onMainMouseMove(event) {
  const [mx, my] = d3.pointer(event);
  const yr = Math.round(xMain.invert(mx));
  const candidates = visibleData().filter(d => d.year === yr);
  if (!candidates.length) { hideTooltip(); return; }

  const closest = candidates.reduce((a, b) =>
    Math.abs(yMain(getValue(a)) - my) < Math.abs(yMain(getValue(b)) - my) ? a : b
  );

  hoveredCntry = closest.country;
  applyHighlight(hoveredCntry);

  // Compute rank and share for enhanced tooltip
  const yearSlice  = visibleData().filter(d => d.year === yr);
  const total      = d3.sum(yearSlice, d => getValue(d));
  const sorted     = [...yearSlice].sort((a, b) => getValue(b) - getValue(a));
  const rank       = sorted.findIndex(d => d.country === closest.country) + 1;
  const share      = total > 0 ? ((getValue(closest) / total) * 100).toFixed(1) : "—";
  const valFmt     = perCapita
    ? getValue(closest).toFixed(2) + " t/person"
    : d3.format(",")(closest.emissions) + " kt";

  tooltip.innerHTML = `
    <div class="tooltip-country" style="color:${COLOR[closest.country]}">${closest.country}</div>
    <div class="tooltip-row">Year: <strong>${yr}</strong></div>
    <div class="tooltip-row">Emissions: <strong>${valFmt}</strong></div>
    <div class="tooltip-row">Rank: <strong>#${rank}</strong> &bull; <strong>${share}%</strong> of visible total</div>
  `;
  tooltip.classList.remove("hidden");
  moveTooltip(event, "main-chart-container");
}

function onMainMouseLeave() {
  hoveredCntry = null;
  applyHighlight(null);
  hideTooltip();
}

// ══════════════════════════════════════════════════════════════
// 6. BRUSH CONTEXT CHART
// ══════════════════════════════════════════════════════════════
function initBrushChart() {
  const el  = document.getElementById("brush-container");
  const tot = el.clientWidth || 700;
  brushW = tot - BMM.left - BMM.right;
  brushH = 50;

  brushSvg = d3.select("#brush-container").append("svg")
    .attr("viewBox", `0 0 ${tot} ${brushH + BMM.top + BMM.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  brushG = brushSvg.append("g").attr("transform", `translate(${BMM.left},${BMM.top})`);

  xBrush = d3.scaleLinear().domain([1990, 2019]).range([0, brushW]);
  yBrush = d3.scaleLinear().range([brushH, 0]);

  brushG.append("g").attr("class", "axis x-axis")
    .attr("transform", `translate(0,${brushH})`)
    .call(d3.axisBottom(xBrush).tickFormat(d3.format("d")).ticks(8));

  brushG.append("g").attr("class", "brush-lines");

  d3brush = d3.brushX()
    .extent([[0, 0], [brushW, brushH]])
    .on("brush end", onBrush);

  brushG.append("g").attr("class", "brush").call(d3brush);

  // Initial selection = full range
  brushG.select(".brush").call(d3brush.move, [xBrush(1990), xBrush(2019)]);
}

function updateBrush() {
  const ad = allActiveData();
  const grouped = d3.group(ad, d => d.country);
  const yMax = d3.max(ad, d => getValue(d)) || 1;
  yBrush.domain([0, yMax * 1.1]);

  const miniLine = d3.line()
    .x(d => xBrush(d.year))
    .y(d => yBrush(getValue(d)))
    .curve(d3.curveMonotoneX);

  const lG = brushG.select(".brush-lines");
  const paths = lG.selectAll(".brush-line").data([...grouped.entries()], d => d[0]);
  paths.enter().append("path").attr("class", "brush-line")
    .attr("stroke", d => COLOR[d[0]] || "#888")
    .merge(paths)
    .attr("d", d => miniLine(d[1]));
  paths.exit().remove();
}

function onBrush(event) {
  if (!event.selection) return;
  const [x0, x1] = event.selection;
  const y0 = Math.round(xBrush.invert(x0));
  const y1 = Math.round(xBrush.invert(x1));
  if (y0 === brushDomain[0] && y1 === brushDomain[1]) return;
  brushDomain = [y0, y1];
  // Clamp scrubYear to new domain
  scrubYear = Math.max(y0, Math.min(y1, scrubYear));
  updateMain(false);
  updateBar();
}

// ══════════════════════════════════════════════════════════════
// 7. RANKING BAR CHART
// ══════════════════════════════════════════════════════════════
function initBarChart() {
  const el  = document.getElementById("bar-chart-container");
  const tot = el.clientWidth || 300;
  barW = tot - BAR.left - BAR.right;
  barH = 220;

  barSvg = d3.select("#bar-chart-container").append("svg")
    .attr("viewBox", `0 0 ${tot} ${barH + BAR.top + BAR.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  barG = barSvg.append("g").attr("transform", `translate(${BAR.left},${BAR.top})`);

  xBar = d3.scaleLinear().range([0, barW]);
  yBar = d3.scaleBand().range([0, barH]).padding(0.25);

  barG.append("g").attr("class", "axis x-axis bar-x-axis")
    .attr("transform", `translate(0,${barH})`);
  barG.append("g").attr("class", "bars-group");
  barG.append("g").attr("class", "bar-labels-group");
}

function updateBar() {
  const yr = scrubYear;
  const slice = allData.filter(d => activeSet.has(d.country) && d.year === yr);
  const sorted = [...slice].sort((a, b) => getValue(b) - getValue(a));

  const xMax = d3.max(sorted, d => getValue(d)) || 1;
  xBar.domain([0, xMax * 1.1]);
  yBar.domain(sorted.map(d => d.country));

  // X axis
  barG.select(".bar-x-axis").transition().duration(400)
    .call(d3.axisBottom(xBar).ticks(4).tickFormat(
      perCapita ? d => d.toFixed(1) : d => (d / 1000).toFixed(0) + "k"
    ));

  // Bars
  const barsG = barG.select(".bars-group");
  const bars  = barsG.selectAll(".bar-rect").data(sorted, d => d.country);

  bars.enter().append("rect").attr("class", "bar-rect")
    .attr("fill", d => COLOR[d.country] || "#888")
    .attr("fill-opacity", 0.8)
    .attr("height", yBar.bandwidth())
    .attr("x", 0)
    .attr("width", 0)
    .attr("y", d => yBar(d.country))
    .merge(bars)
    .transition().duration(400)
    .attr("y", d => yBar(d.country))
    .attr("height", yBar.bandwidth())
    .attr("width", d => xBar(getValue(d)));

  bars.exit().remove();

  // Country labels (left)
  const lblsG = barG.select(".bar-labels-group");
  const lbls  = lblsG.selectAll(".bar-label-row").data(sorted, d => d.country);

  const lblEnter = lbls.enter().append("g").attr("class", "bar-label-row");
  lblEnter.append("text").attr("class", "bar-rank");
  lblEnter.append("text").attr("class", "bar-label-country");
  lblEnter.append("text").attr("class", "bar-label-value");

  const allLbls = lblEnter.merge(lbls);

  allLbls.transition().duration(400)
    .attr("transform", d => `translate(0,${yBar(d.country) + yBar.bandwidth() / 2})`);

  allLbls.select(".bar-rank")
    .attr("x", -BAR.left + 4).attr("dominant-baseline", "middle").attr("font-size", "10")
    .text((d, i) => `#${i + 1}`);

  allLbls.select(".bar-label-country")
    .attr("x", -BAR.left + 22).attr("dominant-baseline", "middle").attr("font-size", "11")
    .text(d => d.country);

  allLbls.select(".bar-label-value")
    .attr("x", d => xBar(getValue(d)) + 6).attr("dominant-baseline", "middle").attr("font-size", "10")
    .text(d => perCapita ? getValue(d).toFixed(2) + "t" : (getValue(d) / 1000).toFixed(1) + "k");

  lbls.exit().remove();
}

// ══════════════════════════════════════════════════════════════
// 8. PLAYBACK
// ══════════════════════════════════════════════════════════════
function startPlay() {
  playing = true;
  playBtn.innerHTML = "&#9646;&#9646;";
  playBtn.classList.add("playing");

  if (scrubYear >= brushDomain[1]) scrubYear = brushDomain[0];

  function tick() {
    if (scrubYear >= brushDomain[1]) {
      stopPlay();
      return;
    }
    scrubYear++;
    setScrubYear(scrubYear);
    const speed = parseInt(speedSelect.value);
    playTimer = setTimeout(tick, speed);
  }

  const speed = parseInt(speedSelect.value);
  playTimer = setTimeout(tick, speed);
}

function stopPlay() {
  playing = false;
  clearTimeout(playTimer);
  playBtn.innerHTML = "&#9654;";
  playBtn.classList.remove("playing");
}

// ══════════════════════════════════════════════════════════════
// 9. CONTROLS
// ══════════════════════════════════════════════════════════════
function setupControls() {
  playBtn.addEventListener("click", () => {
    if (playing) stopPlay(); else startPlay();
  });

  btnAbsolute.addEventListener("click", () => {
    if (!perCapita) return;
    perCapita = false;
    btnAbsolute.classList.add("active");
    btnPercapita.classList.remove("active");
    updateMain(false);
    updateBrush();
    updateBar();
  });

  btnPercapita.addEventListener("click", () => {
    if (perCapita) return;
    perCapita = true;
    btnPercapita.classList.add("active");
    btnAbsolute.classList.remove("active");
    updateMain(false);
    updateBrush();
    updateBar();
  });
}

// ══════════════════════════════════════════════════════════════
// 10. TOOLTIP HELPERS
// ══════════════════════════════════════════════════════════════
function moveTooltip(event, containerId) {
  const rect = document.getElementById(containerId).getBoundingClientRect();
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top  - 10;
  const tipW = tooltip.offsetWidth;
  const tipH = tooltip.offsetHeight;
  if (x + tipW > rect.width  - 10) x -= tipW + 28;
  if (y + tipH > rect.height - 10) y  = rect.height - tipH - 10;
  tooltip.style.left = x + "px";
  tooltip.style.top  = y + "px";
}

function hideTooltip() { tooltip.classList.add("hidden"); }
