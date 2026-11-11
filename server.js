require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const MODE = (process.env.RAIL_DATA_MODE || "demo").toLowerCase();
const API_BASE = (process.env.RAIL_API_BASE_URL || "https://api.railradar.in").replace(/\/+$/, "");
const API_KEY = process.env.RAIL_API_KEY || "";

const demoTrains = [
  { number:"12301", name:"Howrah Rajdhani Express", from:"HWH", to:"NDLS", fromName:"Howrah Jn", toName:"New Delhi", depart:"16:50", arrive:"10:05", duration:"17h 15m", days:"Daily", type:"Rajdhani", classes:["1A","2A","3A"], price:2950, score:96, avgDelay:8, available:"Check live availability" },
  { number:"12309", name:"Tejas Rajdhani Express", from:"RJPB", to:"NDLS", fromName:"Rajendra Nagar Terminal", toName:"New Delhi", depart:"19:10", arrive:"07:40", duration:"12h 30m", days:"Daily", type:"Rajdhani", classes:["1A","2A","3A"], price:2650, score:94, avgDelay:14, available:"Check live availability" },
  { number:"12565", name:"Bihar Sampark Kranti", from:"DBG", to:"NDLS", fromName:"Darbhanga", toName:"New Delhi", depart:"08:25", arrive:"05:15", duration:"20h 50m", days:"Daily", type:"Superfast", classes:["2A","3A","SL"], price:1450, score:88, avgDelay:22, available:"Check live availability" },
  { number:"22435", name:"Vande Bharat Express", from:"BSB", to:"NDLS", fromName:"Varanasi", toName:"New Delhi", depart:"15:00", arrive:"23:00", duration:"8h 00m", days:"Except Thu", type:"Vande Bharat", classes:["CC","EC"], price:1800, score:92, avgDelay:6, available:"Check live availability" }
];
const demoStations = [
  ["NDLS","New Delhi","Delhi"],["HWH","Howrah Junction","West Bengal"],["SBC","KSR Bengaluru","Karnataka"],
  ["MMCT","Mumbai Central","Maharashtra"],["RJPB","Rajendra Nagar Terminal","Bihar"],["BSB","Varanasi","Uttar Pradesh"],
  ["DBG","Darbhanga","Bihar"],["ASR","Amritsar","Punjab"],["MAS","Chennai Central","Tamil Nadu"],
  ["HYB","Hyderabad Deccan","Telangana"],["JP","Jaipur","Rajasthan"],["ADI","Ahmedabad","Gujarat"],
  ["BPL","Bhopal","Madhya Pradesh"],["GHY","Guwahati","Assam"],["BBS","Bhubaneswar","Odisha"],
  ["ERS","Ernakulam Jn","Kerala"],["LKO","Lucknow","Uttar Pradesh"],["PNBE","Patna Jn","Bihar"],
  ["PUNE","Pune Jn","Maharashtra"],["JAT","Jammu Tawi","Jammu & Kashmir"]
].map(([code,name,state]) => ({ code, name, city: state, state }));

