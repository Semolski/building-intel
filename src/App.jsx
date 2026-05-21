import { useState, useEffect, useRef, useCallback } from "react";
import Papa from "papaparse";

// ─── Mapbox ───────────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = "pk.eyJ1Ijoic2Vtb2xza2kiLCJhIjoiY21wZnR2c3ZtMDZ5bDJwb2duYTEwYWxwaCJ9.RWxtD99C6ptWNUXjZvfPtQ";
const TILE_LAYERS = {
  satellite: {
    url: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
    label: "🛰 Satellite",
    attribution: "© <a href='https://mapbox.com'>Mapbox</a> © <a href='https://openstreetmap.org'>OpenStreetMap</a>"
  },
  streets: {
    url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
    label: "🗺 Streets",
    attribution: "© <a href='https://mapbox.com'>Mapbox</a> © <a href='https://openstreetmap.org'>OpenStreetMap</a>"
  },
  dark: {
    url: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
    label: "🌑 Dark",
    attribution: "© <a href='https://mapbox.com'>Mapbox</a>"
  },
};

// ─── Config ───────────────────────────────────────────────────────────────────
const LIST_CONFIG = {
  "Abandoned":                              { color:"#ff6b35", icon:"🏚️" },
  "Roadside finds":                         { color:"#ffd600", icon:"📍" },
  "Ghost Town":                             { color:"#90a4ae", icon:"👻" },
  "Demolished":                             { color:"#ef5350", icon:"🔨" },
  "Historic homes and mansions":            { color:"#ab47bc", icon:"🏛️" },
  "Asylums Sanitarium Sanitorium Hospitals":{ color:"#42a5f5", icon:"🏥" },
  "Kirkbride":                              { color:"#26c6da", icon:"🔬" },
  "Bridges Trestles":                       { color:"#8d6e63", icon:"🌉" },
  "Tunnels":                                { color:"#78909c", icon:"🕳️" },
  "Mills":                                  { color:"#a1887f", icon:"⚙️" },
  "Salvage":                                { color:"#ffa726", icon:"🔩" },
  "Abandoned Ships, Trains, etc.":          { color:"#80cbc4", icon:"🚂" },
};

