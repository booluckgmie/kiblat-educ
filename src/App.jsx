import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Compass,
  LocateFixed,
  MapPin,
  Loader2,
  AlertTriangle,
  Sigma,
  ChevronDown,
  Info,
  Navigation2,
  Globe2,
  Radius,
  BookOpenText,
  CheckCircle2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Kaaba, Masjid al-Haram, Mecca — fixed reference point for every calculation.
const KAABA = { lat: 21.4225, lon: 39.8262 };

const EARTH_RADIUS_KM = 6371;

const DEFAULT_LOCATION = { lat: 51.5074, lon: -0.1278, label: 'London, UK' };

const PRESET_CITIES = [
  { label: 'London', lat: 51.5074, lon: -0.1278 },
  { label: 'New York', lat: 40.7128, lon: -74.006 },
  { label: 'Jakarta', lat: -6.2088, lon: 106.8456 },
  { label: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { label: 'Tokyo', lat: 35.6762, lon: 139.6503 },
];

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// ---------------------------------------------------------------------------
// Spherical trigonometry engine
//
//   Δλ = λ_K - λ
//   q  = atan2( sin(Δλ), cos(φ)·tan(φ_K) - sin(φ)·cos(Δλ) )
//
// Bearing is measured clockwise from true North and normalised to 0°-360°.
// ---------------------------------------------------------------------------
function computeQiblahBearing(lat, lon) {
  const phi = toRad(lat);
  const phiK = toRad(KAABA.lat);
  const lambda = toRad(lon);
  const lambdaK = toRad(KAABA.lon);

  const deltaLambda = lambdaK - lambda;

  const numerator = Math.sin(deltaLambda);
  const denominator = Math.cos(phi) * Math.tan(phiK) - Math.sin(phi) * Math.cos(deltaLambda);

  const qRad = Math.atan2(numerator, denominator);
  const qDeg = toDeg(qRad);
  const bearing = (qDeg + 360) % 360;

  // Great-circle distance (haversine) — a lightweight bonus figure.
  const dPhi = phiK - phi;
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi) * Math.cos(phiK) * Math.sin(deltaLambda / 2) ** 2;
  const distanceKm = 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return {
    phi,
    phiK,
    lambda,
    lambdaK,
    deltaLambda,
    deltaLambdaDeg: toDeg(deltaLambda),
    numerator,
    denominator,
    qRad,
    qDeg,
    bearing,
    distanceKm,
  };
}

function bearingToCompassLabel(bearing) {
  const labels = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(bearing / 22.5) % 16;
  return labels[index];
}

const fmt = (n, digits = 4) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

// ---------------------------------------------------------------------------
// UI subcomponents
// ---------------------------------------------------------------------------

function SectionCard({ children, className = '' }) {
  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-neutral-900/60 backdrop-blur-sm shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${className}`}
    >
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, subtitle, accent = 'emerald' }) {
  const accentClasses = {
    emerald: 'text-emerald-400 bg-emerald-400/10 ring-emerald-400/20',
    gold: 'text-amber-400 bg-amber-400/10 ring-amber-400/20',
  };
  return (
    <div className="flex items-start gap-3 px-5 pt-5 pb-3">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${accentClasses[accent]}`}>
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function CoordField({ label, value, onChange, min, max, step = '0.0001' }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-neutral-100 tabular-nums outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20"
      />
    </label>
  );
}

