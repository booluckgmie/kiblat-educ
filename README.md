# Qiblah Finder & Spherical Geometry Calculator

An educational, single-page web app that shows — step by step — how a
smartphone turns your GPS coordinates into the exact compass bearing toward
the Kaabah in Mecca, using great-circle spherical trigonometry rather than a
straight line on a flat map.

Live math, a rotating compass, and a plain-language walkthrough are all
computed client-side; there is no backend and no data ever leaves the
browser.

## Features

- **Real GPS or manual input** — "Use My Current Location" calls the
  browser's Geolocation API, with manual latitude/longitude fields
  (pre-filled with London) as an instant, permission-free fallback.
- **Quick presets** — London, New York, Jakarta, Sydney, Tokyo — to explore
  how bearing changes across the globe.
- **Fixed reference point** — the Kaabah's coordinates (21.4225° N,
  39.8262° E) are hard-coded as the destination for every calculation.
- **Live spherical trigonometry engine** implementing the great-circle
  initial bearing formula:

  ```
  Δλ = λ_K − λ
  q  = atan2( sin(Δλ), cos(φ)·tan(φ_K) − sin(φ)·cos(Δλ) )
  bearing = (degrees(q) + 360) mod 360
  ```

- **Step-by-step breakdown panel** showing the numeric result of every
  stage of the formula for the currently selected coordinates, plus the
  great-circle distance to Mecca.
- **"Why flat maps lie" explainer** — demonstrates the New York paradox:
  Mercator projections suggest a south-easterly direction, but the true
  great-circle bearing is ≈58° (north-east), because the shortest path over
  a sphere bows toward the pole.
- **Animated SVG compass rose** and a linear 0°–360° degree gauge that
  update in real time as coordinates change.
- **"How it works" explainer** covering GPS, spherical modelling, and how a
  phone's magnetometer completes the picture in a real app.

## Tech stack

- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/) (via `@tailwindcss/vite`)
- [Lucide React](https://lucide.dev/) for icons
- Pure inline SVG for the compass and gauge — no charting or canvas libraries

Everything lives in a single component: [`src/App.jsx`](src/App.jsx).

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`).

### Other scripts

```bash
npm run build     # production build to dist/
npm run preview   # preview the production build locally
npm run lint      # run oxlint
```

## Deploying to Netlify

This repo includes a [`netlify.toml`](netlify.toml) with the build already
configured:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- SPA fallback redirect (`/* → /index.html`) and long-cache headers for
  static assets are pre-configured.

To deploy:

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. In [Netlify](https://app.netlify.com/), choose **Add new site → Import an
   existing project**, and select this repository.
3. Netlify will detect `netlify.toml` automatically — no manual
   configuration needed. Click **Deploy**.

Alternatively, deploy from the CLI:

```bash
npm install -g netlify-cli
netlify deploy --build --prod
```

## Project structure

```
├── index.html            # HTML entry point
├── netlify.toml          # Netlify build & redirect configuration
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx           # Entire application: UI, math engine, compass
│   ├── index.css         # Tailwind entry point + small custom keyframes
│   └── main.jsx          # React root mount
├── package.json
└── vite.config.js
```

## Notes on accuracy

The formula used here computes the **initial bearing** along the great
circle connecting the observer and the Kaabah — the standard, widely used
method for Qiblah calculation. It assumes a spherical Earth, which is
accurate to well within a fraction of a degree for this purpose (the
ellipsoidal correction is negligible at Qiblah-finding precision).