function requireLiveConfig() {
  if (!API_KEY) {
    const e = new Error("RAIL_API_KEY is missing. Add it to .env and restart the server.");
    e.status = 503;
    throw e;
  }
}
async function railradar(endpoint, params = {}) {
  requireLiveConfig();
  const url = new URL(`${API_BASE}/v1${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = body?.error?.message || body?.message || `RailRadar API returned HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status || 502;
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}
function minutesToDuration(minutes) {
  if (!Number.isFinite(Number(minutes))) return "—";
  const h = Math.floor(Number(minutes) / 60), m = Number(minutes) % 60;
  return `${h}h ${String(m).padStart(2,"0")}m`;
}
function normaliseTrain(item) {
  const t = item.train || item;
  const from = item.from || {};
  const to = item.to || {};
  const durationMinutes = Number(item.duration ?? t.duration);
  return {
    number: String(t.number || item.trainNumber || ""),
    name: t.name || item.trainName || "Train",
    from: from.code || item.fromCode || "",
    to: to.code || item.toCode || "",
    fromName: from.name || from.city || from.code || "",
    toName: to.name || to.city || to.code || "",
    depart: from.departure || from.departureTime || "—",
    arrive: to.arrival || to.arrivalTime || "—",
    duration: minutesToDuration(durationMinutes),
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
    days: Array.isArray(t.runDays) ? t.runDays.join(", ").toUpperCase() : (t.days || "Schedule varies"),
    type: t.type || t.category || "Express",
    classes: t.classes || t.availableClasses || [],
    price: null,
    score: null,
    avgDelay: item.live?.delayMinutes ?? null,
    available: item.live?.status || "Check seat availability",
    route: ""
  };
}
function sendError(res, error) {
  const status = Number(error.status) || 502;
  res.status(status).json({ error: error.message || "Rail data request failed", code: error.code || null });
}

app.get("/api/health", (_req, res) => res.json({
  ok: true, mode: MODE, provider: "RailRadar",
  liveConfigured: Boolean(API_KEY && API_BASE),
  message: MODE === "live" ? (API_KEY ? "Live provider configured" : "Missing API key") : "Demo mode: sample data only"
}));

// Station autocomplete. In live mode query RailRadar for current station matches.
app.get("/api/stations", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (MODE === "live" && q.length >= 1) {
    try {
      const result = await railradar("/lookup/search/stations", { q, limit: 15 });
      const list = Array.isArray(result.data) ? result.data : (result.data?.stations || []);
      return res.json({ data: list.map(s => ({
        code: s.code || s.stationCode || "",
        name: s.name || s.stationName || "",
        city: s.city || "",
        state: s.state || ""
      })), mode: "live", meta: result.meta });
    } catch (error) { return sendError(res, error); }
  }
  const list = q
    ? demoStations.filter(s => `${s.code} ${s.name} ${s.city} ${s.state}`.toLowerCase().includes(q.toLowerCase()))
    : demoStations;
  res.json({ data: list, mode: "demo" });
});

// Trains between two stations. RailRadar returns {data:{trains:[...]}}.
app.get("/api/search", async (req, res) => {
  const from = String(req.query.from || "").trim().toUpperCase();
  const to = String(req.query.to || "").trim().toUpperCase();
  const date = String(req.query.date || "").trim();
  if (!from || !to) return res.status(400).json({ error: "Select both origin and destination station codes." });
  if (from === to) return res.status(400).json({ error: "Origin and destination must be different." });
  if (MODE === "live") {
    try {
      const result = await railradar(`/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`, { date, live: true });
      const raw = result.data?.trains || (Array.isArray(result.data) ? result.data : []);
      return res.json({ data: raw.map(normaliseTrain), mode: "live", meta: result.meta });
    } catch (error) { return sendError(res, error); }
  }
  const data = demoTrains.filter(t => t.from === from && t.to === to);
  res.json({ data, mode: "demo", notice: "Illustrative sample only — not live train inventory, timings or fares." });
});

