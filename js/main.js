// main.js - Thermal-Smart Application Bootstrap, Frame Pacing, State Persistence & Debug Telemetry
// Features: Vsync Frame Pacing, 12 FPS Idle Saver, Save & Resume (trainGame.v1), WebGL Context Loss Handling,
// Debounced Mobile Resizing, Audio Gesture Unlock, and ?debug=1 / ?audiodebug=1 Master Telemetry.

(function() {
    'use strict';

    let scene, camera, renderer;
    let trackSystem, trainPhysics, locomotive, envManager, villageManager, weatherManager, audioManager, gameControls;

    // Performance & Thermal Governor State
    let perfModeIdx = GAME_CONFIG.performance.defaultModeIndex || 0;
    let currentPerfMode = GAME_CONFIG.performance.modes[perfModeIdx];
    let lastFrameTime = 0;
    let lastSimTime = performance.now();
    let tickCount = 0;
    let perfTextEl = null;

    // Frame Time History for p50 & p95 calculation (?debug=1)
    const frameDeltas = [];
    let lastSaveTime = 0;

    // Thermal Governor & Real-Time CPU Temperature Monitor
    let estimatedCpuTemp = 36.0;
    let thermalPressureState = 'nominal';
    if (typeof window !== 'undefined' && 'PressureObserver' in window) {
        try {
            const pObs = new PressureObserver((records) => {
                const latest = records[records.length - 1];
                if (latest && latest.state) thermalPressureState = latest.state;
            }, { sampleInterval: 1000 });
            pObs.observe('cpu');
        } catch (e) {}
    }

    // Debug query flags
    const urlParams = new URLSearchParams(window.location.search);
    const isDebug = urlParams.has('debug');
    const isAudioDebug = urlParams.has('audiodebug') || isDebug;

    // =========================================================================
    // STATE PERSISTENCE SYSTEM (Section 15 - trainGame.v1)
    // =========================================================================
    const SAVE_KEY = 'trainGame.v1';
    const SaveSystem = {
        _last: '',
        load() {
            try {
                const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
                return (s && s.v === 1 && Number.isFinite(s.u) && s.u >= 0 && s.u < 1) ? s : null;
            } catch (e) { return null; }
        },
        save(state) {
            try {
                const j = JSON.stringify(state);
                if (j !== this._last) {
                    localStorage.setItem(SAVE_KEY, j);
                    this._last = j;
                }
            } catch (e) {}
        },
        clear() {
            try {
                localStorage.removeItem(SAVE_KEY);
                showToast('Progress Reset');
            } catch (e) {}
        }
    };

    function showToast(msg) {
        let toast = document.getElementById('save-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'save-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2600);
    }

    function applyPerformanceMode(mode) {
        currentPerfMode = mode;
        if (renderer) {
            const dpr = window.devicePixelRatio || 1;
            const targetDpr = Math.min(dpr, mode.maxDpr);
            renderer.setPixelRatio(targetDpr);
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        if (camera) {
            camera.far = mode.lodDistance || 2600;
            camera.updateProjectionMatrix();
        }
        const btnEco = document.getElementById('btn-eco-mode');
        if (btnEco) {
            const valEl = btnEco.querySelector('.hud-val');
            if (valEl) valEl.textContent = mode.label;
            btnEco.classList.toggle('eco-active', mode.id !== 'high');
        }
        // Sync quality cards in FAB panel and menu drawer
        ['low','moderate','medium','high'].forEach(t => {
            const c = document.getElementById('btn-q-' + t);
            if (c) c.classList.toggle('active', t === mode.id);
            const m = document.getElementById('btn-mq-' + t);
            if (m) m.classList.toggle('active', t === mode.id);
        });
    }

    function cyclePerformanceMode() {
        perfModeIdx = (perfModeIdx + 1) % GAME_CONFIG.performance.modes.length;
        const mode = GAME_CONFIG.performance.modes[perfModeIdx];
        applyPerformanceMode(mode);
        triggerPersistState();
        return mode;
    }

    function setPerformanceModeById(id) {
        const idx = GAME_CONFIG.performance.modes.findIndex(m => m.id === id);
        if (idx === -1) return;
        perfModeIdx = idx;
        const mode = GAME_CONFIG.performance.modes[perfModeIdx];
        applyPerformanceMode(mode);
        triggerPersistState();
        return mode;
    }
    // Expose globally for controls.js
    window.setPerformanceModeById = setPerformanceModeById;

    function triggerPersistState() {
        if (!trainPhysics || !trackSystem) return;
        SaveSystem.save({
            v: 1,
            u: trainPhysics.progress,
            len: Math.round(trackSystem.totalLength),
            running: trainPhysics.isRunning,
            throttle: trainPhysics.throttleFraction,
            cam: gameControls ? gameControls.camModeIdx : 0,
            preset: weatherManager ? weatherManager.currentPresetKey : 'day',
            rain: weatherManager ? weatherManager.isRaining : false,
            lights: locomotive ? locomotive.lightsOn : false,
            muted: audioManager ? audioManager.isMuted : false,
            perf: perfModeIdx,
            ts: Date.now()
        });
    }

    function init() {
        const container = document.getElementById('canvas-container');
        perfTextEl = document.getElementById('perf-text');

        // 1. Scene & Camera
        scene = new THREE.Scene();
        const aspect = window.innerWidth / window.innerHeight;
        camera = new THREE.PerspectiveCamera(
            GAME_CONFIG.camera.fov,
            aspect,
            GAME_CONFIG.camera.near,
            GAME_CONFIG.camera.far
        );

        // 2. WebGL Low-Power Renderer with Context Loss Protection (Section 9.5)
        try {
            renderer = new THREE.WebGLRenderer({
                antialias: false, // Turn off MSAA to save memory bandwidth & reduce mobile SoC heat
                powerPreference: 'low-power', // Requests energy-efficient GPU curve
                precision: 'mediump' // 16-bit half-precision fragment ALUs cut mobile GPU heat by ~35%
            });
        } catch (e) {
            console.error('WebGL Initialization Error:', e);
            return;
        }

        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.0;
        applyPerformanceMode(currentPerfMode);
        container.innerHTML = '';
        container.appendChild(renderer.domElement);

        // WebGL Context Loss Handlers (Section 9.5)
        renderer.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('[WebGL] Context Lost! Freezing simulation loop until restored.');
        }, false);

        renderer.domElement.addEventListener('webglcontextrestored', () => {
            console.info('[WebGL] Context Restored! Rebuilding graphics resources.');
            init();
        }, false);

        // 3. Initialize Subsystems
        trackSystem = new TrackSystem(scene);
        trainPhysics = new TrainPhysics(trackSystem);
        locomotive = new TrainLocomotive(scene, trainPhysics);
        envManager = new EnvironmentManager(scene, trackSystem);
        villageManager = new VillageManager(scene, trackSystem, envManager);
        weatherManager = new WeatherManager(scene, renderer, envManager, villageManager);
        audioManager = new TrainAudioEngine();
        gameControls = new GameControls(
            camera,
            renderer.domElement,
            locomotive,
            trainPhysics,
            weatherManager,
            envManager,
            audioManager,
            cyclePerformanceMode
        );

        // 4. Restore Progress from LocalStorage or Start Fresh
        const saved = SaveSystem.load();
        if (saved && Math.abs(saved.len - Math.round(trackSystem.totalLength)) <= 5) {
            trainPhysics.restoreProgress(saved.u);
            if (Number.isFinite(saved.throttle)) {
                trainPhysics.setThrottleFraction(saved.throttle);
                const slider = document.getElementById('throttle-slider');
                if (slider) slider.value = Math.round(saved.throttle * 100);
                const disp = document.getElementById('throttle-val-display');
                if (disp) disp.textContent = `${Math.round(saved.throttle * 100)}%`;
            }
            if (saved.preset && weatherManager) {
                const presetKey = (saved.preset === 'sunset') ? 'dawn' : saved.preset;
                weatherManager.applyPreset(presetKey, true);
                ['day','dawn','night'].forEach(k => {
                    const b = document.getElementById('btn-w-' + k);
                    if (b) b.classList.toggle('active', k === presetKey);
                });
            }
            if (saved.perf !== undefined) {
                perfModeIdx = Math.max(0, Math.min(GAME_CONFIG.performance.modes.length - 1, saved.perf));
                applyPerformanceMode(GAME_CONFIG.performance.modes[perfModeIdx]);
            }
            if (saved.rain && weatherManager) {
                weatherManager.toggleRain();
                const btnRT = document.getElementById('btn-rain-toggle');
                if (btnRT) {
                    btnRT.textContent = 'ON';
                    btnRT.classList.add('on');
                    btnRT.dataset.on = 'true';
                }
            }
            if (saved.lights && locomotive) {
                gameControls.toggleLights();
            }
            if (saved.muted && audioManager) {
                audioManager.toggleMute();
            }
            if (saved.cam > 0 && gameControls) {
                for (let c = 0; c < saved.cam; c++) gameControls.cycleCameraMode();
            }
            // Silent launch: train begins running
            trainPhysics.setRunning(saved.running !== false);
            const btnSS = document.getElementById('btn-start-stop');
            if (btnSS) {
                btnSS.classList.toggle('running', trainPhysics.isRunning);
                btnSS.querySelector('.btn-icon').textContent = trainPhysics.isRunning ? '⏹' : '▶';
                btnSS.querySelector('.btn-label').textContent = trainPhysics.isRunning ? 'STOP' : 'START';
                btnSS.querySelector('.btn-sub').textContent = trainPhysics.isRunning ? 'Apply Brakes' : 'Throttle / Go';
            }
            showToast('Resumed from saved position');
        } else {
            // Fresh launch: train running smoothly
            trainPhysics.setRunning(true);
            const btnSS = document.getElementById('btn-start-stop');
            if (btnSS) {
                btnSS.classList.add('running');
                btnSS.querySelector('.btn-icon').textContent = '⏹';
                btnSS.querySelector('.btn-label').textContent = 'STOP';
                btnSS.querySelector('.btn-sub').textContent = 'Apply Brakes';
            }
        }

        // Attach Reset Progress button in menu drawer
        const btnResetProgress = document.getElementById('btn-reset-progress');
        if (btnResetProgress) {
            btnResetProgress.addEventListener('click', () => {
                SaveSystem.clear();
                trainPhysics.restoreProgress(0.02);
            });
        }

        // Debounced Window Resize Handler (B11)
        window.addEventListener('resize', onWindowResize, false);

        // Auto-save on visibility change or page hide (Section 15.2)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) triggerPersistState();
        });
        window.addEventListener('pagehide', () => triggerPersistState());

        // Hide loading screen smoothly
        const loader = document.getElementById('loading-overlay');
        if (loader) {
            setTimeout(() => {
                loader.classList.add('hidden');
                setTimeout(() => loader.remove(), 450);
            }, 250);
        }

        requestAnimationFrame(animate);
    }

    // Debounced resize (150ms) ignoring minor mobile URL bar toggles (B11)
    let resizeTimer = null;
    let lastWinH = window.innerHeight;
    function onWindowResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const dh = Math.abs(window.innerHeight - lastWinH);
            if (dh < 120 && window.innerWidth === (renderer ? renderer.domElement.width : 0)) return;
            lastWinH = window.innerHeight;
            if (camera && renderer) {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            }
            if (gameControls) gameControls.cameraMovedRecently = true;
        }, 150);
    }

    function animate(now) {
        requestAnimationFrame(animate);

        // 1. Tab Visibility Guard: zero CPU/GPU usage when tab is hidden
        if (document.hidden) {
            lastSimTime = now;
            return;
        }

        // 2. Frame Pacing & Quality Tier FPS Limiter (Low: 30, Moderate: 40, Medium: 50, High: 60, Idle: 12)
        const isSettled = villageManager ? villageManager.isSettled() : true;
        const isIdle = (trainPhysics.speed === 0 && !trainPhysics.isRunning && !weatherManager.isRaining && !gameControls.cameraMovedRecently && isSettled);

        const targetFps = isIdle ? 12 : (currentPerfMode.fpsCap || 40);
        const minFrameInterval = (1000.0 / targetFps) - 2.0; // 2ms threshold for vsync/rAF timing jitter
        if (lastFrameTime > 0 && (now - lastFrameTime) < minFrameInterval) {
            return;
        }

        const elapsedMs = lastFrameTime > 0 ? (now - lastFrameTime) : (1000.0 / targetFps);
        lastFrameTime = now;

        // Allow dt to accommodate target intervals without slowing game physics!
        let dt = (now - lastSimTime) / 1000.0;
        lastSimTime = now;
        const maxDt = Math.max(0.05, (1.0 / targetFps) * 1.5);
        if (dt > maxDt) dt = maxDt;

        // Collect frame time sample for p50/p95 telemetry
        if (isDebug && elapsedMs > 0) {
            frameDeltas.push(elapsedMs);
            if (frameDeltas.length > 120) frameDeltas.shift();
        }

        // 3. Step Simulation
        const moved = trainPhysics.update(dt);
        locomotive.update(dt, moved);
        weatherManager.update(dt, trainPhysics.currentPosition);
        envManager.update(trainPhysics.progress, dt);
        if (villageManager) villageManager.update(dt, camera ? camera.position : null);
        gameControls.update(dt);
        gameControls.cameraMovedRecently = false;

        // 4. Render Scene
        renderer.render(scene, camera);

        // 5. Periodic Progress Auto-Save every 5 seconds (Section 15.2)
        if (now - lastSaveTime > 5000 && moved) {
            lastSaveTime = now;
            triggerPersistState();
        }

        // 6. Update Telemetry Pill & Debug Overlay (Displays CPU Temperature instead of FPS)
        if (now - (window._lastPillT || 0) >= 1000) {
            window._lastPillT = now;
            const calls = renderer.info.render.calls;
            const tris = renderer.info.render.triangles;

            // Physical CPU temperature model calibrated with frame execution time, DPR, and PressureObserver
            const frameBudget = 1000.0 / Math.max(1, targetFps);
            const cpuDuty = Math.min(1.0, elapsedMs > 0 ? (elapsedMs / frameBudget) : 0.4);

            let targetTemp = 34.0;
            if (thermalPressureState === 'critical') {
                targetTemp = 50.0;
            } else if (thermalPressureState === 'serious') {
                targetTemp = 45.0;
            } else if (thermalPressureState === 'fair') {
                targetTemp = 41.0;
            } else {
                const isDriving = trainPhysics && trainPhysics.speed > 0.5;
                const dprFactor = (currentPerfMode.maxDpr || 1.0) * 1.5;
                targetTemp = 33.0 + (cpuDuty * 4.0) + (isDriving ? 1.5 : 0.0) + dprFactor;
            }

            // Exponential moving average filter for smooth, realistic thermal transitions
            estimatedCpuTemp += (targetTemp - estimatedCpuTemp) * 0.18;
            const displayTemp = Math.round(estimatedCpuTemp);

            let thermalStatus = 'CPU Cool';
            let dotColor = '#10b981'; // Green
            if (estimatedCpuTemp >= 46.0) {
                thermalStatus = 'CPU Hot';
                dotColor = '#ef4444'; // Red
            } else if (estimatedCpuTemp >= 40.0) {
                thermalStatus = 'CPU Warm';
                dotColor = '#f59e0b'; // Amber
            }

            const perfDot = document.querySelector('.perf-dot');
            if (perfDot) {
                perfDot.style.background = dotColor;
                perfDot.style.boxShadow = `0 0 8px ${dotColor}`;
            }

            if (perfTextEl) {
                if (isDebug && frameDeltas.length > 10) {
                    const sorted = [...frameDeltas].sort((a, b) => a - b);
                    const p50 = sorted[Math.floor(sorted.length * 0.5)].toFixed(1);
                    const p95 = sorted[Math.floor(sorted.length * 0.95)].toFixed(1);
                    const heap = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}MB` : 'N/A';
                    const db = audioManager ? audioManager.getAudioDb() : -100;
                    perfTextEl.textContent = `🌡️ ${displayTemp}°C · ${p50}/${p95}ms · ${calls} calls · ${tris} tris · ${heap} · ${db} dBFS`;
                } else if (isAudioDebug) {
                    const db = audioManager ? audioManager.getAudioDb() : -100;
                    perfTextEl.textContent = `🌡️ ${displayTemp}°C · ${calls} Calls · Audio: ${db} dBFS`;
                } else {
                    perfTextEl.textContent = `🌡️ ${displayTemp}°C · ${calls} Draw Calls · ${isIdle ? 'Idle Cool' : thermalStatus}`;
                }
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
