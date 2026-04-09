/* ═══════════════════════════════════════════════════════════
   main.js  –  CO2 Dashboard V4  (D3 v7)
   Views: line/area chart · ranking bar · donut · world map
   V4: forecast · cumulative · region grouping · GDP intensity
       compare mode · fact cards · map legend · PNG export
═══════════════════════════════════════════════════════════ */

// ── Constants ────────────────────────────────────────────────
const COLOR = {
  "United States":  "#60a5fa","China":"#f87171","Germany":"#4ade80",
  "India":"#fb923c","Japan":"#c084fc","Russia":"#38bdf8",
  "Canada":"#fbbf24","South Korea":"#a3e635","United Kingdom":"#e879f9",
  "Brazil":"#34d399","Saudi Arabia":"#f97316"
};
const FLAGS = {
  "United States":"🇺🇸","China":"🇨🇳","Germany":"🇩🇪","India":"🇮🇳","Japan":"🇯🇵",
  "Russia":"🇷🇺","Canada":"🇨🇦","South Korea":"🇰🇷","United Kingdom":"🇬🇧",
  "Brazil":"🇧🇷","Saudi Arabia":"🇸🇦"
};
const ISO_NUM = {
  "United States":840,"China":156,"Germany":276,"India":356,"Japan":392,
  "Russia":643,"Canada":124,"South Korea":410,"United Kingdom":826,
  "Brazil":76,"Saudi Arabia":682
};
const REGIONS = {
  "United States":"Americas","Canada":"Americas","Brazil":"Americas",
  "China":"Asia","India":"Asia","Japan":"Asia","South Korea":"Asia","Saudi Arabia":"Asia",
  "Germany":"Europe","United Kingdom":"Europe","Russia":"Europe"
};
const REGION_COLOR = {"Americas":"#60a5fa","Asia":"#f87171","Europe":"#4ade80"};
const EVENTS = [
  {year:1991,label:"USSR collapse",dy:22},
  {year:1997,label:"Kyoto Protocol",dy:-18},
  {year:2001,label:"China WTO",dy:-18},
  {year:2005,label:"US peak",dy:-18},
  {year:2008,label:"Finance crisis",dy:22},
  {year:2015,label:"Paris Agreement",dy:-18},
  {year:2020,label:"COVID-19",dy:22}
];

const MM  = {top:28,right:110,bottom:36,left:68};
const BMM = {top:6,right:110,bottom:22,left:68};
const BAR = {top:14,right:14,bottom:14,left:120};

// ── State ────────────────────────────────────────────────────
let allData      = [];
let activeSet    = new Set();
let metricMode   = "absolute"; // "absolute" | "percapita" | "intensity"
let areaMode     = false;
let groupRegion  = false;
let compareMode  = false;
let compareSet   = new Set();
let scrubYear    = 2005;
let brushDomain  = [1990, 2030];
let hoveredCntry = null;
let playing      = false;
let playTimer    = null;
let worldTopo    = null;

// ── Cached DOM ───────────────────────────────────────────────
const tooltip        = document.getElementById("tooltip");
const scrubYearEl    = document.getElementById("scrubber-year-display");
const barYearLabel   = document.getElementById("bar-year-label");
const donutYearLabel = document.getElementById("donut-year-label");
const mapYearLabel   = document.getElementById("map-year-label");
const cumulativeEl   = document.getElementById("cumulative-value");
const playBtn        = document.getElementById("play-btn");
const speedSelect    = document.getElementById("speed-select");
const btnAbsolute    = document.getElementById("btn-absolute");
const btnPercapita   = document.getElementById("btn-percapita");
const btnIntensity   = document.getElementById("btn-intensity");
const btnLine        = document.getElementById("btn-line");
const btnArea        = document.getElementById("btn-area");
const btnRegion      = document.getElementById("btn-region");
const btnCompare     = document.getElementById("btn-compare");
const comparePanel   = document.getElementById("compare-panel");
const factCard       = document.getElementById("fact-card");

// ── D3 chart state ───────────────────────────────────────────
let mainSvg,mainG,mainW,mainH;
let xMain,yMain,xMainAxis,yMainAxis,xMainG,yMainG;
let lineGen,areaGen;
let brushSvg,brushG,brushW,brushH,xBrush,yBrush,d3brush;
let barSvg,barG,barW,barH,xBar,yBar;
let donutSvg,donutG,donutArcFn,donutOuterR,donutInnerR;
let mapSvg,mapG,mapProjection,mapPath,mapColorScale;
let mapLegendSvg,mapLegendScale,mapLegendAxis;

// ══════════════════════════════════════════════════════════════
// 1. BOOT
// ══════════════════════════════════════════════════════════════
Promise.all([
  d3.json("data/co2_data.json"),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
]).then(([raw,topo]) => {
  allData   = raw;
  worldTopo = topo;
  const countries = [...new Set(raw.map(d=>d.country))];
  countries.forEach(c=>activeSet.add(c));

  buildToggles(countries);
  initMainChart();
  initBrushChart();
  initBarChart();
  initDonutChart();
  initMapChart();
  setupControls();

  updateMain(true);
  updateBrush();
  updateBar();
  updateDonut();
  updateMap();
  updateCumulative();
}).catch(err=>{
  console.error(err);
  document.getElementById("main-chart-container").innerHTML=
    `<p style="padding:40px;color:#f87171">Error loading data: ${err}</p>`;
});

// ══════════════════════════════════════════════════════════════
// 2. DATA HELPERS
// ══════════════════════════════════════════════════════════════
function getValue(d){
  if(metricMode==="percapita") return (d.emissions*1000)/(d.population*1e6);
  if(metricMode==="intensity") return d.gdp>0 ? d.emissions/d.gdp : 0;
  return d.emissions;
}
function getLabel(){
  if(metricMode==="percapita") return "CO₂ per Capita (tonnes)";
  if(metricMode==="intensity") return "CO₂ Intensity (kt / B$)";
  return "CO₂ Emissions (kt)";
}
function fmtVal(v){
  if(metricMode==="percapita") return v.toFixed(2)+" t/person";
  if(metricMode==="intensity") return v.toFixed(2)+" kt/B$";
  return d3.format(",")(Math.round(v))+" kt";
}

