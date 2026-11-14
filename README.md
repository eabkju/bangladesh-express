# Realistic 3D Web-Based Train Simulator (Bangladesh Express Edition)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Play%20Now-brightgreen?style=for-the-badge&logo=googlechrome&logoColor=white)](https://eabkju.github.io/train-game/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Deployed-blue?style=for-the-badge&logo=github)](https://eabkju.github.io/train-game/)

> **Play Live Game:** **[https://eabkju.github.io/train-game/](https://eabkju.github.io/train-game/)**

An ultra-lightweight, visually rich 3D railway simulation game built with **Three.js** and procedural **Web Audio API**, featuring an authentic rural Bangladeshi countryside, the **Grambangla Express (গ্রামবাংলা এক্সপ্রেস)** with blue-and-red livery, twin headlights, a fully interactive cab-forward driver deck with animated gauges, Bengali tea stalls, sweet shops, and an $O(1)$ pre-baked spline physics engine.

---

## What's New in this Major Update

### 1. Zero Background Audio Noise & Refined Sound Engine
- **Decoupled LFO Tremolo**: Engine LFO is modulated through an isolated VCA (`chugGain`) rather than `engineGain.gain`. When the train is stationary or stopped, audio output drops to true silence (<-90 dBFS) without any constant 6–7 Hz throbbing drone.
- **Natural Diesel Timbre**: Dual oscillators combined with a procedural cylinder firing pulse buffer and reduced lowpass resonance ($Q = 0.8$) to produce an authentic diesel chug on phone speakers without high-pitched whines.
- **Studio Limiting Dynamics**: Compressor configured as a transparent limiter to preserve dynamic punch without raising background noise floor.
- **Throttled Web Audio Automation**: Audio parameters throttled to ~15 Hz, eliminating automation queue bloat and audio crackle on mobile browsers.
- **Gesture Audio Unlock & Safe Horn**: Audio context unlocks cleanly on first user tap or keypress, auto-resumes after phone call interruptions, and automatically releases stuck horn triggers on tab blur or pointer loss.

### 2. Mobile UX & Responsive Touch Controls
- **Always-Accessible Throttle**: Throttle slider is fully touch-responsive across portrait and landscape mobile screens—never hidden under narrow breakpoints.
- **Safe-Area Insets & Viewport Support**: Full edge-to-edge support with `viewport-fit=cover` and `env(safe-area-inset-*)` padding.
- **Grip-Only Draggable Dock**: Dock dragging only triggers from the designated grip handle (450ms hold), preventing accidental drag conflicts when pressing buttons or sliding the throttle.
- **Automatic Dock Viewport Clamping**: Controls dock automatically clamps to screen bounds on initial load, orientation change, and window resize.
- **Responsive FOV (No Tunnel Vision)**: Adaptive horizontal FOV calculation prevents narrow portrait tunnel vision.
- **Mode-Aware Camera Navigation**: Dedicated zoom functions per camera mode (camera radius in Chase mode; FOV in Deck mode; hidden in Drone/Trackside).
- **Settings Slide-Over Drawer**: Accessible menu drawer with Day/Night, Rain, Performance modes, Left-Handed layout toggle, and dock reset options.

### 3. Cab-Forward Driver Deck & 3D Cockpit
- **Cab-Forward Locomotive Architecture (Option A)**: Locomotive cab positioned at the front with direct sightlines over the railway track.
- **Detailed 3D Cockpit Interior**: Open windshield with transparent reflection glass, driver console with 3D needle instruments:
  - Animated Speedometer dial tracking live train velocity.
  - Animated Brake Pressure dial responding to throttle/brake states.
  - Animated Ammeter dial reflecting motor power draw.
  - 3D Throttle and Brake levers.
  - Working windshield wipers that sweep across the glass during monsoon rain.
- **Cockpit Camera Dynamics**: Local coordinate mounting with speed-scaled rail vibrations, track curvature lateral lean, and vertical track bumps.

### 4. Authentic Bangladeshi Theme & Livery
- **Blue-and-Red Bangladesh Railway Livery**: Royal blue body (`#1b4f9c`), crimson waist band (`#c8102e`), white pin striping (`#f4f4f0`), light grey roof (`#8a9099`), and dark underframe.
- **Bengali Inscriptions**: Exterior coach side panels inscribed with **"বাংলাদেশ রেলওয়ে"**, class marker **"শোভন"**, coach numbers in Bengali numerals (e.g., **১২৪৫**), locomotive badge **২৯০৫**, and coach end boards **"গ্রামবাংলা এক্সপ্রেস"**.
- **Twin Headlights & Tail Lamps**: Dual front headlight housings with twin volumetric light cones, wide-angle forward spotlight, and red rear coach tail markers.
- **Bangladeshi Rural Countryside**:
  - Four **Homesteads (বাড়ি)** with swept earth courtyards (উঠান), corrugated tin-roof huts, cowsheds (গোয়ালঘর), bamboo fences (বাঁশের বেড়া), and conical haystacks (খড়ের পালা).
  - Lush green seedling and golden harvest **Paddy Fields (ধানক্ষেত)** with raised earthen bunds (আইল).
  - Country pond with bathing ghat (পুকুরের ঘাট), wooden boats (নৌকা), and water lilies (শাপলা).
  - Working **Bengali Farmers** dressed in checked lungis, gamchas, and conical bamboo hats (জাপি/টোকা). Fixed umbrella posture resets during rain.
  - **Desi Zebu Cattle (দেশি গরু)** with distinct withers humps, dewlap flaps, and upward horns. Smooth furrow pacing with eased yaw turning.

### 5. Trackside Bengali Tea Stalls & Sweet Shops
- **Four Bengali Tea Stalls (চায়ের দোকান)** placed safely beside the rails:
  1. **রহিম চাচার চায়ের দোকান** — স্পেশাল দুধ-চা ও গরম সিঙ্গারা (Station approach)
  2. **রেলগেট চা-কুঠি** — আদা চা ও বনরুটি (Level crossing approach)
  3. **গ্রামের মোড় চা-ঘর** — এলাচ-দারুচিনি মসলা চা (Northern loop)
  4. **বটতলা চায়ের আড্ডা** — ভাঁড়ের চা ও নোনতা বিস্কুট (Western meadow)
- **Four Bengali Sweet Shops (মিষ্টান্ন ভাণ্ডার)** with glass display counters and clay pots:
  1. **সোনালী মিষ্টান্ন ভাণ্ডার** — রসগোল্লা · সন্দেশ · চমচম
  2. **পদ্মা মিষ্টি ঘর** — মিষ্টি দই · রসমালাই · কাঁচাগোল্লা
  3. **মধুমতী মিষ্টান্ন** — পান্তুয়া · জিলাপি · বালুশাহি
  4. **নিরালা মিষ্টির দোকান** — লাড্ডু · গজা · নারকেলের নাড়ু
- **Zero PointLight Overhead**: Replaced expensive point lights with emissive light bulbs and soft additive glow sprites, saving hundreds of per-pixel shader calculations.

### 6. Station Redesign & Curved Platform
- **84m Curved Segmented Platform**: Corrected outer placement with a safe 0.45m train clearance gap, eliminating train clipping through station walls.
- **Bilingual Station Board**: Inscribed with **"গ্রিনল্যান্ডস জংশন / GREENLANDS JUNCTION"**.
- **Clearance Assert Helper**: Dev-time collision sweeps verifying all trackside structures maintain safe clearance >= 1.6m.

### 7. Pacing, Persistence & Offline PWA Cache
- **Vsync Frame Pacing**: Smooth cadence frame limiter eliminating 16/33ms stutter.
- **State Persistence (`trainGame.v1`)**: Saves track progress, throttle, camera view, time of day, rain, and light settings to LocalStorage, automatically resuming on reload.
- **Offline PWA Service Worker (`sw.js`)**: Cache-first asset delivery for near-instant reload times.

---

## Standalone Build Script

Generate the bundled, offline single-file edition anytime:
```bash
python3 build-standalone.py
```
This inlines all modular CSS and JavaScript into `train-game-standalone.html` without external build tools.

---

## How to Run

### Local Dev Server
```bash
./start.sh
```
Or with Python:
```bash
python3 -m http.server 8080
```
Open: **[http://localhost:8080](http://localhost:8080)**

Or open `train-game-standalone.html` directly in any web browser without needing a server or internet connection!