app.get("/api/live/:trainNo", async (req, res) => {
  const trainNo = String(req.params.trainNo || "").trim();
  if (MODE === "live") {
    try {
      const result = await railradar(`/trains/${encodeURIComponent(trainNo)}/live`, { date: req.query.date });
      const d = result.data || {};
      return res.json({ data: {
        trainNumber: d.trainNumber || trainNo,
        trainName: d.trainName || d.train?.name || "",
        status: d.status || "Status unavailable",
        delayMinutes: d.delayMinutes ?? d.delay?.minutes ?? 0,
        lastUpdated: d.lastUpdatedAt || result.meta?.timestamp || null,
        currentStation: d.currentLocation?.stationName || d.currentLocation?.station?.name || d.currentLocation?.stationCode || "See route details",
        nextStation: d.nextStation?.name || d.nextStation?.stationName || "Not available",
        note: `Source: ${result.meta?.source || "RailRadar"} · ${d.lastUpdatedAt || result.meta?.timestamp || "Update time unavailable"}`
      }, raw: d, mode: "live", meta: result.meta });
    } catch (error) { return sendError(res, error); }
  }
  const t = demoTrains.find(x => x.number === trainNo);
  if (!t) return res.status(404).json({ error: "Train not found in demo data." });
  res.json({ data: { trainNumber:t.number, trainName:t.name, status:"Demo only", delayMinutes:null, lastUpdated:null, currentStation:"Not available in demo mode", nextStation:"Not available", note:"Sample only. Switch to live mode for provider data." }, mode:"demo" });
});

app.get("/api/pnr/:pnr", async (req, res) => {
  const pnr = String(req.params.pnr || "");
  if (!/^\d{10}$/.test(pnr)) return res.status(400).json({ error: "PNR must contain exactly 10 digits." });
  if (MODE !== "live") return res.status(503).json({ error: "PNR enquiry is disabled in demo mode. Configure live mode to query RailRadar." });
  try {
    const result = await railradar(`/pnr/${pnr}`);
    const d = result.data || {};
    const passengerStatuses = (d.passengers || []).map(p =>
      `Passenger ${p.passengerNumber}: ${p.currentStatus || p.bookingStatus || "Status unavailable"}${p.coach ? ` · ${p.coach}/${p.berthNumber || ""}` : ""}`
    ).join(" | ");
    res.json({ data: {
      pnr: d.pnrNumber || pnr,
      status: passengerStatuses || d.charting?.status || "PNR retrieved",
      message: `${d.train?.number || ""} ${d.train?.name || ""} · ${d.train?.source?.name || ""} → ${d.train?.destination?.name || ""} · ${d.journey?.date || ""} · ${d.charting?.status || ""}${passengerStatuses ? ` · ${passengerStatuses}` : ""}`,
      raw: d
    }, mode: "live", meta: result.meta });
  } catch (error) { sendError(res, error); }
});

// Seat availability: required parameters are train, source, destination, date and class.
app.get("/api/seats/:trainNo", async (req, res) => {
  const { source, destination, journeyDate, classCode, quotaCode = "GN" } = req.query;
  if (!source || !destination || !journeyDate || !classCode) {
    return res.status(400).json({ error: "Required: source, destination, journeyDate (YYYY-MM-DD), classCode." });
  }
  if (MODE !== "live") return res.status(503).json({ error: "Seat availability requires live mode." });
  try {
    const result = await railradar(`/trains/${encodeURIComponent(req.params.trainNo)}/seats`, {
      source, destination, journeyDate, classCode, quotaCode
    });
    res.json({ data: result.data, mode: "live", meta: result.meta });
  } catch (error) { sendError(res, error); }
});

app.get("/api/schedule/:trainNo", async (req, res) => {
  if (MODE !== "live") return res.status(503).json({ error: "Timetable requires live mode." });
  try {
    const result = await railradar(`/trains/${encodeURIComponent(req.params.trainNo)}`, { haltsOnly: req.query.haltsOnly });
    res.json({ data: result.data, mode: "live", meta: result.meta });
  } catch (error) { sendError(res, error); }
});

app.get("/api/recommendations", (_req, res) => res.json({ data: [
  { title:"Compare total journey time", detail:"Use the actual timetable duration and check the arrival time, not just departure time." },
  { title:"Verify seat availability", detail:"Seat availability is date-, class- and quota-specific. Recheck before booking." },
  { title:"Confirm critical details", detail:"RailRadar reservation data is aggregated from external sources. Verify PNR and booking details through official IRCTC channels." }
]}));

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`RailSmart AI running at http://localhost:${PORT} (${MODE} mode)`));