function visibleData(){
  const base = groupRegion ? buildRegionData() : allData.filter(d=>activeSet.has(d.country));
  return base.filter(d=>d.year>=brushDomain[0]&&d.year<=brushDomain[1]);
}
function allActiveData(){
  return groupRegion ? buildRegionData() : allData.filter(d=>activeSet.has(d.country));
}
function getColor(key){ return groupRegion ? (REGION_COLOR[key]||"#888") : (COLOR[key]||"#888"); }

function buildRegionData(){
  const byRegionYear={};
  allData.filter(d=>activeSet.has(d.country)).forEach(d=>{
    const r=REGIONS[d.country]||"Other";
    const k=`${r}__${d.year}`;
    if(!byRegionYear[k]) byRegionYear[k]={country:r,year:d.year,emissions:0,population:0,gdp:0,forecast:d.forecast};
    byRegionYear[k].emissions+=d.emissions;
    byRegionYear[k].population+=d.population;
    byRegionYear[k].gdp+=d.gdp||0;
    if(d.forecast) byRegionYear[k].forecast=true;
  });
  return Object.values(byRegionYear);
}

// ══════════════════════════════════════════════════════════════
// 3. COUNTRY TOGGLE BUTTONS
// ══════════════════════════════════════════════════════════════
function buildToggles(countries){
  const wrap=document.getElementById("country-toggles");
  countries.forEach(c=>{
    const btn=document.createElement("button");
    btn.className="toggle-btn active";
    btn.style.setProperty("--color",COLOR[c]||"#888");
    btn.dataset.country=c;
    btn.innerHTML=`<span class="swatch"></span><span class="flag">${FLAGS[c]||""}</span>${c}`;
    btn.addEventListener("click",(e)=>onToggleClick(c,btn,e));
    wrap.appendChild(btn);
  });
}

function onToggleClick(c,btn,e){
  if(compareMode){
    if(compareSet.has(c)){
      compareSet.delete(c);
      btn.classList.remove("compare-selected");
    } else {
      if(compareSet.size>=2){
        // replace oldest
        const first=[...compareSet][0];
        compareSet.delete(first);
        document.querySelector(`[data-country="${first}"]`)?.classList.remove("compare-selected");
      }
      compareSet.add(c);
      btn.classList.add("compare-selected");
    }
    updateComparePanel();
    applyHighlight(null);
    return;
  }
  // fact card on long click / double click — show on single click if not toggling
  if(e.detail===2){
    showFactCard(c,btn);
    return;
  }
  if(activeSet.has(c)){
    if(activeSet.size===1) return;
    activeSet.delete(c);
    btn.className="toggle-btn inactive";
    btn.style.setProperty("--color",COLOR[c]||"#888");
    btn.innerHTML=`<span class="swatch"></span><span class="flag">${FLAGS[c]||""}</span>${c}`;
  } else {
    activeSet.add(c);
    btn.className="toggle-btn active";
    btn.style.setProperty("--color",COLOR[c]||"#888");
    btn.innerHTML=`<span class="swatch"></span><span class="flag">${FLAGS[c]||""}</span>${c}`;
  }
  updateMain(false);updateBrush();updateBar();updateDonut();updateMap();updateCumulative();
}

// ══════════════════════════════════════════════════════════════
// 4. MAIN CHART
// ══════════════════════════════════════════════════════════════
function initMainChart(){
  const el=document.getElementById("main-chart-container");
  const tot=el.clientWidth||700;
  mainW=tot-MM.left-MM.right;
  mainH=Math.min(380,Math.round(mainW*0.5));

  mainSvg=d3.select("#main-chart-container").append("svg")
    .attr("viewBox",`0 0 ${tot} ${mainH+MM.top+MM.bottom}`)
    .attr("preserveAspectRatio","xMidYMid meet");

  const defs=mainSvg.append("defs");
  defs.append("clipPath").attr("id","main-clip")
    .append("rect").attr("width",mainW).attr("height",mainH+2).attr("y",-1);

  // Per-country gradient fills
  [...Object.entries(COLOR),...Object.entries(REGION_COLOR)].forEach(([name,color])=>{
    const id=name.replace(/\s+/g,"-");
    const grad=defs.append("linearGradient").attr("id",`grad-${id}`)
      .attr("x1","0").attr("y1","0").attr("x2","0").attr("y2","1");
    grad.append("stop").attr("offset","0%").attr("stop-color",color).attr("stop-opacity",0.22);
    grad.append("stop").attr("offset","100%").attr("stop-color",color).attr("stop-opacity",0.01);
  });

  mainG=mainSvg.append("g").attr("transform",`translate(${MM.left},${MM.top})`);
  xMain=d3.scaleLinear().domain([1990,2030]).range([0,mainW]);
  yMain=d3.scaleLinear().domain([0,14000]).range([mainH,0]);

  mainG.append("g").attr("class","grid y-grid")
    .call(d3.axisLeft(yMain).tickSize(-mainW).tickFormat(""));

  xMainG=mainG.append("g").attr("class","axis x-axis").attr("transform",`translate(0,${mainH})`);
  yMainG=mainG.append("g").attr("class","axis y-axis");
  xMainAxis=d3.axisBottom(xMain).tickFormat(d3.format("d")).ticks(10);
  yMainAxis=d3.axisLeft(yMain).ticks(6);
  xMainG.call(xMainAxis);
  yMainG.call(yMainAxis);

  mainG.append("text").attr("class","axis-label")
    .attr("transform","rotate(-90)").attr("x",-mainH/2).attr("y",-54)
    .attr("text-anchor","middle").attr("id","y-axis-label").text(getLabel());

  mainG.append("g").attr("class","areas-group").attr("clip-path","url(#main-clip)");
  mainG.append("g").attr("class","stacked-group").attr("clip-path","url(#main-clip)");
  mainG.append("g").attr("class","lines-group").attr("clip-path","url(#main-clip)");
  mainG.append("g").attr("class","forecast-group").attr("clip-path","url(#main-clip)");
  mainG.append("g").attr("class","events-group");
  mainG.append("g").attr("class","labels-group");

  mainG.append("line").attr("class","scrubber-line").attr("id","scrubber-line").attr("y1",0).attr("y2",mainH);
  mainG.append("circle").attr("class","scrubber-handle").attr("id","scrubber-handle").attr("r",6).attr("cy",mainH-8);

  mainG.append("rect").attr("class","mouse-overlay")
    .attr("width",mainW).attr("height",mainH)
    .attr("fill","none").attr("pointer-events","all")
    .call(d3.drag().on("drag",(event)=>{
      const x=Math.max(0,Math.min(mainW,event.x));
      const yr=Math.round(xMain.invert(x));
      setScrubYear(Math.max(brushDomain[0],Math.min(brushDomain[1],yr)));
    }))
    .on("mousemove",onMainMouseMove)
    .on("mouseleave",onMainMouseLeave);

  lineGen=d3.line().x(d=>xMain(d.year)).y(d=>yMain(getValue(d))).curve(d3.curveMonotoneX);
  areaGen=d3.area().x(d=>xMain(d.year)).y0(mainH).y1(d=>yMain(getValue(d))).curve(d3.curveMonotoneX);
}