const NEWS_CATS = [
  { id:"incidents", label:"Incidents",     icon:"🔥", color:"#ff4d4d",
    desc:"buildings that suffered structural fires, floods, explosions, or major structural damage" },
  { id:"condemned", label:"Condemned",    icon:"🚧", color:"#ff8c00",
    desc:"buildings officially condemned, issued demolition orders, or declared structurally unsafe" },
  { id:"blight",    label:"Vacant/Blight",icon:"🏚️", color:"#f0c040",
    desc:"abandoned, vacant, or municipally blighted properties" },
  { id:"news",      label:"In The News",  icon:"📰", color:"#a78bfa",
    desc:"historically significant buildings at risk, unique local businesses closing or threatened" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractCoords(url, title) {
  const m = (url || "").match(/search\/([-\d.]+),([-\d.]+)/);
  if (m) return [+m[1], +m[2]];
  const d = (title || "").match(/(\d+)°(\d+)'([\d.]+)"N\s+(\d+)°(\d+)'([\d.]+)"W/);
  if (d) return [+d[1] + +d[2]/60 + +d[3]/3600, -( +d[4] + +d[5]/60 + +d[6]/3600)];
  return null;
}

async function parseZip(file) {
  const JSZip = window.JSZip;
  const zip   = await JSZip.loadAsync(file);
  const out   = {};
  for (const [listName, cfg] of Object.entries(LIST_CONFIG)) {
    const entry = zip.files[`Takeout/Saved/${listName}.csv`];
    if (!entry) continue;
    const csv     = await entry.async("string");
    const { data } = Papa.parse(csv, { header:true, skipEmptyLines:true });
    const ready = [], pending = [];
    for (const row of data) {
      const title  = (row.Title || "").trim();
      const url    = (row.URL   || "").trim();
      const note   = (row.Note  || "").trim();
      if (!url) continue;
      const coords = extractCoords(url, title);
      const label  = (title && title !== "Dropped pin") ? title : (note || "Pinned location");
      if (coords) ready.push({ title:label, note, lat:coords[0], lng:coords[1], url });
      else        pending.push({ title:label, note, url });
    }
    out[listName] = { ...cfg, ready, pending };
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Popup HTML helpers ───────────────────────────────────────────────────────
const listPopup = (name, color, entry) => `
  <div style="font-family:system-ui,sans-serif;min-width:210px;max-width:280px">
    <span style="background:${color}22;color:${color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">${name}</span>
    <div style="font-weight:700;font-size:13px;margin:6px 0 3px;line-height:1.3">${entry.title}</div>
    ${entry.note && entry.note !== entry.title
      ? `<div style="color:#666;font-size:12px;margin-bottom:5px">${entry.note}</div>` : ""}
    <a href="${entry.url}" target="_blank" style="color:${color};font-size:12px;font-weight:700;text-decoration:none">Open in Google Maps →</a>
  </div>`;

const roadsidePopup = (pin) => `
  <div style="font-family:system-ui,sans-serif;min-width:210px">
    <span style="background:#00e67622;color:#00c853;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">ROADSIDE FIND</span>
    <div style="font-weight:700;font-size:13px;margin:6px 0 3px">${pin.title}</div>
    ${pin.note ? `<div style="color:#555;font-size:12px;margin-bottom:5px">${pin.note}</div>` : ""}
    <div style="color:#888;font-size:11px;font-family:monospace;margin-bottom:6px">${pin.timestamp}</div>
    <a href="https://www.google.com/maps?q=${pin.lat},${pin.lng}" target="_blank" style="color:#00c853;font-size:12px;font-weight:700;text-decoration:none">Street View / Directions →</a>
  </div>`;

const newsPopup = (r, cat) => `
  <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:300px">
    <span style="background:${cat.color}22;color:${cat.color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">${r.incident_type || cat.label.toUpperCase()}</span>
    <div style="font-weight:700;font-size:13px;margin:6px 0 3px;line-height:1.3">${r.title}</div>
    <div style="color:#555;font-size:11px;font-family:monospace;margin-bottom:5px">📍 ${r.address}, ${r.city}, ${r.state}</div>
    <div style="color:#444;font-size:12px;margin-bottom:6px;line-height:1.5">${r.description}</div>
    ${r.url ? `<a href="${r.url}" target="_blank" style="color:${cat.color};font-size:12px;font-weight:700;text-decoration:none">Read Article →</a>` : ""}
  </div>`;

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [phase,         setPhase]         = useState("loading"); // loading|import|app
  const [scriptsReady,  setScriptsReady]  = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [importMsg,     setImportMsg]     = useState("");
  const [lists,         setLists]         = useState({});
  const [layerVis,      setLayerVis]      = useState({});
  const [roadsidePins,  setRoadsidePins]  = useState([]);
  const [newsResults,   setNewsResults]   = useState({});
  const [activeTab,     setActiveTab]     = useState("layers");
  const [scanLocation,  setScanLocation]  = useState("");
  const [scanCat,       setScanCat]       = useState("incidents");
  const [scanning,      setScanning]      = useState(false);
  const [scanStatus,    setScanStatus]    = useState("");
  const [gpsLoading,    setGpsLoading]    = useState(false);
  const [toasts,        setToasts]        = useState([]);
  const [dragOver,      setDragOver]      = useState(false);
  const [editPin,       setEditPin]       = useState(null); // index of pin being edited
  const [mapStyle,      setMapStyle]      = useState("satellite"); // satellite|streets|dark

  const mapRef        = useRef(null);
  const leafletMap    = useRef(null);
  const baseTileRef   = useRef(null);   // active base tile layer
  const layerGroups   = useRef({});     // { listName: L.MarkerClusterGroup }
  const roadsideGrp   = useRef(null);
  const newsLayers    = useRef({});
  const fileInputRef  = useRef(null);

  // ── Load external scripts ────────────────────────────────────────────────
  useEffect(() => {
    const h = document.head;
    const addCSS = href => { const l=document.createElement("link"); l.rel="stylesheet"; l.href=href; h.appendChild(l); };
    const addJS  = src  => new Promise(res => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement("script"); s.src=src; s.onload=res; h.appendChild(s);
    });
    addCSS("https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Figtree:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap");
    addCSS("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");
    addCSS("https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css");
    Promise.all([
      addJS("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"),
      addJS("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"),
    ]).then(() => addJS("https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js"))
      .then(() => setScriptsReady(true));
  }, []);

  // ── Load persisted data ──────────────────────────────────────────────────
  useEffect(() => {
    if (!scriptsReady) return;
    (async () => {
      try {
        const [sl, sr, sn] = await Promise.all([
          window.storage.get("bi-lists-v4").catch(()=>null),
          window.storage.get("bi-roadside-v4").catch(()=>null),
          window.storage.get("bi-news-v4").catch(()=>null),
        ]);
        if (sl?.value) {
          const l = JSON.parse(sl.value);
          setLists(l);
          const vis = {}; Object.keys(l).forEach(k => vis[k] = true);
          setLayerVis(vis);
          setPhase("app");
        } else { setPhase("import"); }
        if (sr?.value) setRoadsidePins(JSON.parse(sr.value));
        if (sn?.value) setNewsResults(JSON.parse(sn.value));
      } catch { setPhase("import"); }
    })();
  }, [scriptsReady]);

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => { if (Object.keys(lists).length) window.storage.set("bi-lists-v4", JSON.stringify(lists)).catch(()=>{}); }, [lists]);
  useEffect(() => { window.storage.set("bi-roadside-v4", JSON.stringify(roadsidePins)).catch(()=>{}); }, [roadsidePins]);
  useEffect(() => { if (Object.keys(newsResults).length) window.storage.set("bi-news-v4", JSON.stringify(newsResults)).catch(()=>{}); }, [newsResults]);

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "app" || !mapRef.current || leafletMap.current || !window.L) return;
    const L   = window.L;
    const map = L.map(mapRef.current, { center:[39.5,-98.35], zoom:4 });
    const tl  = TILE_LAYERS.satellite;
    baseTileRef.current = L.tileLayer(tl.url, { attribution:tl.attribution, maxZoom:22, tileSize:256 }).addTo(map);
    leafletMap.current  = map;
    roadsideGrp.current = L.markerClusterGroup({ maxClusterRadius:50 }).addTo(map);
  }, [phase]);

  // ── Swap base tile layer when mapStyle changes ────────────────────────────
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !window.L || !baseTileRef.current) return;
    const L  = window.L;
    const tl = TILE_LAYERS[mapStyle];
    map.removeLayer(baseTileRef.current);
    baseTileRef.current = L.tileLayer(tl.url, { attribution:tl.attribution, maxZoom:22, tileSize:256 });
    baseTileRef.current.addTo(map);
    baseTileRef.current.bringToBack();
  }, [mapStyle]);

  // ── Icon factory ─────────────────────────────────────────────────────────
  const makeIcon = useCallback((color, emoji, size=30) => window.L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      <div style="width:${size}px;height:${size}px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid rgba(255,255,255,.85);box-shadow:0 2px 10px rgba(0,0,0,.5)"></div>
      <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);font-size:${Math.round(size*.42)}px">${emoji}</span>
    </div>`,
    className:"", iconSize:[size,size], iconAnchor:[size/2,size], popupAnchor:[0,-size-4]
  }), []);

  // ── Plot list markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!leafletMap.current || !window.L) return;
    const L = window.L, map = leafletMap.current;
    Object.values(layerGroups.current).forEach(g => map.removeLayer(g));
    layerGroups.current = {};

    for (const [name, data] of Object.entries(lists)) {
      if (!data.ready?.length) continue;
      const grp = L.markerClusterGroup({
        maxClusterRadius:60,
        iconCreateFunction: c => L.divIcon({
          html:`<div style="background:${data.color};color:#fff;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:2px solid rgba(255,255,255,.75);box-shadow:0 2px 10px rgba(0,0,0,.45)">${c.getChildCount()}</div>`,
          className:"",iconSize:[38,38]
        })
      });
      const icon = makeIcon(data.color, data.icon);
      data.ready.forEach(e => {
        L.marker([e.lat,e.lng],{icon})
          .bindPopup(listPopup(name,data.color,e),{maxWidth:300})
          .addTo(grp);
      });
      layerGroups.current[name] = grp;
      if (layerVis[name] !== false) grp.addTo(map);
    }
  }, [lists, makeIcon]); // eslint-disable-line

  // ── Toggle layer visibility ───────────────────────────────────────────────
  const toggleLayer = useCallback((name) => {
    const map = leafletMap.current, grp = layerGroups.current[name];
    if (!map || !grp) return;
    const show = !layerVis[name];
    show ? grp.addTo(map) : map.removeLayer(grp);
    setLayerVis(p => ({...p,[name]:show}));
  }, [layerVis]);

  // ── Plot roadside markers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!roadsideGrp.current || !window.L) return;
    const L = window.L;
    roadsideGrp.current.clearLayers();
    const icon = makeIcon("#00e676","📍",34);
    roadsidePins.forEach(pin => {
      if (!pin.lat) return;
      L.marker([pin.lat,pin.lng],{icon})
        .bindPopup(roadsidePopup(pin),{maxWidth:290})
        .addTo(roadsideGrp.current);
    });
  }, [roadsidePins, makeIcon]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const toast = useCallback((msg, type="ok") => {
    const id = Date.now();
    setToasts(p => [...p,{id,msg,type}]);
    setTimeout(() => setToasts(p => p.filter(t=>t.id!==id)), 3200);
  }, []);

  // ── Roadside save (GPS) ───────────────────────────────────────────────────
  const saveRoadside = useCallback(() => {
    if (gpsLoading) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude:lat, longitude:lng, accuracy } = pos.coords;
        const now = new Date();
        const pin = { lat, lng, title:"Roadside Find", note:"", accuracy:Math.round(accuracy), timestamp:now.toLocaleString(), saved:now.toISOString() };
        setRoadsidePins(p => [pin,...p]);
        if (navigator.vibrate) navigator.vibrate([80,40,80]);
        toast(`📍 Saved!  ±${Math.round(accuracy)}m`);
        if (leafletMap.current) leafletMap.current.flyTo([lat,lng],17,{duration:1.2});
        setGpsLoading(false);
      },
      err => { toast(`GPS error: ${err.message}`,"err"); setGpsLoading(false); },
      { enableHighAccuracy:true, timeout:10000, maximumAge:0 }
    );
  }, [gpsLoading, toast]);

  // ── Import ZIP ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async file => {
    if (!file?.name.endsWith(".zip")) { toast("Please upload a .zip file","err"); return; }
    setImporting(true); setImportMsg("Reading zip…");
    try {
      const parsed = await parseZip(file);
      setImportMsg("Building layers…");
      const vis = {}; Object.keys(parsed).forEach(k => vis[k]=true);
      setLists(parsed); setLayerVis(vis);
      await sleep(200); setPhase("app");
      const total = Object.values(parsed).reduce((s,l)=>s+(l.ready?.length||0),0);
      toast(`✓ Imported ${Object.keys(parsed).length} lists · ${total} pins ready`);
    } catch (e) { toast(`Import error: ${e.message}`,"err"); }
    finally { setImporting(false); setImportMsg(""); }
  }, [toast]);

  // ── News scan ─────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    if (scanning || !scanLocation.trim()) return;
    const cat = NEWS_CATS.find(c=>c.id===scanCat);
    setScanning(true); setScanStatus("Searching the web…");
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          system:`You are a property intelligence agent. Find recent news (2024-2026) about ${cat.desc} in ${scanLocation}. Your FINAL response must be ONLY a raw JSON array. Each object: {title,url,date(YYYY-MM-DD),address,city,state,incident_type,description}. Only include entries with a specific street address. Max 6 results, newest first.`,
          messages:[{role:"user",content:`Search for recent news about ${cat.desc} in ${scanLocation}.`}]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text  = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      const match = text.match(/\[[\s\S]*?\]/);
      if (!match) throw new Error("No results — try a more specific city/state");
      let results = JSON.parse(match[0]).slice(0,6);
      setScanStatus(`Found ${results.length}. Geocoding…`);

      for (let i=0;i<results.length;i++) {
        const r = results[i];
        setScanStatus(`Geocoding ${i+1}/${results.length}: ${r.city}`);
        try {
          const gr = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${r.address},${r.city},${r.state}`)}&limit=1&countrycodes=us,ca`,
            {headers:{"User-Agent":"BuildingIntelApp/1.0"}});
          const gd = await gr.json();
          if (gd[0]) results[i]={...r,lat:+gd[0].lat,lng:+gd[0].lon};
        } catch {}
        await sleep(1150);
      }

      const plotable = results.filter(r=>r.lat);
      if (leafletMap.current && window.L) {
        const L=window.L, map=leafletMap.current;
        if (!newsLayers.current[scanCat]) newsLayers.current[scanCat]=L.layerGroup().addTo(map);
        const icon = makeIcon(cat.color,cat.icon);
        plotable.forEach(r => L.marker([r.lat,r.lng],{icon}).bindPopup(newsPopup(r,cat),{maxWidth:320}).addTo(newsLayers.current[scanCat]));
        if (plotable.length) map.fitBounds(plotable.map(r=>[r.lat,r.lng]),{padding:[60,60]});
      }
      setNewsResults(p=>{
        const ex=p[scanCat]||[], urls=new Set(ex.map(r=>r.url));
        return {...p,[scanCat]:[...ex,...plotable.filter(r=>!urls.has(r.url))]};
      });
      setScanStatus(`✓ Mapped ${plotable.length} of ${results.length} locations`);
    } catch(e) { setScanStatus(`Error: ${e.message}`); }
    finally { setScanning(false); }
  }, [scanning,scanLocation,scanCat,makeIcon]);

  // ─── Computed ────────────────────────────────────────────────────────────
  const totalPins = Object.values(lists).reduce((s,l)=>s+(l.ready?.length||0),0);

  // ─── Shared styles ────────────────────────────────────────────────────────
  const S = {
    label: { display:"block", color:"#1e3a5c", fontSize:10, fontFamily:"'JetBrains Mono',monospace", letterSpacing:1.5, fontWeight:600, marginBottom:6 },
    input: { width:"100%", boxSizing:"border-box", background:"#0b1828", border:"1px solid #152540", borderRadius:8, color:"#b8d4f0", padding:"10px 14px", fontSize:13, fontFamily:"'JetBrains Mono',monospace", outline:"none" },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // LOADING SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "loading") return (
    <div style={{display:"flex",height:"100vh",background:"#060d18",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,fontFamily:"'Figtree',sans-serif"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36,color:"#d8eaff",letterSpacing:3}}>BUILDING INTEL</div>
      <div style={{color:"#1a3050",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>Initializing map engine…</div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // IMPORT SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === "import") return (
    <div style={{display:"flex",height:"100vh",background:"#060d18",alignItems:"center",justifyContent:"center",fontFamily:"'Figtree',sans-serif",padding:20,boxSizing:"border-box"}}>
      <div style={{maxWidth:520,width:"100%",textAlign:"center"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:44,color:"#d8eaff",letterSpacing:4,marginBottom:2}}>BUILDING INTEL</div>
        <div style={{color:"#1e3a5c",fontSize:11,fontFamily:"'JetBrains Mono',monospace",letterSpacing:2,marginBottom:40}}>PROPERTY INTELLIGENCE SYSTEM</div>

        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
          onClick={()=>fileInputRef.current?.click()}
          style={{
            border:`2px dashed ${dragOver?"#00e676":"#1a3050"}`,
            borderRadius:16, padding:"52px 32px",
            cursor:"pointer", background:dragOver?"#071a0f":"#07101e",
            transition:"all .2s", marginBottom:20
          }}
        >
          {importing ? (
            <>
              <div style={{fontSize:44,marginBottom:14}}>⚙️</div>
              <div style={{color:"#00e676",fontWeight:700,fontSize:17,marginBottom:8}}>Importing your pins…</div>
              <div style={{color:"#1e3a5c",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>{importMsg}</div>
            </>
          ) : (
            <>
              <div style={{fontSize:52,marginBottom:14}}>📦</div>
              <div style={{color:"#b8d4f0",fontWeight:700,fontSize:19,marginBottom:6}}>Drop your Google Takeout ZIP here</div>
              <div style={{color:"#1e3a5c",fontSize:13}}>or click to browse</div>
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".zip" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />

        {/* Instructions card */}
        <div style={{background:"#07101e",border:"1px solid #0f2035",borderRadius:14,padding:"18px 22px",textAlign:"left",marginBottom:16}}>
          <div style={{color:"#2a4a6a",fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5,marginBottom:12}}>HOW TO EXPORT YOUR GOOGLE MAPS PINS</div>
          {[
            ["1","Go to myaccount.google.com"],
            ["2","Data & Privacy → Download your data"],
            ["3","Select only 'Saved' under Google Maps"],
            ["4","Download the .zip — then upload it here"],
          ].map(([n,s])=>(
            <div key={n} style={{display:"flex",gap:12,marginBottom:8,alignItems:"flex-start"}}>
              <span style={{color:"#ff6b35",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,lineHeight:"1.1",flexShrink:0}}>{n}</span>
              <span style={{color:"#3a5a78",fontSize:13,lineHeight:1.5}}>{s}</span>
            </div>
          ))}
        </div>

        {/* Lists that will be imported */}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:20}}>
          {Object.entries(LIST_CONFIG).map(([name,cfg])=>(
            <span key={name} style={{background:`${cfg.color}18`,border:`1px solid ${cfg.color}40`,color:cfg.color,fontSize:11,padding:"3px 10px",borderRadius:20}}>
              {cfg.icon} {name}
            </span>
          ))}
        </div>

        <button onClick={()=>setPhase("app")} style={{background:"none",border:"none",color:"#1e3a5c",fontSize:12,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",textDecoration:"underline"}}>
          Skip — go straight to map →
        </button>
      </div>

      {/* Toasts */}
      <div style={{position:"fixed",bottom:24,right:24,display:"flex",flexDirection:"column",gap:8,zIndex:9999,pointerEvents:"none"}}>
        {toasts.map(t=>(
          <div key={t.id} style={{background:t.type==="err"?"#1a0505":"#051a0a",border:`1px solid ${t.type==="err"?"#ff4d4d":"#00e676"}`,borderRadius:10,padding:"10px 18px",color:t.type==="err"?"#ff4d4d":"#00e676",fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,.5)"}}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ════════════════════════════════════════════════════════════════════════════
  const currentScanCat = NEWS_CATS.find(c=>c.id===scanCat);

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'Figtree',sans-serif",background:"#060d18",overflow:"hidden"}}>

      {/* ══ SIDEBAR ═══════════════════════════════════════════════════════════ */}
      <div style={{width:370,minWidth:370,height:"100vh",display:"flex",flexDirection:"column",background:"#07101e",borderRight:"1px solid #0f2035",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"14px 20px 12px",borderBottom:"1px solid #0f2035",background:"linear-gradient(180deg,#0c1828,#07101e)"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"#d8eaff",letterSpacing:2}}>BUILDING INTEL</div>
          <div style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
            {totalPins.toLocaleString()} imported · {roadsidePins.length} roadside · Mapbox Satellite
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid #0f2035"}}>
          {[{id:"layers",label:"My Lists"},{id:"news",label:"News Scan"},{id:"roadside",label:"Roadside"}].map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
              flex:1,padding:"11px 6px",background:activeTab===tab.id?"#0d1e30":"transparent",
              border:"none",borderBottom:activeTab===tab.id?"2px solid #ff6b35":"2px solid transparent",
              color:activeTab===tab.id?"#d8eaff":"#2a4a6a",fontSize:11,fontWeight:activeTab===tab.id?700:400,
              cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",letterSpacing:.5
            }}>
              {tab.label}
              {tab.id==="roadside" && roadsidePins.length>0 && (
                <span style={{marginLeft:5,background:"#00e676",color:"#003300",fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:8}}>{roadsidePins.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{flex:1,overflowY:"auto",overscrollBehavior:"contain"}}>

          {/* ── MY LISTS ─────────────────────────────────────────────────── */}
          {activeTab==="layers" && (
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={S.label}>GOOGLE MAPS LISTS</span>
                <button onClick={()=>setPhase("import")} style={{background:"none",border:"1px solid #0f2035",borderRadius:5,color:"#2a4a6a",fontSize:10,cursor:"pointer",padding:"2px 8px",fontFamily:"'JetBrains Mono',monospace"}}>
                  Re-import
                </button>
              </div>

              {Object.keys(lists).length===0 ? (
                <div style={{textAlign:"center",padding:"40px 0",color:"#1e3a5c"}}>
                  <div style={{fontSize:36,marginBottom:8}}>📭</div>
                  <div style={{fontSize:12,marginBottom:12}}>No lists imported yet</div>
                  <button onClick={()=>setPhase("import")} style={{background:"#ff6b35",border:"none",borderRadius:8,color:"#fff",padding:"10px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>Import ZIP</button>
                </div>
              ) : (
                <>
                  {Object.entries(lists).map(([name,data])=>{
                    const on = layerVis[name]!==false;
                    const rc = data.ready?.length||0, pc = data.pending?.length||0;
                    return (
                      <div key={name} onClick={()=>toggleLayer(name)} style={{
                        display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                        borderRadius:9,marginBottom:4,cursor:"pointer",
                        background:on?`${data.color}12`:"transparent",
                        border:`1px solid ${on?data.color+"35":"#0f1e30"}`,
                        transition:"all .15s"
                      }}>
                        <div style={{width:11,height:11,borderRadius:6,background:on?data.color:"#1a3050",flexShrink:0,transition:"background .15s"}}/>
                        <span style={{fontSize:15,flexShrink:0}}>{data.icon}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:on?"#c0d8f0":"#2a4a6a",fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
                          <div style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>{rc} mapped{pc>0?` · ${pc} pending`:""}</div>
                        </div>
                        {rc>0&&<span style={{background:on?data.color:"#1a3050",color:on?"#000":"#2a4a6a",fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:10,flexShrink:0}}>{rc}</span>}
                      </div>
                    );
                  })}

                  {totalPins>0&&(
                    <button onClick={()=>{
                      const coords=Object.values(lists).flatMap(l=>(l.ready||[]).map(e=>[e.lat,e.lng]));
                      if(coords.length&&leafletMap.current) leafletMap.current.fitBounds(coords,{padding:[50,50]});
                    }} style={{width:"100%",marginTop:10,background:"#0b1828",border:"1px solid #0f2035",borderRadius:8,color:"#3a5a78",padding:"10px",cursor:"pointer",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>
                      🗺 Fit all {totalPins.toLocaleString()} pins
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── NEWS SCAN ────────────────────────────────────────────────── */}
          {activeTab==="news" && (
            <div style={{padding:"14px 16px"}}>
              <label style={S.label}>LOCATION TARGET</label>
              <input value={scanLocation} onChange={e=>setScanLocation(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!scanning&&runScan()}
                placeholder="e.g.  Detroit, MI  or  Philadelphia" style={{...S.input,marginBottom:14}}/>

              <label style={S.label}>CATEGORY</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
                {NEWS_CATS.map(c=>(
                  <button key={c.id} onClick={()=>setScanCat(c.id)} style={{
                    background:scanCat===c.id?`${c.color}20`:"transparent",
                    border:`1px solid ${scanCat===c.id?c.color:"#0f2035"}`,
                    borderRadius:8,color:scanCat===c.id?c.color:"#2a4a6a",
                    padding:"9px 10px",fontSize:12,fontWeight:scanCat===c.id?700:400,cursor:"pointer",textAlign:"left",
                    display:"flex",justifyContent:"space-between",alignItems:"center"
                  }}>
                    <span>{c.icon} {c.label}</span>
                    {(newsResults[c.id]||[]).length>0&&(
                      <span style={{background:c.color,color:"#000",fontSize:9,fontWeight:800,padding:"1px 6px",borderRadius:8}}>{(newsResults[c.id]||[]).length}</span>
                    )}
                  </button>
                ))}
              </div>

              <button onClick={runScan} disabled={scanning||!scanLocation.trim()} style={{
                width:"100%",background:scanning?"#0f2035":`linear-gradient(135deg,${currentScanCat.color}bb,${currentScanCat.color}77)`,
                border:"none",borderRadius:8,color:scanning?"#2a4a6a":"#fff",padding:"13px",
                cursor:scanning?"not-allowed":"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,marginBottom:10
              }}>
                {scanning?"⏳  SCANNING…":"🔍  SCAN NOW"}
              </button>

              {scanStatus&&(
                <div style={{padding:"8px 12px",background:"#0b1828",borderRadius:6,marginBottom:10,
                  borderLeft:`3px solid ${scanStatus.startsWith("✓")?"#4ade80":scanStatus.startsWith("Error")?"#ff4d4d":"#3a6080"}`,
                  color:scanStatus.startsWith("✓")?"#4ade80":scanStatus.startsWith("Error")?"#ff4d4d":"#3a6080",
                  fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
                  {scanStatus}
                </div>
              )}

              {(newsResults[scanCat]||[]).map((r,i)=>(
                <div key={i} onClick={()=>{if(r.lat&&leafletMap.current)leafletMap.current.flyTo([r.lat,r.lng],17,{duration:1.2});}}
                  style={{background:"#090f1c",border:"1px solid #0f1e30",borderRadius:8,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{background:`${currentScanCat.color}22`,color:currentScanCat.color,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4}}>{r.incident_type||currentScanCat.label.toUpperCase()}</span>
                    <span style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>{r.date}</span>
                  </div>
                  <div style={{color:"#c0d8f0",fontSize:12,fontWeight:600,lineHeight:1.35,marginBottom:4}}>{r.title}</div>
                  <div style={{color:"#2a4a6a",fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:5}}>📍 {r.address}, {r.city}</div>
                  {r.url&&<a href={r.url} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:currentScanCat.color,fontSize:11,fontWeight:700,textDecoration:"none"}}>↗ Article</a>}
                </div>
              ))}
            </div>
          )}

          {/* ── ROADSIDE ─────────────────────────────────────────────────── */}
          {activeTab==="roadside" && (
            <div style={{padding:"14px 16px"}}>
              {/* Save button in sidebar too */}
              <button onClick={saveRoadside} disabled={gpsLoading} style={{
                width:"100%",padding:"16px",
                background:gpsLoading?"#0f2035":"linear-gradient(135deg,#00e676,#00a84f)",
                border:"none",borderRadius:10,color:gpsLoading?"#2a4a6a":"#002d15",
                fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,
                cursor:gpsLoading?"not-allowed":"pointer",marginBottom:14
              }}>
                {gpsLoading?"📡  GETTING GPS…":"📍  SAVE CURRENT LOCATION"}
              </button>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={S.label}>{roadsidePins.length} SAVED FINDS</span>
                {roadsidePins.length>0&&(
                  <button onClick={()=>{if(confirm("Clear all roadside finds?"))setRoadsidePins([]);}}
                    style={{background:"none",border:"none",color:"#ff4d4d",fontSize:11,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>
                    ✕ clear all
                  </button>
                )}
              </div>

              {roadsidePins.length===0 ? (
                <div style={{textAlign:"center",padding:"40px 0",color:"#1e3a5c"}}>
                  <div style={{fontSize:40,marginBottom:8}}>📍</div>
                  <div style={{fontSize:12,marginBottom:4}}>No roadside finds yet</div>
                  <div style={{fontSize:11,color:"#1a3050"}}>Tap the green button on the map while driving</div>
                </div>
              ) : roadsidePins.map((pin,i)=>(
                <div key={i} style={{background:"#090f1c",border:"1px solid #00e67618",borderRadius:9,padding:"11px 13px",marginBottom:6}}>
                  {editPin===i ? (
                    /* Edit mode */
                    <div>
                      <input defaultValue={pin.title} id={`et-${i}`}
                        style={{...S.input,marginBottom:6,fontSize:12}}
                        placeholder="Label / name"/>
                      <input defaultValue={pin.note} id={`en-${i}`}
                        style={{...S.input,marginBottom:8,fontSize:12}}
                        placeholder="Notes (optional)"/>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{
                          const t=document.getElementById(`et-${i}`)?.value||"Roadside Find";
                          const n=document.getElementById(`en-${i}`)?.value||"";
                          setRoadsidePins(p=>p.map((x,j)=>j===i?{...x,title:t,note:n}:x));
                          setEditPin(null);
                        }} style={{flex:1,background:"#00e676",border:"none",borderRadius:6,color:"#003300",padding:"7px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                          Save
                        </button>
                        <button onClick={()=>setEditPin(null)}
                          style={{flex:1,background:"#0b1828",border:"1px solid #0f2035",borderRadius:6,color:"#3a5a78",padding:"7px",cursor:"pointer",fontSize:12}}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <>
                      <div style={{color:"#00c853",fontSize:13,fontWeight:700,marginBottom:3}}>{pin.title}</div>
                      {pin.note&&<div style={{color:"#3a5a78",fontSize:12,marginBottom:3}}>{pin.note}</div>}
                      <div style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:6}}>{pin.timestamp} · ±{pin.accuracy}m</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button onClick={()=>{if(leafletMap.current)leafletMap.current.flyTo([pin.lat,pin.lng],17,{duration:1.2});}}
                          style={{background:"#0b1828",border:"1px solid #0f2035",borderRadius:6,color:"#3a5a78",padding:"4px 10px",cursor:"pointer",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>
                          🗺 Map
                        </button>
                        <a href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`} target="_blank" rel="noopener"
                          style={{background:"#0b1828",border:"1px solid #00e67630",borderRadius:6,color:"#00c853",padding:"4px 10px",fontSize:10,textDecoration:"none",fontFamily:"'JetBrains Mono',monospace"}}>
                          ↗ Street View
                        </a>
                        <button onClick={()=>setEditPin(i)}
                          style={{background:"#0b1828",border:"1px solid #0f2035",borderRadius:6,color:"#3a5a78",padding:"4px 10px",cursor:"pointer",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>
                          ✏️ Edit
                        </button>
                        <button onClick={()=>setRoadsidePins(p=>p.filter((_,j)=>j!==i))}
                          style={{background:"none",border:"none",color:"#ff4d4d",padding:"4px 6px",cursor:"pointer",fontSize:10}}>
                          ✕
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{padding:"8px 16px",borderTop:"1px solid #0f2035",display:"flex",gap:10,flexWrap:"wrap"}}>
          {Object.entries(LIST_CONFIG).slice(0,6).map(([n,c])=>(
            <div key={n} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:8,height:8,borderRadius:"50% 50% 50% 0",transform:"rotate(-45deg)",background:c.color,flexShrink:0}}/>
              <span style={{color:"#1e3a5c",fontSize:9,whiteSpace:"nowrap"}}>{n.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ MAP ═══════════════════════════════════════════════════════════════ */}
      <div style={{flex:1,height:"100vh",position:"relative"}}>
        <div ref={mapRef} style={{width:"100%",height:"100%"}}/>

        {/* ── Basemap Switcher ── */}
        <div style={{position:"absolute",top:12,right:12,zIndex:1400,display:"flex",flexDirection:"column",gap:6}}>
          {Object.entries(TILE_LAYERS).map(([key,tl])=>(
            <button key={key} onClick={()=>setMapStyle(key)} style={{
              background: mapStyle===key ? "rgba(255,255,255,0.95)" : "rgba(7,16,30,0.85)",
              border: mapStyle===key ? "2px solid #ff6b35" : "1px solid rgba(255,255,255,0.15)",
              borderRadius:8,
              color: mapStyle===key ? "#111" : "#8ab0cc",
              padding:"6px 12px",
              fontSize:11,fontWeight: mapStyle===key ? 700 : 400,
              cursor:"pointer",
              backdropFilter:"blur(6px)",
              letterSpacing:.3,
              whiteSpace:"nowrap",
              transition:"all .15s"
            }}>{tl.label}</button>
          ))}
        </div>

        {/* ── Floating Roadside Save Button ── */}
        <button onClick={saveRoadside} disabled={gpsLoading} style={{
          position:"fixed",bottom:28,right:24,width:74,height:74,
          borderRadius:"50%",zIndex:1500,
          background:gpsLoading?"#0f2035":"linear-gradient(135deg,#00e676,#00a84f)",
          border:"3px solid rgba(255,255,255,.25)",
          boxShadow:gpsLoading?"0 4px 20px rgba(0,0,0,.5)":"0 4px 28px rgba(0,230,118,.55), 0 0 0 7px rgba(0,230,118,.12)",
          cursor:gpsLoading?"not-allowed":"pointer",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
          animation:gpsLoading?"none":"roadside-pulse 2.5s infinite",
          transition:"all .2s"
        }}>
          <span style={{fontSize:28,lineHeight:1}}>{gpsLoading?"📡":"📍"}</span>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:9,letterSpacing:1,color:gpsLoading?"#2a4a6a":"#002d15"}}>
            {gpsLoading?"GPS":"SAVE"}
          </span>
        </button>

        {/* ── Toasts ── */}
        <div style={{position:"fixed",bottom:120,right:24,display:"flex",flexDirection:"column",gap:8,zIndex:2000,pointerEvents:"none"}}>
          {toasts.map(t=>(
            <div key={t.id} style={{
              background:t.type==="err"?"#1e0505":"#051a0a",
              border:`1px solid ${t.type==="err"?"#ff4d4d":"#00e676"}`,
              borderRadius:10,padding:"10px 18px",
              color:t.type==="err"?"#ff4d4d":"#00e676",
              fontSize:13,fontWeight:600,
              boxShadow:"0 4px 20px rgba(0,0,0,.45)",
              animation:"toast-in .25s ease"
            }}>{t.msg}</div>
          ))}
        </div>
      </div>

      {/* ── Global styles ── */}
      <style>{`
        @keyframes roadside-pulse {
          0%,100%{box-shadow:0 4px 28px rgba(0,230,118,.55),0 0 0 7px rgba(0,230,118,.12)}
          50%{box-shadow:0 4px 36px rgba(0,230,118,.85),0 0 0 14px rgba(0,230,118,.06)}
        }
        @keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .leaflet-popup-content-wrapper{background:#111b28;border:1px solid #1e3a5c;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.55)}
        .leaflet-popup-tip{background:#111b28}
        .leaflet-popup-close-button{color:#3a5a78!important;font-size:18px!important;top:8px!important;right:10px!important}
        *{-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#07101e}
        ::-webkit-scrollbar-thumb{background:#1a3050;border-radius:2px}
      `}</style>
    </div>
  );
}