// Compass rose: fixed N/E/S/W dial, needle rotates to the calculated bearing.
function CompassRose({ bearing }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-[0_0_25px_rgba(16,185,129,0.08)]">
        <defs>
          <radialGradient id="dialGradient" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#1c1f1a" />
            <stop offset="100%" stopColor="#0a0b0a" />
          </radialGradient>
          <linearGradient id="needleGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#92400e" />
          </linearGradient>
          <linearGradient id="needleTail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="100%" stopColor="#18181b" />
          </linearGradient>
        </defs>

        <circle cx="100" cy="100" r="96" fill="url(#dialGradient)" stroke="#10b981" strokeOpacity="0.25" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="80" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1" />

        {ticks.map((deg) => {
          const isMajor = deg % 90 === 0;
          const isMid = deg % 30 === 0;
          const len = isMajor ? 14 : isMid ? 9 : 5;
          const x1 = 100 + 96 * Math.sin(toRad(deg));
          const y1 = 100 - 96 * Math.cos(toRad(deg));
          const x2 = 100 + (96 - len) * Math.sin(toRad(deg));
          const y2 = 100 - (96 - len) * Math.cos(toRad(deg));
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isMajor ? '#f59e0b' : '#52525b'}
              strokeOpacity={isMajor ? 0.9 : 0.5}
              strokeWidth={isMajor ? 2 : 1}
            />
          );
        })}

        {[
          { label: 'N', deg: 0, color: '#f59e0b' },
          { label: 'E', deg: 90, color: '#a1a1aa' },
          { label: 'S', deg: 180, color: '#a1a1aa' },
          { label: 'W', deg: 270, color: '#a1a1aa' },
        ].map(({ label, deg, color }) => {
          const x = 100 + 65 * Math.sin(toRad(deg));
          const y = 100 - 65 * Math.cos(toRad(deg));
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              fontWeight="700"
              fill={color}
            >
              {label}
            </text>
          );
        })}

        {/* Needle group rotates to the computed Qiblah bearing */}
        <g style={{ transform: `rotate(${bearing}deg)`, transformOrigin: '100px 100px', transition: 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}>
          <polygon points="100,26 92,102 100,112 108,102" fill="url(#needleGold)" stroke="#78350f" strokeWidth="0.5" />
          <polygon points="100,174 92,100 108,100" fill="url(#needleTail)" />
          <circle cx="100" cy="26" r="4" fill="#fde68a" />
        </g>

        <circle cx="100" cy="100" r="6" fill="#10b981" stroke="#052e1f" strokeWidth="1.5" />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-1">
        <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/20">
          Kaabah ↑
        </span>
      </div>
    </div>
  );
}