function updateMain(initial){
  const dur=initial?0:600;
  const ease=d3.easeCubicInOut;
  const vis=visibleData();
  const grouped=d3.group(vis,d=>d.country);

  const yMax=d3.max(vis,d=>getValue(d))||1;
  yMain.domain([0,yMax*1.1]);
  xMain.domain(brushDomain);

  if(metricMode==="percapita") yMainAxis.tickFormat(d=>d===0?"0":d.toFixed(1));
  else if(metricMode==="intensity") yMainAxis.tickFormat(d=>d===0?"0":d.toFixed(1));
  else yMainAxis.tickFormat(d=>d===0?"0":(d/1000).toFixed(0)+"k");

  mainG.select(".y-grid").transition().duration(dur).ease(ease)
    .call(d3.axisLeft(yMain).tickSize(-mainW).tickFormat(""));
  mainG.select(".y-grid").selectAll("line").attr("stroke-dasharray","3,3");
  mainG.select(".y-grid").select(".domain").remove();
  xMainG.transition().duration(dur).ease(ease).call(xMainAxis);
  yMainG.transition().duration(dur).ease(ease).call(yMainAxis);
  mainG.select("#y-axis-label").text(getLabel());

  if(areaMode) drawStackedArea(grouped,vis,dur,ease,initial);
  else drawLines(grouped,dur,ease,initial);

  // End labels
  const labelsG=mainG.select(".labels-group");
  const labelData=[...grouped.entries()].map(([country,vals])=>{
    const hist=vals.filter(d=>!d.forecast);
    const last=hist.length?hist[hist.length-1]:vals[vals.length-1];
    return {country,val:getValue(last),year:last.year};
  });
  const lbls=labelsG.selectAll(".line-label").data(labelData,d=>d.country);
  lbls.enter().append("text").attr("class","line-label")
    .attr("fill",d=>getColor(d.country)).attr("dominant-baseline","middle")
    .merge(lbls).transition().duration(dur).ease(ease)
    .attr("x",d=>xMain(d.year)+6).attr("y",d=>areaMode?mainH/2:yMain(d.val))
    .style("opacity",areaMode?0:1)
    .text(d=>d.country.split(" ").pop());
  lbls.exit().remove();

  // Forecast separator line at 2023
  mainG.select(".forecast-sep")?.remove();
  if(brushDomain[1]>2023&&brushDomain[0]<=2023){
    const x23=xMain(2023);
    mainG.append("line").attr("class","forecast-sep")
      .attr("x1",x23).attr("x2",x23).attr("y1",0).attr("y2",mainH);
    mainG.append("text").attr("class","forecast-label")
      .attr("x",x23+4).attr("y",10).text("Forecast →");
  }

  // Event annotations
  const evG=mainG.select(".events-group");
  evG.selectAll("*").remove();
  EVENTS.forEach(ev=>{
    if(ev.year<brushDomain[0]||ev.year>brushDomain[1]) return;
    const x=xMain(ev.year);
    evG.append("line").attr("class","annotation-line")
      .attr("x1",x).attr("x2",x).attr("y1",0).attr("y2",mainH);
    const g=evG.append("g").attr("class","annotation-dot-group")
      .style("cursor","pointer").on("click",()=>setScrubYear(ev.year));
    g.append("circle").attr("class","annotation-dot")
      .attr("cx",x).attr("cy",ev.dy<0?4:mainH-4).attr("r",4);
    g.append("text").attr("class","annotation-label")
      .attr("x",x).attr("y",ev.dy<0?ev.dy:mainH+Math.abs(ev.dy))
      .attr("text-anchor","middle").text(ev.label);
  });

  updateScrubberPos();
  if(compareMode&&compareSet.size>0){
    const arr=[...compareSet];
    mainG.selectAll(".country-line")
      .classed("dimmed",d=>!arr.includes(d[0]))
      .classed("highlighted",d=>arr.includes(d[0]));
  } else {
    applyHighlight(hoveredCntry);
  }
}

