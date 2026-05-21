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
  <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:290px">
    <span style="background:${color}22;color:${color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">${name}</span>
    <div style="font-weight:700;font-size:13px;margin:6px 0 3px;line-height:1.3">${entry.title}</div>
    ${entry.note && entry.note !== entry.title
      ? `<div style="color:#666;font-size:12px;margin-bottom:5px">${entry.note}</div>` : ""}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <a href="https://www.google.com/maps/dir/?api=1&destination=${entry.lat},${entry.lng}" target="_blank"
        style="background:#1a73e8;color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;text-decoration:none">
        🧭 Navigate
      </a>
      <a href="${entry.url}" target="_blank"
        style="background:#222;color:${color};font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;text-decoration:none;border:1px solid ${color}44">
        Maps →
      </a>
    </div>
  </div>`;

const roadsidePopup = (pin) => `
  <div style="font-family:system-ui,sans-serif;min-width:220px">
    <span style="background:#00e67622;color:#00c853;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">ROADSIDE FIND</span>
    <div style="font-weight:700;font-size:13px;margin:6px 0 3px">${pin.title}</div>
    ${pin.note ? `<div style="color:#555;font-size:12px;margin-bottom:5px">${pin.note}</div>` : ""}
    <div style="color:#888;font-size:11px;font-family:monospace;margin-bottom:8px">${pin.timestamp}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a href="https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}" target="_blank"
        style="background:#1a73e8;color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;text-decoration:none">
        🧭 Navigate
      </a>
      <a href="https://www.google.com/maps?q=${pin.lat},${pin.lng}" target="_blank"
        style="background:#222;color:#00c853;font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;text-decoration:none;border:1px solid #00e67644">
        Street View →
      </a>
    </div>
  </div>`;

const newsPopup = (r, cat) => `
  <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:300px">
    <span style="background:${cat.color}22;color:${cat.color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">${r.incident_type || cat.label.toUpperCase()}</span>
    <div style="font-weight:700;font-size:13px;margin:6px 0 3px;line-height:1.3">${r.title}</div>
    <div style="color:#555;font-size:11px;font-family:monospace;margin-bottom:5px">📍 ${r.address}, ${r.city}, ${r.state}</div>
    <div style="color:#444;font-size:12px;margin-bottom:8px;line-height:1.5">${r.description}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${r.lat ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}" target="_blank"
        style="background:#1a73e8;color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;text-decoration:none">
        🧭 Navigate
      </a>` : ""}
      ${r.url ? `<a href="${r.url}" target="_blank"
        style="background:#222;color:${cat.color};font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;text-decoration:none;border:1px solid ${cat.color}44">
        Article →
      </a>` : ""}
    </div>
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
  const [scanLocation,  setScanLocation]  = useState("United States");
  const [scanCat,       setScanCat]       = useState("incidents");
  const [apiKey,        setApiKey]        = useState(()=>localStorage.getItem("bi-apikey")||"");
  const [showSettings,  setShowSettings]  = useState(false);
  const [scanning,      setScanning]      = useState(false);
  const [scanStatus,    setScanStatus]    = useState("");
  const [gpsLoading,    setGpsLoading]    = useState(false);
  const [toasts,        setToasts]        = useState([]);
  const [dragOver,      setDragOver]      = useState(false);
  const [editPin,       setEditPin]       = useState(null); // index of pin being edited
  const [mapStyle,      setMapStyle]      = useState("satellite"); // satellite|streets|dark
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [geocodeState,  setGeocodeState]  = useState(null); // { listName, pending[], index, result, loading }

  const mapRef        = useRef(null);
  const leafletMap    = useRef(null);
  const baseTileRef   = useRef(null);   // active base tile layer
  const layerGroups   = useRef({});     // { listName: L.MarkerClusterGroup }
  const roadsideGrp   = useRef(null);
  const newsLayers    = useRef({});
  const fileInputRef  = useRef(null);
  const touchStartY   = useRef(null);

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

  // ── Init map (retry until Leaflet + DOM both ready) ─────────────────────
  useEffect(() => {
    if (phase !== "app") return;
    let attempts = 0;
    const tryInit = () => {
      if (leafletMap.current) return;
      if (!mapRef.current || !window.L || !window.L.markerClusterGroup) {
        if (++attempts < 30) setTimeout(tryInit, 150);
        return;
      }
      const L   = window.L;
      const map = L.map(mapRef.current, { center:[39.5,-98.35], zoom:4 });
      const tl  = TILE_LAYERS.satellite;
      baseTileRef.current = L.tileLayer(tl.url, { attribution:tl.attribution, maxZoom:22, tileSize:256 }).addTo(map);
      leafletMap.current  = map;
      roadsideGrp.current = L.markerClusterGroup({ maxClusterRadius:50 }).addTo(map);
    };
    tryInit();
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

  // ── Geocode unplaced pins for a list ─────────────────────────────────────
  const startGeocode = useCallback((listName) => {
    const pending = lists[listName]?.pending || [];
    if (!pending.length) return;
    setGeocodeState({ listName, pending, index:0, result:null, loading:true, placed:0, skipped:0 });
    geocodePin(listName, pending, 0);
  }, [lists]);

  const geocodePin = useCallback(async (listName, pending, index) => {
    if (index >= pending.length) {
      setGeocodeState(g => g ? { ...g, loading:false, done:true } : null);
      return;
    }
    const pin = pending[index];
    setGeocodeState(g => g ? { ...g, index, loading:true, result:null } : null);
    try {
      const q = encodeURIComponent(pin.title + ", United States");
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`, {
        headers:{"User-Agent":"BuildingIntelApp/1.0"}
      });
      const data = await res.json();
      setGeocodeState(g => g ? { ...g, loading:false, result: data[0]||null } : null);
    } catch {
      setGeocodeState(g => g ? { ...g, loading:false, result:null } : null);
    }
  }, []);

  const acceptGeocodeResult = useCallback(() => {
    setGeocodeState(g => {
      if (!g || !g.result) return g;
      const { listName, pending, index, result } = g;
      const pin = pending[index];
      const newEntry = { title:pin.title, note:pin.note, lat:+result.lat, lng:+result.lon, url:pin.url };
      setLists(prev => {
        const list = prev[listName];
        const newPending = list.pending.filter((_,i)=>i!==index);
        return { ...prev, [listName]: { ...list, ready:[...(list.ready||[]), newEntry], pending:newPending } };
      });
      const newPending = pending.filter((_,i)=>i!==index);
      const newIndex = index < newPending.length ? index : newPending.length-1;
      if (newPending.length === 0) return { ...g, pending:[], done:true, placed:(g.placed||0)+1 };
      const next = { ...g, pending:newPending, index:newIndex, placed:(g.placed||0)+1, loading:true, result:null };
      setTimeout(() => geocodePin(listName, newPending, newIndex), 1200);
      return next;
    });
  }, [geocodePin]);

  const skipGeocodeResult = useCallback(() => {
    setGeocodeState(g => {
      if (!g) return null;
      const { listName, pending, index } = g;
      const nextIndex = index + 1;
      if (nextIndex >= pending.length) return { ...g, done:true, skipped:(g.skipped||0)+1 };
      setTimeout(() => geocodePin(listName, pending, nextIndex), 1200);
      return { ...g, index:nextIndex, loading:true, result:null, skipped:(g.skipped||0)+1 };
    });
  }, [geocodePin]);

  // ── News scan ─────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    if (scanning || !scanLocation.trim()) return;
    const cat = NEWS_CATS.find(c=>c.id===scanCat);
    setScanning(true); setScanStatus("Searching the web…");
    try {
      if (!apiKey.trim()) { setScanStatus("⚠️ Add your Anthropic API key in ⚙️ Settings first"); setScanning(false); return; }
      const res  = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST", headers:{"Content-Type":"application/json","x-api-key":apiKey.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:1000,
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
  // MAIN APP  — mobile-first: full-screen map + slide-up drawer
  // ════════════════════════════════════════════════════════════════════════════
  const currentScanCat = NEWS_CATS.find(c=>c.id===scanCat);
  const DRAWER_PEEK = 96; // px visible when closed

  return (
    <div style={{position:"relative",width:"100vw",height:"100vh",overflow:"hidden",fontFamily:"'Figtree',sans-serif",background:"#060d18"}}>

      {/* ══ FULL-SCREEN MAP ═══════════════════════════════════════════════════ */}
      <div ref={mapRef} style={{position:"absolute",inset:0,zIndex:0}}
        onClick={()=>setDrawerOpen(false)}/>

      {/* ══ TOP BAR ════════════════════════════════════════════════════════════ */}
      <div style={{
        position:"absolute",top:0,left:0,right:0,zIndex:800,
        padding:"10px 14px 8px",
        background:"linear-gradient(180deg,rgba(6,13,24,.92) 0%,transparent 100%)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        pointerEvents:"none"
      }}>
        <div style={{pointerEvents:"auto"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"#d8eaff",letterSpacing:2,lineHeight:1}}>BUILDING INTEL</div>
          <div style={{color:"#2a4a6a",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>
            {totalPins.toLocaleString()} pins · {roadsidePins.length} roadside
          </div>
        </div>

        {/* Basemap switcher + settings */}
        <div style={{display:"flex",gap:5,alignItems:"center",pointerEvents:"auto"}}>
          {Object.entries(TILE_LAYERS).map(([key,tl])=>(
            <button key={key} onClick={e=>{e.stopPropagation();setMapStyle(key);}} style={{
              background: mapStyle===key ? "rgba(255,255,255,.95)" : "rgba(6,13,24,.75)",
              border: `1.5px solid ${mapStyle===key?"#ff6b35":"rgba(255,255,255,.2)"}`,
              borderRadius:8, color: mapStyle===key?"#111":"#8ab0cc",
              padding:"5px 9px", fontSize:11,
              fontWeight: mapStyle===key?700:400,
              cursor:"pointer", backdropFilter:"blur(8px)",
              whiteSpace:"nowrap"
            }}>{tl.label}</button>
          ))}
          <button onClick={e=>{e.stopPropagation();setShowSettings(s=>!s);}} style={{
            background:"rgba(6,13,24,.75)", border:"1.5px solid rgba(255,255,255,.2)",
            borderRadius:8, color:"#8ab0cc", padding:"5px 9px", fontSize:14,
            cursor:"pointer", backdropFilter:"blur(8px)"
          }}>⚙️</button>
        </div>
      </div>

      {/* ══ SETTINGS PANEL ════════════════════════════════════════════════════ */}
      {showSettings&&(
        <div onClick={e=>e.stopPropagation()} style={{
          position:"absolute",top:60,right:12,zIndex:1200,
          background:"#0c1828",border:"1px solid #1e3a5c",
          borderRadius:14,padding:"18px 20px",width:290,
          boxShadow:"0 8px 32px rgba(0,0,0,.7)"
        }}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"#d8eaff",letterSpacing:2,marginBottom:4}}>SETTINGS</div>

          {/* API Key */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",color:"#2a4a6a",fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5,marginBottom:6}}>
              ANTHROPIC API KEY <span style={{color:"#ff6b35"}}>(required for News Scan)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e=>{setApiKey(e.target.value);localStorage.setItem("bi-apikey",e.target.value);}}
              placeholder="sk-ant-..."
              style={{width:"100%",boxSizing:"border-box",background:"#0b1828",border:"1px solid #1e3a5c",borderRadius:8,color:"#b8d4f0",padding:"9px 12px",fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none"}}
            />
            <div style={{color:"#1e3a5c",fontSize:10,marginTop:5,lineHeight:1.5}}>
              Get a key at <a href="https://console.anthropic.com" target="_blank" style={{color:"#3a6aaa"}}>console.anthropic.com</a> → API Keys. Stored only on your device.
            </div>
          </div>

          {/* Overlay note */}
          <div style={{background:"#07101e",border:"1px solid #0f2035",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
            <div style={{color:"#ff6b35",fontSize:11,fontWeight:700,marginBottom:4}}>📍 About the floating button</div>
            <div style={{color:"#2a4a6a",fontSize:11,lineHeight:1.5}}>
              Android apps can't float over other apps unless they're native — PWA web apps like this one can't do a true system overlay. Best approach while driving: keep Building Intel open, use your car's navigation separately (Google Maps on dashboard), and tap 📍 when you spot something.
            </div>
          </div>

          <button onClick={()=>setShowSettings(false)} style={{
            width:"100%",background:"#ff6b35",border:"none",borderRadius:8,
            color:"#fff",padding:"10px",cursor:"pointer",
            fontFamily:"'Bebas Neue',sans-serif",fontSize:15,letterSpacing:2
          }}>DONE</button>
        </div>
      )}

      {/* ══ ROADSIDE SAVE BUTTON ══════════════════════════════════════════════ */}
      <button onClick={e=>{e.stopPropagation();saveRoadside();}} disabled={gpsLoading} style={{
        position:"absolute",
        bottom: drawerOpen ? `calc(${DRAWER_PEEK}px + 52vh + 16px)` : `${DRAWER_PEEK+16}px`,
        right:16, zIndex:900,
        width:68, height:68, borderRadius:"50%",
        background:gpsLoading?"#0f2035":"linear-gradient(135deg,#00e676,#00a84f)",
        border:"3px solid rgba(255,255,255,.25)",
        boxShadow:gpsLoading?"0 4px 20px rgba(0,0,0,.5)":"0 4px 28px rgba(0,230,118,.55),0 0 0 7px rgba(0,230,118,.12)",
        cursor:gpsLoading?"not-allowed":"pointer",
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,
        animation:gpsLoading?"none":"roadside-pulse 2.5s infinite",
        transition:"bottom .3s ease, all .2s"
      }}>
        <span style={{fontSize:26,lineHeight:1}}>{gpsLoading?"📡":"📍"}</span>
        <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:9,letterSpacing:1,color:gpsLoading?"#2a4a6a":"#002d15"}}>
          {gpsLoading?"GPS":"SAVE"}
        </span>
      </button>

      {/* ══ FIT MAP BUTTON ════════════════════════════════════════════════════ */}
      {totalPins>0&&(
        <button onClick={e=>{e.stopPropagation();
          const coords=Object.values(lists).flatMap(l=>(l.ready||[]).map(e=>[e.lat,e.lng]));
          if(coords.length&&leafletMap.current) leafletMap.current.fitBounds(coords,{padding:[60,60]});
        }} style={{
          position:"absolute",
          bottom: drawerOpen ? `calc(${DRAWER_PEEK}px + 52vh + 92px)` : `${DRAWER_PEEK+88}px`,
          right:16, zIndex:900,
          background:"rgba(6,13,24,.8)", border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10, color:"#8ab0cc", padding:"8px 12px",
          cursor:"pointer", fontSize:11, backdropFilter:"blur(8px)",
          fontFamily:"'JetBrains Mono',monospace", whiteSpace:"nowrap",
          transition:"bottom .3s ease"
        }}>🗺 Fit all {totalPins} pins</button>
      )}

      {/* ══ BOTTOM DRAWER ═════════════════════════════════════════════════════ */}
      <div
        onTouchStart={e=>{ touchStartY.current = e.touches[0].clientY; }}
        onTouchEnd={e=>{
          if (touchStartY.current === null) return;
          const dy = touchStartY.current - e.changedTouches[0].clientY;
          if (dy > 40) setDrawerOpen(true);
          else if (dy < -40) setDrawerOpen(false);
          touchStartY.current = null;
        }}
        style={{
        position:"absolute",bottom:0,left:0,right:0,zIndex:800,
        background:"#07101e",
        borderRadius:"20px 20px 0 0",
        boxShadow:"0 -4px 32px rgba(0,0,0,.6)",
        height: drawerOpen ? "62vh" : `${DRAWER_PEEK}px`,
        transition:"height .3s cubic-bezier(.4,0,.2,1)",
        display:"flex",flexDirection:"column",
        overflow:"hidden"
      }} onClick={e=>e.stopPropagation()}>

        {/* Drag handle + tap to toggle */}
        <div onClick={()=>setDrawerOpen(o=>!o)} style={{
          padding:"10px 0 0", cursor:"pointer", flexShrink:0,
          display:"flex",flexDirection:"column",alignItems:"center",gap:8
        }}>
          <div style={{width:40,height:4,background:"#1a3050",borderRadius:2}}/>

          {/* Tabs row */}
          <div style={{display:"flex",width:"100%",borderBottom:"1px solid #0f2035"}}>
            {[
              {id:"layers",label:"📋 My Lists"},
              {id:"news",   label:"📰 News Scan"},
              {id:"roadside",label:"📍 Roadside"},
            ].map(tab=>(
              <button key={tab.id} onClick={e=>{e.stopPropagation();setActiveTab(tab.id);setDrawerOpen(true);}} style={{
                flex:1, padding:"9px 4px",
                background:activeTab===tab.id?"#0d1e30":"transparent",
                border:"none",
                borderBottom:activeTab===tab.id?"2px solid #ff6b35":"2px solid transparent",
                color:activeTab===tab.id?"#d8eaff":"#2a4a6a",
                fontSize:11,fontWeight:activeTab===tab.id?700:400,
                cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",letterSpacing:.3
              }}>
                {tab.label}
                {tab.id==="roadside"&&roadsidePins.length>0&&(
                  <span style={{marginLeft:4,background:"#00e676",color:"#003300",fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:8}}>{roadsidePins.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",overscrollBehavior:"contain"}}>

          {/* ── MY LISTS ──────────────────────────────────────────────────── */}
          {activeTab==="layers"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5}}>YOUR GOOGLE MAPS LISTS</span>
                <button onClick={()=>setPhase("import")} style={{background:"none",border:"1px solid #0f2035",borderRadius:5,color:"#2a4a6a",fontSize:10,cursor:"pointer",padding:"2px 8px",fontFamily:"'JetBrains Mono',monospace"}}>Re-import</button>
              </div>

              {Object.keys(lists).length===0?(
                <div style={{textAlign:"center",padding:"32px 0",color:"#1e3a5c"}}>
                  <div style={{fontSize:36,marginBottom:8}}>📭</div>
                  <div style={{fontSize:13,marginBottom:12}}>No lists imported yet</div>
                  <button onClick={()=>setPhase("import")} style={{background:"#ff6b35",border:"none",borderRadius:8,color:"#fff",padding:"10px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>Import ZIP</button>
                </div>
              ):Object.entries(lists).map(([name,data])=>{
                const on=layerVis[name]!==false;
                const rc=data.ready?.length||0, pc=data.pending?.length||0;
                return(
                  <div key={name}>
                  <div onClick={()=>toggleLayer(name)} style={{
                    display:"flex",alignItems:"center",gap:10,padding:"11px 13px",
                    borderRadius:10,marginBottom:5,cursor:"pointer",
                    background:on?`${data.color}12`:"transparent",
                    border:`1px solid ${on?data.color+"35":"#0f1e30"}`,
                    transition:"all .15s"
                  }}>
                    <div style={{width:12,height:12,borderRadius:6,background:on?data.color:"#1a3050",flexShrink:0}}/>
                    <span style={{fontSize:18,flexShrink:0}}>{data.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:on?"#c0d8f0":"#2a4a6a",fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
                      <div style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>
                        {rc} on map{pc>0?` · ${pc} not yet placed`:""}
                      </div>
                    </div>
                    {rc>0&&<span style={{background:on?data.color:"#1a3050",color:on?"#000":"#2a4a6a",fontSize:11,fontWeight:800,padding:"2px 9px",borderRadius:10,flexShrink:0}}>{rc}</span>}
                  </div>
                  {pc>0&&!geocodeState&&(
                    <button onClick={e=>{e.stopPropagation();setDrawerOpen(true);startGeocode(name);}} style={{
                      marginTop:5,width:"100%",background:"transparent",
                      border:`1px dashed ${data.color}55`,borderRadius:7,
                      color:data.color,padding:"6px",cursor:"pointer",
                      fontSize:11,fontFamily:"'JetBrains Mono',monospace"
                    }}>
                      📍 Place {pc} unplaced pins
                    </button>
                  )}
                  </div>
                );
              })}

              {/* Geocode panel */}
              {geocodeState && (
                <div style={{background:"#0b1828",border:`1px solid ${geocodeState.done?"#4ade80":"#ff6b35"}`,borderRadius:12,padding:"14px 16px",marginTop:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:15,color:"#d8eaff",letterSpacing:1.5}}>
                      PLACING: {geocodeState.listName.split(" ")[0].toUpperCase()}
                    </div>
                    <button onClick={()=>setGeocodeState(null)} style={{background:"none",border:"none",color:"#2a4a6a",fontSize:18,cursor:"pointer"}}>✕</button>
                  </div>

                  {geocodeState.done ? (
                    <div style={{textAlign:"center",padding:"8px 0"}}>
                      <div style={{color:"#4ade80",fontSize:14,fontWeight:700,marginBottom:4}}>✓ Done!</div>
                      <div style={{color:"#3a5a78",fontSize:12}}>Placed: {geocodeState.placed||0} · Skipped: {geocodeState.skipped||0}</div>
                      <button onClick={()=>setGeocodeState(null)} style={{marginTop:10,background:"#4ade80",border:"none",borderRadius:8,color:"#003300",padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>Close</button>
                    </div>
                  ) : (
                    <>
                      <div style={{color:"#2a4a6a",fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:6}}>
                        {geocodeState.index+1} of {geocodeState.pending.length} · ✓{geocodeState.placed||0} placed · ↷{geocodeState.skipped||0} skipped
                      </div>

                      {/* Current pin being looked up */}
                      <div style={{background:"#07101e",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                        <div style={{color:"#c0d8f0",fontSize:13,fontWeight:600,marginBottom:4}}>
                          {geocodeState.pending[geocodeState.index]?.title}
                        </div>
                        {geocodeState.pending[geocodeState.index]?.note && (
                          <div style={{color:"#2a4a6a",fontSize:11}}>{geocodeState.pending[geocodeState.index].note}</div>
                        )}
                      </div>

                      {/* Result */}
                      {geocodeState.loading ? (
                        <div style={{color:"#2a4a6a",fontSize:12,fontFamily:"'JetBrains Mono',monospace",padding:"6px 0"}}>🔍 Looking up location…</div>
                      ) : geocodeState.result ? (
                        <div>
                          <div style={{background:"#071a0f",border:"1px solid #00e67633",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                            <div style={{color:"#00c853",fontSize:11,fontWeight:700,marginBottom:2}}>✓ Found a match</div>
                            <div style={{color:"#3a5a78",fontSize:12,lineHeight:1.4}}>{geocodeState.result.display_name}</div>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={acceptGeocodeResult} style={{flex:1,background:"#00e676",border:"none",borderRadius:8,color:"#003300",padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>
                              ✓ Place It
                            </button>
                            <button onClick={skipGeocodeResult} style={{flex:1,background:"#0b1828",border:"1px solid #1e3a5c",borderRadius:8,color:"#3a5a78",padding:"10px",cursor:"pointer",fontSize:13}}>
                              Skip →
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{background:"#1a0505",border:"1px solid #ff4d4d33",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                            <div style={{color:"#ff4d4d",fontSize:11,fontWeight:700}}>✗ Couldn't find this location</div>
                          </div>
                          <button onClick={skipGeocodeResult} style={{width:"100%",background:"#0b1828",border:"1px solid #1e3a5c",borderRadius:8,color:"#3a5a78",padding:"10px",cursor:"pointer",fontSize:13}}>
                            Skip →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {Object.keys(lists).length>0&&!geocodeState&&(
                <div style={{marginTop:8,padding:"10px 14px",background:"#090f1c",borderRadius:8,border:"1px solid #0f1e30"}}>
                  <div style={{color:"#2a4a6a",fontSize:11,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.5}}>
                    💡 <strong style={{color:"#3a5a78"}}>Not yet placed</strong> = saved by name in Google Maps without GPS. Tap <strong style={{color:"#ff6b35"}}>Place Unplaced</strong> on any list to look them up and put them on the map.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NEWS SCAN ──────────────────────────────────────────────────── */}
          {activeTab==="news"&&(
            <div>
              <label style={{display:"block",color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5,marginBottom:6}}>LOCATION TARGET</label>
              <input value={scanLocation} onChange={e=>setScanLocation(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!scanning&&runScan()}
                placeholder="e.g.  Detroit, MI"
                style={{width:"100%",boxSizing:"border-box",background:"#0b1828",border:"1px solid #152540",borderRadius:8,color:"#b8d4f0",padding:"10px 14px",fontSize:13,fontFamily:"'JetBrains Mono',monospace",outline:"none",marginBottom:12}}/>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:12}}>
                {NEWS_CATS.map(c=>(
                  <button key={c.id} onClick={()=>setScanCat(c.id)} style={{
                    background:scanCat===c.id?`${c.color}20`:"transparent",
                    border:`1px solid ${scanCat===c.id?c.color:"#0f2035"}`,
                    borderRadius:8,color:scanCat===c.id?c.color:"#2a4a6a",
                    padding:"9px 10px",fontSize:12,fontWeight:scanCat===c.id?700:400,
                    cursor:"pointer",textAlign:"left",
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
                border:"none",borderRadius:8,color:scanning?"#2a4a6a":"#fff",
                padding:"13px",cursor:scanning?"not-allowed":"pointer",
                fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,marginBottom:10
              }}>
                {scanning?"⏳  SCANNING…":"🔍  SCAN NOW"}
              </button>

              {!apiKey&&!scanning&&(
                <div style={{padding:"8px 12px",background:"#1a0a00",borderRadius:6,marginBottom:8,borderLeft:"3px solid #ff6b35",color:"#ff6b35",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
                  ⚠️ Tap <strong>⚙️</strong> (top right) → add your Anthropic API key to enable scanning
                </div>
              )}

              {scanStatus&&(
                <div style={{padding:"8px 12px",background:"#0b1828",borderRadius:6,marginBottom:10,
                  borderLeft:`3px solid ${scanStatus.startsWith("✓")?"#4ade80":scanStatus.startsWith("Error")?"#ff4d4d":"#3a6080"}`,
                  color:scanStatus.startsWith("✓")?"#4ade80":scanStatus.startsWith("Error")?"#ff4d4d":"#3a6080",
                  fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
                  {scanStatus}
                </div>
              )}

              {(newsResults[scanCat]||[]).map((r,i)=>(
                <div key={i} onClick={()=>{if(r.lat&&leafletMap.current){leafletMap.current.flyTo([r.lat,r.lng],17,{duration:1.2});setDrawerOpen(false);}}}
                  style={{background:"#090f1c",border:"1px solid #0f1e30",borderRadius:8,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{background:`${currentScanCat.color}22`,color:currentScanCat.color,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4}}>{r.incident_type||currentScanCat.label.toUpperCase()}</span>
                    <span style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>{r.date}</span>
                  </div>
                  <div style={{color:"#c0d8f0",fontSize:13,fontWeight:600,lineHeight:1.35,marginBottom:4}}>{r.title}</div>
                  <div style={{color:"#2a4a6a",fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:5}}>📍 {r.address}, {r.city}</div>
                  {r.url&&<a href={r.url} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:currentScanCat.color,fontSize:11,fontWeight:700,textDecoration:"none"}}>↗ Article</a>}
                </div>
              ))}
            </div>
          )}

          {/* ── ROADSIDE ───────────────────────────────────────────────────── */}
          {activeTab==="roadside"&&(
            <div>
              <button onClick={e=>{e.stopPropagation();saveRoadside();}} disabled={gpsLoading} style={{
                width:"100%",padding:"16px",
                background:gpsLoading?"#0f2035":"linear-gradient(135deg,#00e676,#00a84f)",
                border:"none",borderRadius:10,color:gpsLoading?"#2a4a6a":"#002d15",
                fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,
                cursor:gpsLoading?"not-allowed":"pointer",marginBottom:14
              }}>
                {gpsLoading?"📡  GETTING GPS…":"📍  SAVE CURRENT LOCATION"}
              </button>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:1.5}}>{roadsidePins.length} SAVED FINDS</span>
                {roadsidePins.length>0&&(
                  <button onClick={()=>{if(confirm("Clear all roadside finds?"))setRoadsidePins([]);}}
                    style={{background:"none",border:"none",color:"#ff4d4d",fontSize:11,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>✕ clear all</button>
                )}
              </div>

              {roadsidePins.length===0?(
                <div style={{textAlign:"center",padding:"32px 0",color:"#1e3a5c"}}>
                  <div style={{fontSize:36,marginBottom:8}}>📍</div>
                  <div style={{fontSize:12}}>No roadside finds yet</div>
                  <div style={{fontSize:11,marginTop:4,color:"#1a3050"}}>Tap the green button on the map while driving</div>
                </div>
              ):roadsidePins.map((pin,i)=>(
                <div key={i} style={{background:"#090f1c",border:"1px solid #00e67618",borderRadius:9,padding:"11px 13px",marginBottom:6}}>
                  {editPin===i?(
                    <div>
                      <input defaultValue={pin.title} id={`et-${i}`}
                        style={{width:"100%",boxSizing:"border-box",background:"#0b1828",border:"1px solid #152540",borderRadius:8,color:"#b8d4f0",padding:"8px 12px",fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",marginBottom:6}}
                        placeholder="Label / name"/>
                      <input defaultValue={pin.note} id={`en-${i}`}
                        style={{width:"100%",boxSizing:"border-box",background:"#0b1828",border:"1px solid #152540",borderRadius:8,color:"#b8d4f0",padding:"8px 12px",fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",marginBottom:8}}
                        placeholder="Notes (optional)"/>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{
                          const t=document.getElementById(`et-${i}`)?.value||"Roadside Find";
                          const n=document.getElementById(`en-${i}`)?.value||"";
                          setRoadsidePins(p=>p.map((x,j)=>j===i?{...x,title:t,note:n}:x));
                          setEditPin(null);
                        }} style={{flex:1,background:"#00e676",border:"none",borderRadius:6,color:"#003300",padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700}}>Save</button>
                        <button onClick={()=>setEditPin(null)}
                          style={{flex:1,background:"#0b1828",border:"1px solid #0f2035",borderRadius:6,color:"#3a5a78",padding:"8px",cursor:"pointer",fontSize:12}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <>
                      <div style={{color:"#00c853",fontSize:13,fontWeight:700,marginBottom:3}}>{pin.title}</div>
                      {pin.note&&<div style={{color:"#3a5a78",fontSize:12,marginBottom:3}}>{pin.note}</div>}
                      <div style={{color:"#1e3a5c",fontSize:10,fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>{pin.timestamp} · ±{pin.accuracy}m</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button onClick={()=>{if(leafletMap.current){leafletMap.current.flyTo([pin.lat,pin.lng],17,{duration:1.2});setDrawerOpen(false);}}}
                          style={{background:"#0b1828",border:"1px solid #0f2035",borderRadius:6,color:"#3a5a78",padding:"5px 11px",cursor:"pointer",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>🗺 Map</button>
                        <a href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`} target="_blank" rel="noopener"
                          style={{background:"#0b1828",border:"1px solid #00e67630",borderRadius:6,color:"#00c853",padding:"5px 11px",fontSize:11,textDecoration:"none",fontFamily:"'JetBrains Mono',monospace"}}>↗ Street View</a>
                        <button onClick={()=>setEditPin(i)}
                          style={{background:"#0b1828",border:"1px solid #0f2035",borderRadius:6,color:"#3a5a78",padding:"5px 11px",cursor:"pointer",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>✏️ Edit</button>
                        <button onClick={()=>setRoadsidePins(p=>p.filter((_,j)=>j!==i))}
                          style={{background:"none",border:"none",color:"#ff4d4d",padding:"5px 6px",cursor:"pointer",fontSize:11}}>✕</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ TOASTS ════════════════════════════════════════════════════════════ */}
      <div style={{position:"fixed",bottom:120,right:16,display:"flex",flexDirection:"column",gap:8,zIndex:2000,pointerEvents:"none"}}>
        {toasts.map(t=>(
          <div key={t.id} style={{
            background:t.type==="err"?"#1e0505":"#051a0a",
            border:`1px solid ${t.type==="err"?"#ff4d4d":"#00e676"}`,
            borderRadius:10,padding:"10px 16px",
            color:t.type==="err"?"#ff4d4d":"#00e676",
            fontSize:13,fontWeight:600,
            boxShadow:"0 4px 20px rgba(0,0,0,.45)",
            animation:"toast-in .25s ease"
          }}>{t.msg}</div>
        ))}
      </div>

      {/* ══ STYLES ════════════════════════════════════════════════════════════ */}
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