// Linear 0°-360° degree gauge showing the exact heading.
function DegreeGauge({ bearing }) {
  const pct = bearing / 360;
  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Heading from True North</span>
        <span className="font-mono text-sm font-semibold text-amber-400">{fmt(bearing, 2)}°</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-400 transition-all duration-700 ease-out"
          style={{ width: `${pct * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] transition-all duration-700 ease-out"
          style={{ left: `calc(${pct * 100}% - 2px)` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-600">
        <span>0°</span>
        <span>90°</span>
        <span>180°</span>
        <span>270°</span>
        <span>360°</span>
      </div>
    </div>
  );
}

function FormulaStep({ index, title, formula, result, note }) {
  return (
    <div className="relative border-l-2 border-emerald-400/20 pl-4">
      <span className="absolute -left-[9px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/20 text-[9px] font-bold text-emerald-300 ring-2 ring-neutral-900">
        {index}
      </span>
      <p className="text-xs font-medium text-neutral-400">{title}</p>
      <p className="mt-1 break-words font-mono text-[13px] text-neutral-200">{formula}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-emerald-400">{result}</p>
      {note && <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main application
// ---------------------------------------------------------------------------

export default function App() {
  const [lat, setLat] = useState(String(DEFAULT_LOCATION.lat));
  const [lon, setLon] = useState(String(DEFAULT_LOCATION.lon));
  const [locationLabel, setLocationLabel] = useState(DEFAULT_LOCATION.label);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | loading | success | error
  const [geoError, setGeoError] = useState('');
  const [showManifesto, setShowManifesto] = useState(false);

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const isValid = Number.isFinite(latNum) && Number.isFinite(lonNum) && Math.abs(latNum) <= 90 && Math.abs(lonNum) <= 180;

  const result = useMemo(() => {
    if (!isValid) return null;
    return computeQiblahBearing(latNum, lonNum);
  }, [latNum, lonNum, isValid]);

  const handleUseLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('error');
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }
    setGeoStatus('loading');
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLon(pos.coords.longitude.toFixed(6));
        setLocationLabel('Your current location');
        setGeoStatus('success');
      },
      (err) => {
        setGeoStatus('error');
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Enter coordinates manually below.'
            : 'Could not retrieve your location. Enter coordinates manually below.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const applyPreset = (city) => {
    setLat(String(city.lat));
    setLon(String(city.lon));
    setLocationLabel(city.label);
    setGeoStatus('idle');
    setGeoError('');
  };

  useEffect(() => {
    document.title = 'Qiblah Finder & Spherical Geometry Calculator';
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0b0a] text-neutral-100 antialiased">
      {/* Subtle geometric grid backdrop */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
        }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-emerald-500/[0.04] via-transparent to-transparent" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/30">
              <Compass className="h-6 w-6 text-white" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">Qiblah Finder</h1>
              <p className="text-xs text-neutral-500">Spherical Geometry Calculator</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1.5 text-[11px] font-medium text-amber-300">
            <Sigma className="h-3.5 w-3.5" />
            Great-Circle Bearing Engine
          </span>
        </header>

        {/* Top grid: location input + compass */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Location & inputs */}
          <SectionCard className="lg:col-span-2">
            <CardHeader icon={MapPin} title="Your Location" subtitle="GPS or manual coordinates" />
            <div className="space-y-4 px-5 pb-5">
              <button
                onClick={handleUseLocation}
                disabled={geoStatus === 'loading'}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {geoStatus === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LocateFixed className="h-4 w-4" />
                )}
                {geoStatus === 'loading' ? 'Locating…' : 'Use My Current Location'}
              </button>

              {geoStatus === 'error' && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{geoError}</span>
                </div>
              )}
              {geoStatus === 'success' && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Location acquired successfully.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <CoordField label="Latitude (φ)" value={lat} onChange={setLat} min={-90} max={90} />
                <CoordField label="Longitude (λ)" value={lon} onChange={setLon} min={-180} max={180} />
              </div>

              {!isValid && (
                <p className="text-xs text-red-400">Enter a valid latitude (-90 to 90) and longitude (-180 to 180).</p>
              )}

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Quick presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_CITIES.map((city) => (
                    <button
                      key={city.label}
                      onClick={() => applyPreset(city)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        locationLabel === city.label
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                          : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-neutral-200'
                      }`}
                    >
                      {city.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
                  <Globe2 className="h-3 w-3" /> Reference point (fixed)
                </p>
                <p className="mt-1 font-mono text-xs text-neutral-300">
                  Kaabah — {KAABA.lat}° N, {KAABA.lon}° E
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Compass & gauge */}
          <SectionCard className="lg:col-span-3">
            <CardHeader icon={Navigation2} title="Qiblah Compass" subtitle={`Currently viewing: ${locationLabel}`} accent="gold" />
            <div className="grid grid-cols-1 gap-6 px-5 pb-6 sm:grid-cols-2 sm:items-center">
              <CompassRose bearing={result ? result.bearing : 0} />
              <div className="space-y-5">
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-4 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Qiblah Bearing</p>
                  <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-amber-400">
                    {result ? fmt(result.bearing, 2) : '—'}°
                  </p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {result ? `${bearingToCompassLabel(result.bearing)} of True North` : 'Awaiting valid coordinates'}
                  </p>
                </div>
                <DegreeGauge bearing={result ? result.bearing : 0} />
                <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-xs text-neutral-400">
                  <Radius className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  Great-circle distance to Mecca:{' '}
                  <span className="font-mono font-semibold text-neutral-200">
                    {result ? Math.round(result.distanceKm).toLocaleString() : '—'} km
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Calculation breakdown */}
        <SectionCard className="mt-5">
          <CardHeader icon={Sigma} title="Step-by-Step Calculation Breakdown" subtitle="Live evaluation of the great-circle bearing formula" />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 px-5 pb-6 md:grid-cols-2">
            <FormulaStep
              index={1}
              title="Difference in longitude"
              formula={`Δλ = λ_K − λ = ${fmt(KAABA.lon, 4)}° − (${fmt(lonNum, 4)}°)`}
              result={result ? `Δλ = ${fmt(result.deltaLambdaDeg, 4)}° (${fmt(result.deltaLambda, 6)} rad)` : '—'}
            />
            <FormulaStep
              index={2}
              title="Numerator: sin(Δλ)"
              formula={`sin(${fmt(result?.deltaLambda ?? 0, 4)} rad)`}
              result={result ? `= ${fmt(result.numerator, 6)}` : '—'}
            />
            <FormulaStep
              index={3}
              title="Denominator: cos(φ)·tan(φ_K) − sin(φ)·cos(Δλ)"
              formula={`cos(${fmt(result?.phi ?? 0, 3)})·tan(${fmt(result?.phiK ?? 0, 3)}) − sin(${fmt(result?.phi ?? 0, 3)})·cos(${fmt(result?.deltaLambda ?? 0, 3)})`}
              result={result ? `= ${fmt(result.denominator, 6)}` : '—'}
            />
            <FormulaStep
              index={4}
              title="Arc-tangent quadrant mapping"
              formula={`q = atan2(${fmt(result?.numerator ?? 0, 4)}, ${fmt(result?.denominator ?? 0, 4)})`}
              result={result ? `q = ${fmt(result.qDeg, 4)}° → normalized to ${fmt(result.bearing, 4)}°` : '—'}
              note="atan2 resolves the correct compass quadrant (0°-360°) from the signs of both the numerator and denominator, avoiding the ±90° ambiguity of a plain arctangent."
            />
          </div>

          <div className="mx-5 mb-5 flex gap-3 rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.06] to-transparent p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="text-xs leading-relaxed text-neutral-400">
              <p className="mb-1 font-semibold text-amber-300">Why flat maps lie: the New York paradox</p>
              <p>
                On a flat Mercator map, New York sits west and slightly south of Mecca, tempting the eye toward a
                south-easterly line. But Earth is a sphere, and the shortest path — the great circle — bows up over
                the North Atlantic instead. Plugging New York&rsquo;s coordinates (40.71° N, 74.01° W) into the formula
                above yields a bearing of roughly <span className="font-mono text-neutral-200">58°</span>, which is
                <span className="font-semibold text-neutral-200"> north-east</span>, not south-east. Great-circle
                routes minimise distance on a curved surface, so directions that look wrong on paper are exactly
                right on the globe.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Manifesto / how it works */}
        <SectionCard className="mt-5">
          <button
            onClick={() => setShowManifesto((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/20">
                <BookOpenText className="h-4.5 w-4.5" strokeWidth={2} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-neutral-100">How does a phone actually find the Qiblah?</span>
                <span className="block text-xs text-neutral-500">GPS, spherical trigonometry, and your device compass</span>
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${showManifesto ? 'rotate-180' : ''}`} />
          </button>
          {showManifesto && (
            <div className="space-y-3 border-t border-white/5 px-5 py-5 text-sm leading-relaxed text-neutral-400">
              <p>
                <span className="font-semibold text-neutral-200">1. Locate.</span> Your phone&rsquo;s GPS chip triangulates
                signals from satellites to fix your latitude (φ) and longitude (λ) to within a few metres.
              </p>
              <p>
                <span className="font-semibold text-neutral-200">2. Model the Earth as a sphere.</span> Because the
                Kaabah&rsquo;s coordinates (21.4225° N, 39.8262° E) are fixed, the app has two points on a sphere and
                needs the initial bearing of the shortest arc connecting them — not a straight line on a flat
                projection, but a great-circle path.
              </p>
              <p>
                <span className="font-semibold text-neutral-200">3. Solve the spherical triangle.</span> The formula
                q = atan2( sin Δλ, cos φ · tan φ_K − sin φ · cos Δλ ) comes from spherical trigonometry&rsquo;s napier
                analogies, giving the initial heading, in radians, measured clockwise from true North.
              </p>
              <p>
                <span className="font-semibold text-neutral-200">4. Normalise and display.</span> The raw angle from
                atan2 falls between -180° and 180°; adding 360° and taking the result modulo 360° maps it onto a
                standard compass bearing, which is then rendered on the rose above.
              </p>
              <p>
                <span className="font-semibold text-neutral-200">5. Orient the phone.</span> A production app reads the
                device&rsquo;s magnetometer to know which way &ldquo;up&rdquo; on the screen currently points, then rotates
                the compass so the calculated bearing lines up with real-world North — that live sensor fusion is the
                only piece this educational demo simplifies away.
              </p>
            </div>
          )}
        </SectionCard>

        <footer className="mt-8 pb-4 text-center text-[11px] text-neutral-600">
          Built for education — coordinates are processed locally in your browser and never leave your device.
        </footer>
      </div>
    </div>
  );
}