function drawLines(grouped,dur,ease,initial){
  mainG.select(".stacked-group").selectAll("*").remove();

  // Gradient areas
  const areasG=mainG.select(".areas-group");
  const areaPaths=areasG.selectAll(".country-area").data([...grouped.entries()].map(([k,v])=>[k,v.filter(d=>!d.forecast)]),d=>d[0]);
  areaPaths.enter().append("path").attr("class","country-area")
    .attr("fill",d=>`url(#grad-${d[0].replace(/\s+/g,"-")})`)
    .attr("d",d=>areaGen(d[1]))
    .merge(areaPaths).transition().duration(dur).ease(ease)
    .attr("d",d=>d[1].length?areaGen(d[1]):"");
  areaPaths.exit().transition().duration(dur/2).style("opacity",0).remove();

  // Historical lines
  const linesG=mainG.select(".lines-group");
  const histData=[...grouped.entries()].map(([k,v])=>[k,v.filter(d=>!d.forecast)]);
  const lines=linesG.selectAll(".country-line").data(histData,d=>d[0]);
  const linesEnter=lines.enter().append("path")
    .attr("class","country-line")
    .attr("data-country",d=>d[0])
    .attr("stroke",d=>getColor(d[0]))
    .attr("d",d=>lineGen(d[1]));
  if(initial){
    linesEnter.each(function(){
      const len=this.getTotalLength();
      d3.select(this).attr("stroke-dasharray",`${len} ${len}`).attr("stroke-dashoffset",len)
        .transition().duration(1600).ease(d3.easeCubicOut)
        .attr("stroke-dashoffset",0)
        .on("end",function(){d3.select(this).attr("stroke-dasharray",null).attr("stroke-dashoffset",null);});
    });
  } else {
    linesEnter.style("opacity",0).transition().duration(dur).ease(ease).style("opacity",1);
  }
  lines.transition().duration(dur).ease(ease)
    .attr("d",d=>d[1].length?lineGen(d[1]):"").attr("stroke",d=>getColor(d[0])).style("opacity",1);
  lines.exit().transition().duration(dur/2).style("opacity",0).remove();

  // Forecast dashed lines
  const fcastG=mainG.select(".forecast-group");
  const fcastData=[...grouped.entries()].map(([k,v])=>{
    const hist=v.filter(d=>!d.forecast);
    const fcast=v.filter(d=>d.forecast);
    // Connect: prepend last historical point
    const joined=hist.length&&fcast.length?[hist[hist.length-1],...fcast]:fcast;
    return [k,joined];
  }).filter(([,v])=>v.length>1);
  const flines=fcastG.selectAll(".forecast-line").data(fcastData,d=>d[0]);
  flines.enter().append("path").attr("class","forecast-line")
    .attr("stroke",d=>getColor(d[0]))
    .attr("d",d=>lineGen(d[1]))
    .merge(flines).transition().duration(dur).ease(ease)
    .attr("d",d=>d[1].length?lineGen(d[1]):"").attr("stroke",d=>getColor(d[0]));
  flines.exit().remove();
}

function drawStackedArea(grouped,vis,dur,ease,initial){
  mainG.select(".lines-group").selectAll(".country-line")
    .transition().duration(dur/2).style("opacity",0).remove();
  mainG.select(".areas-group").selectAll(".country-area")
    .transition().duration(dur/2).style("opacity",0).remove();
  mainG.select(".forecast-group").selectAll("*").remove();

  const countries=[...grouped.keys()];
  const years=[...new Set(vis.map(d=>d.year))].sort(d3.ascending);
  const wide=years.map(yr=>{
    const row={year:yr};
    countries.forEach(c=>{
      const rec=vis.find(d=>d.country===c&&d.year===yr);
      row[c]=rec?getValue(rec):0;
    });
    return row;
  });
  const stack=d3.stack().keys(countries).order(d3.stackOrderDescending)(wide);
  const yMax2=d3.max(stack[stack.length-1]||[[0,0]],d=>d[1])||1;
  yMain.domain([0,yMax2*1.05]);
  yMainG.transition().duration(dur).ease(ease).call(yMainAxis);
  mainG.select(".y-grid").transition().duration(dur).ease(ease)
    .call(d3.axisLeft(yMain).tickSize(-mainW).tickFormat(""));
  mainG.select(".y-grid").select(".domain").remove();

  const stackAreaGen=d3.area()
    .x(d=>xMain(d.data.year)).y0(d=>yMain(d[0])).y1(d=>yMain(d[1])).curve(d3.curveMonotoneX);
  const sg=mainG.select(".stacked-group");
  const paths=sg.selectAll(".stacked-area").data(stack,d=>d.key);
  const entered=paths.enter().append("path").attr("class","stacked-area")
    .attr("fill",d=>getColor(d.key)).attr("fill-opacity",0.75)
    .attr("stroke",d=>getColor(d.key)).attr("stroke-width",0.5);
  if(!initial) entered.style("opacity",0).transition().duration(dur).ease(ease).style("opacity",1);
  else entered.attr("d",d=>stackAreaGen(d));
  entered.merge(paths).transition().duration(dur).ease(ease).attr("d",d=>stackAreaGen(d));
  paths.exit().transition().duration(dur/2).style("opacity",0).remove();
}

function updateScrubberPos(){
  const x=xMain(Math.max(brushDomain[0],Math.min(brushDomain[1],scrubYear)));
  mainG.select("#scrubber-line").attr("x1",x).attr("x2",x);
  mainG.select("#scrubber-handle").attr("cx",x);
}

function setScrubYear(y){
  scrubYear=y;
  scrubYearEl.textContent=y;
  if(barYearLabel)   barYearLabel.textContent=y;
  if(donutYearLabel) donutYearLabel.textContent=y;
  if(mapYearLabel)   mapYearLabel.textContent=y;
  updateScrubberPos();
  updateBar();
  updateDonut();
  updateMap();
  updateCumulative();
}

// ══════════════════════════════════════════════════════════════
// 5. CUMULATIVE COUNTER
// ══════════════════════════════════════════════════════════════
function updateCumulative(){
  if(!cumulativeEl) return;
  const base=allData.filter(d=>activeSet.has(d.country)&&!d.forecast&&d.year>=brushDomain[0]&&d.year<=scrubYear);
  const total=d3.sum(base,d=>d.emissions);
  if(total>=1e6) cumulativeEl.textContent=(total/1e6).toFixed(2)+" Gt";
  else cumulativeEl.textContent=d3.format(",")(Math.round(total))+" kt";
}

// ══════════════════════════════════════════════════════════════
// 6. HOVER HIGHLIGHT
// ══════════════════════════════════════════════════════════════
function applyHighlight(country){
  mainG.selectAll(".country-line")
    .classed("dimmed",d=>country&&d[0]!==country)
    .classed("highlighted",d=>country&&d[0]===country);
  mainG.selectAll(".country-area")
    .style("opacity",d=>(!country||d[0]===country)?1:0.1);
  mainG.selectAll(".line-label")
    .style("opacity",d=>(!country||d.country===country)?1:0.15);
}

function onMainMouseMove(event){
  const [mx,my]=d3.pointer(event);
  const yr=Math.round(xMain.invert(mx));
  const candidates=visibleData().filter(d=>d.year===yr);
  if(!candidates.length){hideTooltip();return;}
  const closest=candidates.reduce((a,b)=>
    Math.abs(yMain(getValue(a))-my)<Math.abs(yMain(getValue(b))-my)?a:b);
  hoveredCntry=closest.country;
  if(!compareMode) applyHighlight(hoveredCntry);
  const yearSlice=visibleData().filter(d=>d.year===yr);
  const total=d3.sum(yearSlice,d=>getValue(d));
  const sorted=[...yearSlice].sort((a,b)=>getValue(b)-getValue(a));
  const rank=sorted.findIndex(d=>d.country===closest.country)+1;
  const share=total>0?((getValue(closest)/total)*100).toFixed(1):"—";
  const isForecast=!!closest.forecast;
  tooltip.innerHTML=`
    <div class="tooltip-country" style="color:${getColor(closest.country)}">${FLAGS[closest.country]||""} ${closest.country}${isForecast?' <em style="font-size:0.7em;color:#a78bfa">(forecast)</em>':''}</div>
    <div class="tooltip-row">Year: <strong>${yr}</strong></div>
    <div class="tooltip-row">Value: <strong>${fmtVal(getValue(closest))}</strong></div>
    <div class="tooltip-row">Rank: <strong>#${rank}</strong> &bull; <strong>${share}%</strong> of total</div>
  `;
  tooltip.classList.remove("hidden");
  moveTooltip(event,"main-chart-container");
}
function onMainMouseLeave(){hoveredCntry=null;if(!compareMode)applyHighlight(null);hideTooltip();}

// ══════════════════════════════════════════════════════════════
// 7. BRUSH CONTEXT CHART
// ══════════════════════════════════════════════════════════════
function initBrushChart(){
  const el=document.getElementById("brush-container");
  const tot=el.clientWidth||700;
  brushW=tot-BMM.left-BMM.right;
  brushH=50;
  brushSvg=d3.select("#brush-container").append("svg")
    .attr("viewBox",`0 0 ${tot} ${brushH+BMM.top+BMM.bottom}`)
    .attr("preserveAspectRatio","xMidYMid meet");
  brushG=brushSvg.append("g").attr("transform",`translate(${BMM.left},${BMM.top})`);
  xBrush=d3.scaleLinear().domain([1990,2030]).range([0,brushW]);
  yBrush=d3.scaleLinear().range([brushH,0]);
  brushG.append("g").attr("class","axis x-axis").attr("transform",`translate(0,${brushH})`)
    .call(d3.axisBottom(xBrush).tickFormat(d3.format("d")).ticks(10));
  brushG.append("g").attr("class","brush-lines");
  d3brush=d3.brushX().extent([[0,0],[brushW,brushH]]).on("brush end",onBrush);
  brushG.append("g").attr("class","brush").call(d3brush);
  brushG.select(".brush").call(d3brush.move,[xBrush(1990),xBrush(2030)]);
}
function updateBrush(){
  const ad=allActiveData();
  const grouped=d3.group(ad,d=>d.country);
  const yMax=d3.max(ad,d=>getValue(d))||1;
  yBrush.domain([0,yMax*1.1]);
  const miniLine=d3.line().x(d=>xBrush(d.year)).y(d=>yBrush(getValue(d))).curve(d3.curveMonotoneX);
  const lG=brushG.select(".brush-lines");
  const paths=lG.selectAll(".brush-line").data([...grouped.entries()],d=>d[0]);
  paths.enter().append("path").attr("class","brush-line")
    .attr("stroke",d=>getColor(d[0])).merge(paths).attr("d",d=>miniLine(d[1]));
  paths.exit().remove();
}
function onBrush(event){
  if(!event.selection) return;
  const [x0,x1]=event.selection;
  const y0=Math.round(xBrush.invert(x0));
  const y1=Math.round(xBrush.invert(x1));
  if(y0===brushDomain[0]&&y1===brushDomain[1]) return;
  brushDomain=[y0,y1];
  scrubYear=Math.max(y0,Math.min(y1,scrubYear));
  updateMain(false);updateBar();updateDonut();updateMap();updateCumulative();
}

// ══════════════════════════════════════════════════════════════
// 8. RANKING BAR CHART
// ══════════════════════════════════════════════════════════════
function initBarChart(){
  const el=document.getElementById("bar-chart-container");
  const tot=el.clientWidth||300;
  barW=tot-BAR.left-BAR.right;
  barH=320;
  barSvg=d3.select("#bar-chart-container").append("svg")
    .attr("viewBox",`0 0 ${tot} ${barH+BAR.top+BAR.bottom}`)
    .attr("preserveAspectRatio","xMidYMid meet");
  barG=barSvg.append("g").attr("transform",`translate(${BAR.left},${BAR.top})`);
  xBar=d3.scaleLinear().range([0,barW]);
  yBar=d3.scaleBand().range([0,barH]).padding(0.28);
  barG.append("g").attr("class","axis x-axis bar-x-axis").attr("transform",`translate(0,${barH})`);
  barG.append("g").attr("class","bars-group");
  barG.append("g").attr("class","bar-labels-group");
}
function updateBar(){
  const yr=scrubYear;
  const base=groupRegion?buildRegionData():allData.filter(d=>activeSet.has(d.country));
  const slice=base.filter(d=>d.year===yr);
  const sorted=[...slice].sort((a,b)=>getValue(b)-getValue(a));
  const xMax=d3.max(sorted,d=>getValue(d))||1;
  xBar.domain([0,xMax*1.1]);
  yBar.domain(sorted.map(d=>d.country));
  barG.select(".bar-x-axis").transition().duration(500).ease(d3.easeCubicInOut)
    .call(d3.axisBottom(xBar).ticks(4).tickFormat(v=>
      metricMode==="percapita"?v.toFixed(1):metricMode==="intensity"?v.toFixed(1):(v/1000).toFixed(0)+"k"));
  const barsG=barG.select(".bars-group");
  const bars=barsG.selectAll(".bar-rect").data(sorted,d=>d.country);
  bars.enter().append("rect").attr("class","bar-rect")
    .attr("fill",d=>getColor(d.country)).attr("fill-opacity",0.82).attr("rx",3)
    .attr("height",yBar.bandwidth()).attr("x",0).attr("width",0).attr("y",d=>yBar(d.country))
    .merge(bars).transition().duration(500).ease(d3.easeCubicInOut)
    .attr("y",d=>yBar(d.country)).attr("height",yBar.bandwidth()).attr("width",d=>xBar(getValue(d)));
  bars.exit().remove();
  const lblsG=barG.select(".bar-labels-group");
  const lbls=lblsG.selectAll(".bar-label-row").data(sorted,d=>d.country);
  const lblEnter=lbls.enter().append("g").attr("class","bar-label-row");
  lblEnter.append("text").attr("class","bar-rank");
  lblEnter.append("text").attr("class","bar-flag");
  lblEnter.append("text").attr("class","bar-label-country");
  lblEnter.append("text").attr("class","bar-label-value");
  const allLbls=lblEnter.merge(lbls);
  allLbls.transition().duration(500).ease(d3.easeCubicInOut)
    .attr("transform",d=>`translate(0,${yBar(d.country)+yBar.bandwidth()/2})`);
  allLbls.select(".bar-rank").attr("x",-BAR.left+4).attr("dominant-baseline","middle").attr("font-size","10").text((_,i)=>`#${i+1}`);
  allLbls.select(".bar-flag").attr("x",-BAR.left+22).attr("dominant-baseline","middle").attr("font-size","13").text(d=>groupRegion?"":FLAGS[d.country]||"");
  allLbls.select(".bar-label-country").attr("x",-BAR.left+38).attr("dominant-baseline","middle").attr("font-size","11").text(d=>d.country);
  allLbls.select(".bar-label-value").attr("x",d=>xBar(getValue(d))+6).attr("dominant-baseline","middle").attr("font-size","10")
    .text(d=>fmtVal(getValue(d)));
  lbls.exit().remove();
}

// ══════════════════════════════════════════════════════════════
// 9. DONUT CHART
// ══════════════════════════════════════════════════════════════
function initDonutChart(){
  const el=document.getElementById("donut-container");
  const sz=Math.min(el.clientWidth||200,200);
  donutOuterR=sz/2-6;
  donutInnerR=donutOuterR*0.52;
  donutSvg=d3.select("#donut-container").append("svg")
    .attr("viewBox",`0 0 ${sz} ${sz}`).attr("preserveAspectRatio","xMidYMid meet");
  donutG=donutSvg.append("g").attr("transform",`translate(${sz/2},${sz/2})`);
  donutArcFn=d3.arc().innerRadius(donutInnerR).outerRadius(donutOuterR);
  donutG.append("text").attr("class","donut-total-label").attr("text-anchor","middle").attr("dy","-0.3em");
  donutG.append("text").attr("class","donut-total-sub").attr("text-anchor","middle").attr("dy","1.1em");
}
function updateDonut(){
  const yr=scrubYear;
  const base=groupRegion?buildRegionData():allData.filter(d=>activeSet.has(d.country));
  const slice=base.filter(d=>d.year===yr);
  const total=d3.sum(slice,d=>getValue(d));
  const pie=d3.pie().value(d=>getValue(d)).sort(null)(slice);
  const arcs=donutG.selectAll(".donut-arc").data(pie,d=>d.data.country);
  const entered=arcs.enter().append("path").attr("class","donut-arc")
    .attr("fill",d=>getColor(d.data.country)).attr("stroke","#131326").attr("stroke-width",1.5)
    .each(function(d){this._current=d;}).attr("d",donutArcFn);
  entered.merge(arcs).transition().duration(600).ease(d3.easeCubicInOut)
    .attrTween("d",function(d){
      const i=d3.interpolate(this._current,d);this._current=i(0);return t=>donutArcFn(i(t));
    });
  arcs.exit().transition().duration(300).style("opacity",0).remove();
  const fmt=metricMode==="percapita"?total.toFixed(1)+" t":metricMode==="intensity"?total.toFixed(1)+" kt/B$":(total/1000).toFixed(0)+"k kt";
  donutG.select(".donut-total-label").text(fmt);
  donutG.select(".donut-total-sub").text("total");
  donutG.selectAll(".donut-arc")
    .on("mouseover",function(event,d){
      d3.select(this).attr("stroke-width",2.5).attr("stroke","#fff");
      const share=total>0?((getValue(d.data)/total)*100).toFixed(1):"—";
      tooltip.innerHTML=`<div class="tooltip-country" style="color:${getColor(d.data.country)}">${FLAGS[d.data.country]||""} ${d.data.country}</div><div class="tooltip-row">Share: <strong>${share}%</strong></div>`;
      tooltip.classList.remove("hidden");
      moveTooltip(event,"donut-container");
    })
    .on("mouseout",function(){d3.select(this).attr("stroke-width",1.5).attr("stroke","#131326");hideTooltip();});
}

// ══════════════════════════════════════════════════════════════
// 10. WORLD MAP + LEGEND
// ══════════════════════════════════════════════════════════════
function initMapChart(){
  const el=document.getElementById("map-container");
  const w=el.clientWidth||900;
  const h=Math.round(w*0.45);
  mapSvg=d3.select("#map-container").append("svg")
    .attr("viewBox",`0 0 ${w} ${h}`).attr("preserveAspectRatio","xMidYMid meet");
  mapG=mapSvg.append("g");
  mapProjection=d3.geoNaturalEarth1().scale(w/6.3).translate([w/2,h/2]);
  mapPath=d3.geoPath().projection(mapProjection);
  mapColorScale=d3.scaleSequential(d3.interpolateYlOrRd).domain([0,1]);

  if(!worldTopo) return;
  const countries=topojson.feature(worldTopo,worldTopo.objects.countries);
  mapG.selectAll(".country-path").data(countries.features).enter().append("path")
    .attr("class",d=>{const name=getCountryNameFromId(+d.id);return "country-path"+(name?" has-data":"");})
    .attr("d",mapPath).attr("fill","#1e1e3a").attr("stroke","#2a2a4a").attr("stroke-width",0.4)
    .on("mouseover",function(event,d){
      const name=getCountryNameFromId(+d.id);
      if(!name) return;
      const rec=allData.find(r=>r.country===name&&r.year===scrubYear);
      if(!rec) return;
      d3.select(this).attr("stroke","#fff").attr("stroke-width",1.2);
      tooltip.innerHTML=`<div class="tooltip-country" style="color:${COLOR[name]}">${FLAGS[name]||""} ${name}</div><div class="tooltip-row">CO₂: <strong>${fmtVal(getValue(rec))}</strong></div>`;
      tooltip.classList.remove("hidden");
      moveTooltip(event,"map-container");
    })
    .on("mouseout",function(){d3.select(this).attr("stroke","#2a2a4a").attr("stroke-width",0.4);hideTooltip();});

  // Map legend
  initMapLegend(w);
}

function initMapLegend(mapW){
  const lW=200,lH=10,margin={left:60,right:60,top:4,bottom:18};
  mapLegendSvg=d3.select("#map-container").append("svg")
    .attr("width",lW+margin.left+margin.right).attr("height",lH+margin.top+margin.bottom)
    .attr("class","map-legend-svg");

  const defs=mapLegendSvg.append("defs");
  const grad=defs.append("linearGradient").attr("id","legend-grad").attr("x1","0%").attr("x2","100%");
  const stops=d3.range(0,1.01,0.1);
  stops.forEach(t=>grad.append("stop").attr("offset",`${t*100}%`).attr("stop-color",d3.interpolateYlOrRd(t)));

  mapLegendSvg.append("rect")
    .attr("x",margin.left).attr("y",margin.top).attr("width",lW).attr("height",lH)
    .attr("fill","url(#legend-grad)").attr("rx",2);

  mapLegendScale=d3.scaleLinear().range([0,lW]);
  mapLegendAxis=d3.axisBottom(mapLegendScale).ticks(4)
    .tickFormat(v=>metricMode==="percapita"?v.toFixed(1):metricMode==="intensity"?v.toFixed(1):(v/1000).toFixed(0)+"k");

  mapLegendSvg.append("g").attr("class","legend-axis")
    .attr("transform",`translate(${margin.left},${margin.top+lH})`);

  mapLegendSvg.append("text").attr("class","legend-title")
    .attr("x",margin.left+lW/2).attr("y",margin.top+lH+margin.bottom-2)
    .attr("text-anchor","middle").attr("font-size","9px").attr("fill","#7070a0")
    .text(getLabel());
}

function updateMapLegend(maxVal){
  if(!mapLegendSvg) return;
  mapLegendScale.domain([0,maxVal]);
  mapLegendAxis.tickFormat(v=>metricMode==="percapita"?v.toFixed(1):metricMode==="intensity"?v.toFixed(1):(v/1000).toFixed(0)+"k");
  mapLegendSvg.select(".legend-axis").transition().duration(400).call(mapLegendAxis);
  mapLegendSvg.select(".legend-axis").selectAll("line,path").attr("stroke","#7070a0");
  mapLegendSvg.select(".legend-axis").selectAll("text").attr("fill","#7070a0").attr("font-size","9px");
  mapLegendSvg.select(".legend-title").text(getLabel());
}

function getCountryNameFromId(numId){
  return Object.entries(ISO_NUM).find(([,v])=>v===numId)?.[0]||null;
}
function updateMap(){
  if(!worldTopo) return;
  const yr=scrubYear;
  const slice=allData.filter(d=>activeSet.has(d.country)&&d.year===yr);
  const maxVal=d3.max(slice,d=>getValue(d))||1;
  mapColorScale.domain([0,maxVal]);
  updateMapLegend(maxVal);
  const byId={};
  slice.forEach(d=>{const id=ISO_NUM[d.country];if(id!==undefined)byId[id]=getValue(d);});
  mapG.selectAll(".country-path").transition().duration(400).ease(d3.easeCubicInOut)
    .attr("fill",function(d){
      const v=byId[+d.id];
      if(v===undefined) return "#1e1e3a";
      return activeSet.has(getCountryNameFromId(+d.id))?mapColorScale(v):"#1e1e3a";
    });
}

// ══════════════════════════════════════════════════════════════
// 11. COMPARE MODE
// ══════════════════════════════════════════════════════════════
function updateComparePanel(){
  if(!comparePanel) return;
  if(compareSet.size===0){comparePanel.classList.add("hidden");return;}
  comparePanel.classList.remove("hidden");
  const countries=[...compareSet];
  comparePanel.innerHTML=`<div class="compare-grid">${countries.map(c=>buildStatCard(c)).join("")}</div>`;
}

function buildStatCard(country){
  const recs=allData.filter(d=>d.country===country&&!d.forecast);
  const peak=recs.reduce((a,b)=>b.emissions>a.emissions?b:a,recs[0]||{emissions:0,year:"—"});
  const rec2023=recs.find(d=>d.year===2023)||recs[recs.length-1];
  const rec1990=recs.find(d=>d.year===1990)||recs[0];
  const pct=rec1990&&rec1990.emissions>0?((rec2023.emissions-rec1990.emissions)/rec1990.emissions*100).toFixed(1):"—";
  const sign=pct>0?"+":"";
  const pc=rec2023?(rec2023.emissions*1000)/(rec2023.population*1e6):0;
  const color=COLOR[country]||"#888";
  return `
    <div class="stat-card">
      <div class="stat-card-header" style="color:${color}">${FLAGS[country]||""} ${country}</div>
      <div class="stat-row"><span>Peak</span><strong>${d3.format(",")(peak.emissions)} kt (${peak.year})</strong></div>
      <div class="stat-row"><span>2023</span><strong>${d3.format(",")(rec2023?.emissions||0)} kt</strong></div>
      <div class="stat-row"><span>vs 1990</span><strong>${sign}${pct}%</strong></div>
      <div class="stat-row"><span>Per capita 2023</span><strong>${pc.toFixed(2)} t/person</strong></div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// 12. FACT CARD
// ══════════════════════════════════════════════════════════════
function showFactCard(country,btn){
  if(!factCard) return;
  const recs=allData.filter(d=>d.country===country&&!d.forecast);
  const peak=recs.reduce((a,b)=>b.emissions>a.emissions?b:a,recs[0]||{emissions:0,year:"—"});
  const rec2023=recs.find(d=>d.year===2023)||recs[recs.length-1];
  const rec1990=recs.find(d=>d.year===1990)||recs[0];
  const pct=rec1990&&rec1990.emissions>0?((rec2023.emissions-rec1990.emissions)/rec1990.emissions*100).toFixed(1):"—";
  const sign=pct>0?"+":"";
  const pc23=rec2023?(rec2023.emissions*1000)/(rec2023.population*1e6):0;
  const cumulative=d3.sum(recs,d=>d.emissions);
  const color=COLOR[country]||"#888";
  document.getElementById("fact-content").innerHTML=`
    <div class="fact-header" style="color:${color}">${FLAGS[country]||""} ${country}</div>
    <div class="fact-row"><span>Peak emissions</span><strong>${d3.format(",")(peak.emissions)} kt in ${peak.year}</strong></div>
    <div class="fact-row"><span>2023 emissions</span><strong>${d3.format(",")(rec2023?.emissions||0)} kt</strong></div>
    <div class="fact-row"><span>Change vs 1990</span><strong>${sign}${pct}%</strong></div>
    <div class="fact-row"><span>Per capita (2023)</span><strong>${pc23.toFixed(2)} t/person</strong></div>
    <div class="fact-row"><span>Cumulative 1990–2023</span><strong>${(cumulative/1e6).toFixed(2)} Gt</strong></div>
  `;
  factCard.classList.remove("hidden");
  // Position near button
  const r=btn.getBoundingClientRect();
  factCard.style.top=(r.bottom+8+window.scrollY)+"px";
  factCard.style.left=Math.min(r.left,window.innerWidth-260)+"px";
}

function closeFactCard(){if(factCard)factCard.classList.add("hidden");}

// ══════════════════════════════════════════════════════════════
// 13. PLAYBACK
// ══════════════════════════════════════════════════════════════
function startPlay(){
  playing=true;
  playBtn.innerHTML="&#9646;&#9646;";
  playBtn.classList.add("playing");
  if(scrubYear>=brushDomain[1]) scrubYear=brushDomain[0];
  function tick(){
    if(scrubYear>=brushDomain[1]){stopPlay();return;}
    scrubYear++;setScrubYear(scrubYear);
    playTimer=setTimeout(tick,parseInt(speedSelect.value));
  }
  playTimer=setTimeout(tick,parseInt(speedSelect.value));
}
function stopPlay(){
  playing=false;clearTimeout(playTimer);
  playBtn.innerHTML="&#9654;";playBtn.classList.remove("playing");
}

// ══════════════════════════════════════════════════════════════
// 14. PNG EXPORT
// ══════════════════════════════════════════════════════════════
function exportPNG(){
  const svg=mainSvg.node();
  // Inline styles needed for export
  const svgClone=svg.cloneNode(true);
  svgClone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  // Add dark background rect
  const bg=document.createElementNS("http://www.w3.org/2000/svg","rect");
  bg.setAttribute("width","100%");bg.setAttribute("height","100%");bg.setAttribute("fill","#0d0d1a");
  svgClone.insertBefore(bg,svgClone.firstChild);
  const serializer=new XMLSerializer();
  const svgStr=serializer.serializeToString(svgClone);
  const vb=svg.viewBox.baseVal;
  const canvas=document.createElement("canvas");
  const scale=2;
  canvas.width=(vb.width||800)*scale;
  canvas.height=(vb.height||500)*scale;
  const ctx=canvas.getContext("2d");
  ctx.scale(scale,scale);
  const img=new Image();
  img.onload=()=>{
    ctx.drawImage(img,0,0);
    const a=document.createElement("a");
    a.download=`co2-dashboard-${scrubYear}.png`;
    a.href=canvas.toDataURL("image/png");
    a.click();
  };
  img.src="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(svgStr)));
}

// ══════════════════════════════════════════════════════════════
// 15. CONTROLS
// ══════════════════════════════════════════════════════════════
function setupControls(){
  playBtn.addEventListener("click",()=>{if(playing)stopPlay();else startPlay();});

  // Metric
  [btnAbsolute,btnPercapita,btnIntensity].forEach(btn=>{
    btn.addEventListener("click",()=>{
      [btnAbsolute,btnPercapita,btnIntensity].forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      metricMode=btn.id==="btn-absolute"?"absolute":btn.id==="btn-percapita"?"percapita":"intensity";
      updateMain(false);updateBrush();updateBar();updateDonut();updateMap();updateCumulative();
    });
  });

  // Chart type
  btnLine.addEventListener("click",()=>{
    if(!areaMode) return;
    areaMode=false;btnLine.classList.add("active");btnArea.classList.remove("active");updateMain(false);
  });
  btnArea.addEventListener("click",()=>{
    if(areaMode) return;
    areaMode=true;btnArea.classList.add("active");btnLine.classList.remove("active");updateMain(false);
  });

  // Region grouping
  btnRegion.addEventListener("click",()=>{
    groupRegion=!groupRegion;
    btnRegion.classList.toggle("active",groupRegion);
    updateMain(false);updateBrush();updateBar();updateDonut();updateMap();
  });

  // Compare mode
  btnCompare.addEventListener("click",()=>{
    compareMode=!compareMode;
    btnCompare.classList.toggle("active",compareMode);
    if(!compareMode){
      compareSet.clear();
      document.querySelectorAll(".compare-selected").forEach(el=>el.classList.remove("compare-selected"));
      comparePanel?.classList.add("hidden");
      applyHighlight(null);
    }
  });

  // Export
  document.getElementById("export-btn")?.addEventListener("click",exportPNG);

  // Fact card close
  document.querySelector(".fact-close")?.addEventListener("click",closeFactCard);
  document.addEventListener("click",(e)=>{
    if(factCard&&!factCard.classList.contains("hidden")){
      if(!factCard.contains(e.target)&&!e.target.classList.contains("toggle-btn")&&!e.target.closest(".toggle-btn")) closeFactCard();
    }
  });
}

// ══════════════════════════════════════════════════════════════
// 16. TOOLTIP HELPERS
// ══════════════════════════════════════════════════════════════
function moveTooltip(event,containerId){
  const rect=document.getElementById(containerId).getBoundingClientRect();
  let x=event.clientX-rect.left+14;
  let y=event.clientY-rect.top-10;
  const tipW=tooltip.offsetWidth,tipH=tooltip.offsetHeight;
  if(x+tipW>rect.width-10) x-=tipW+28;
  if(y+tipH>rect.height-10) y=rect.height-tipH-10;
  tooltip.style.left=x+"px";tooltip.style.top=y+"px";
}
function hideTooltip(){tooltip.classList.add("hidden");}
