// controls.js - Complete Zero-GC Camera Orbit, Multi-Angle Views, Mobile-Responsive Dock & Cockpit Controls
// Includes: Responsive FOV Helper, Mode-Aware Zoom, Cab-Forward Cockpit POV, Draggable Dock Clamping & Haptics

class GameControls {
    constructor(camera, domElement, locomotive, trainPhysics, weatherManager, envManager, audioManager, onPerfModeChange) {
        this.camera = camera;
        this.domElement = domElement;
        this.locomotive = locomotive;
        this.trainPhysics = trainPhysics;
        this.weatherManager = weatherManager;
        this.envManager = envManager;
        this.audioManager = audioManager;
        this.onPerfModeChange = onPerfModeChange;

        // Camera Modes: 0 = Orbit Chase, 1 = Deck POV, 2 = Trackside Flyby, 3 = Drone Overview
        this.cameraModes = ['🎥 Chase', '🚂 Deck POV', '🎬 Trackside', '🦅 Drone'];
        this.camModeIdx = 0;
        this._lastFov = 52;
        this.deckFovOffset = 0;
        this.tracksideAnchor = new THREE.Vector3(40, 4.5, 60);
        this.tracksideTimer = 0;

        // Orbit Camera State
        this.distance = GAME_CONFIG.camera.defaultDistance;
        this.targetDistance = GAME_CONFIG.camera.defaultDistance;
        this.pitch = GAME_CONFIG.camera.defaultPitch;
        this.yaw = GAME_CONFIG.camera.defaultYaw;

        // Pre-allocated Vectors (Zero GC allocations per frame!)
        this.targetLookAt = new THREE.Vector3();
        this.currentLookAt = new THREE.Vector3();
        this._tmpVec = new THREE.Vector3();
        this._deckEye = new THREE.Vector3();
        this._deckLook = new THREE.Vector3();
        this.cameraMovedRecently = true;

        // Pointer & Pinch Zoom State (Allocation-free integer tracker - B24)
        this.pointers = {};
        this.pointerCount = 0;
        this.activePointerIds = [];
        this.lastPinchDist = 0;

        // Screen WakeLock
        this.wakeLock = null;

        // Speedometer DOM caching
        this.speedValEl = document.getElementById('speed-gauge-val');
        this.lastDisplayedKmh = -1;

        this._initOrbitPointerListeners();
        this._initKeyboardListeners();
        this._initHUDButtons();
        this._initDraggableDock();
        this._initAudioUnlockListeners();
    }

    _initAudioUnlockListeners() {
        // Unlock Web Audio on first user interaction gesture (N5 / B2)
        const unlock = () => {
            if (this.audioManager) this.audioManager.unlock();
            this.requestWakeLock();
        };
        ['pointerdown', 'touchend', 'keydown'].forEach(ev => {
            window.addEventListener(ev, unlock, { passive: true, once: false });
        });
    }

    async requestWakeLock() {
        if ('wakeLock' in navigator && !this.wakeLock) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
            } catch (err) {}
        }
    }

    _initOrbitPointerListeners() {
        this.domElement.addEventListener('pointerdown', (e) => {
            this.domElement.setPointerCapture(e.pointerId);
            if (!this.pointers[e.pointerId]) {
                this.pointerCount++;
                this.activePointerIds.push(e.pointerId);
            }
            this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            this.lastPinchDist = 0;
            this.cameraMovedRecently = true;
        });

        this.domElement.addEventListener('pointermove', (e) => {
            const p = this.pointers[e.pointerId];
            if (!p) return;

            // Two-finger pinch zoom (B24: zero Object.keys allocation!)
            if (this.pointerCount === 2) {
                p.x = e.clientX;
                p.y = e.clientY;
                const id0 = this.activePointerIds[0];
                const id1 = this.activePointerIds[1];
                const p0 = this.pointers[id0];
                const p1 = this.pointers[id1];
                if (p0 && p1) {
                    const dist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
                    if (this.lastPinchDist > 0 && dist > 0) {
                        this.zoom(this.lastPinchDist / dist);
                    }
                    this.lastPinchDist = dist;
                    this.cameraMovedRecently = true;
                }
                return;
            }

            const dx = e.clientX - p.x;
            const dy = e.clientY - p.y;
            p.x = e.clientX;
            p.y = e.clientY;

            this.yaw -= dx * 0.006;
            this.pitch = Math.max(0.06, Math.min(Math.PI * 0.46, this.pitch + dy * 0.006));
            this.cameraMovedRecently = true;
        });

        const endPtr = (e) => {
            if (this.pointers[e.pointerId]) {
                delete this.pointers[e.pointerId];
                this.pointerCount = Math.max(0, this.pointerCount - 1);
                const idx = this.activePointerIds.indexOf(e.pointerId);
                if (idx !== -1) this.activePointerIds.splice(idx, 1);
            }
            this.lastPinchDist = 0;
        };
        this.domElement.addEventListener('pointerup', endPtr);
        this.domElement.addEventListener('pointercancel', endPtr);

        this.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoom(Math.exp(e.deltaY * 0.0012));
        }, { passive: false });

        // Double-tap in Deck POV to recenter look direction (Section 3.2)
        this.domElement.addEventListener('dblclick', () => {
            if (this.camModeIdx === 1) {
                this.yaw = GAME_CONFIG.camera.defaultYaw;
                this.pitch = GAME_CONFIG.camera.defaultPitch;
                this.cameraMovedRecently = true;
            }
        });
    }

    // Responsive FOV calculation prevents narrow tunnel vision in portrait orientation (B9)
    _fitFov(hDeg) {
        const aspect = this.camera.aspect || (window.innerWidth / window.innerHeight);
        const v = 2 * Math.atan(Math.tan(hDeg * Math.PI / 360) / aspect) * 180 / Math.PI;
        return Math.max(40, Math.min(85, v));
    }

    _applyFov(targetFov) {
        if (Math.abs(this._lastFov - targetFov) > 0.05) {
            this.camera.fov = targetFov;
            this.camera.updateProjectionMatrix();
            this._lastFov = targetFov;
        }
    }

    // Mode-aware Zoom: Distance in Chase, FOV in Deck (B7)
    zoom(factor) {
        if (this.camModeIdx === 0) {
            this.targetDistance = Math.max(
                GAME_CONFIG.camera.minDistance,
                Math.min(GAME_CONFIG.camera.maxDistance, this.targetDistance * factor)
            );
        } else if (this.camModeIdx === 1) {
            const step = factor < 1.0 ? -8 : 8;
            this.deckFovOffset = Math.max(-16, Math.min(16, this.deckFovOffset + step));
        }
        this.cameraMovedRecently = true;
    }

    recenter() {
        this.camModeIdx = 0;
        document.body.classList.remove('deck-view');
        if (this.locomotive) this.locomotive.setDeckView(false);
        this.camera.near = 0.25;
        this.camera.updateProjectionMatrix();
        this.targetDistance = GAME_CONFIG.camera.defaultDistance;
        this.pitch = GAME_CONFIG.camera.defaultPitch;
        this.yaw = GAME_CONFIG.camera.defaultYaw;
        this.deckFovOffset = 0;
        this.cameraMovedRecently = true;
        this._updateCamHudState();
    }

    cycleCameraMode() {
        this.camModeIdx = (this.camModeIdx + 1) % this.cameraModes.length;
        this.tracksideTimer = 999;
        const isDeck = (this.camModeIdx === 1);
        document.body.classList.toggle('deck-view', isDeck);

        if (this.locomotive) {
            this.locomotive.setDeckView(isDeck);
        }

        if (isDeck) {
            this.yaw = GAME_CONFIG.camera.defaultYaw;
            this.pitch = GAME_CONFIG.camera.defaultPitch;
            this.camera.near = 0.08; // Close clipping plane inside cab
            this.camera.updateProjectionMatrix();
        } else {
            this.camera.near = 0.25;
            this.camera.updateProjectionMatrix();
        }

        this.cameraMovedRecently = true;
        this._updateCamHudState();
    }

    _updateCamHudState() {
        const btnCam = document.getElementById('btn-cam-mode');
        if (btnCam) btnCam.querySelector('.hud-val').textContent = this.cameraModes[this.camModeIdx];

        // Mode-aware +/- button visibility: hide in Trackside (2) and Drone (3) (B7)
        const leftHud = document.getElementById('left-camera-hud');
        const btnZoomIn = document.getElementById('btn-zoom-in');
        const btnZoomOut = document.getElementById('btn-zoom-out');
        const hideZoom = (this.camModeIdx === 2 || this.camModeIdx === 3);
        if (btnZoomIn) btnZoomIn.style.display = hideZoom ? 'none' : '';
        if (btnZoomOut) btnZoomOut.style.display = hideZoom ? 'none' : '';
    }

    _initHUDButtons() {
        // 1. Start / Stop Controller
        const btnStartStop = document.getElementById('btn-start-stop');
        if (btnStartStop) {
            btnStartStop.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                this.toggleStartStop();
            });
        }

        // 2. Horn Controller (Press & Hold, pointer capture & haptics - N6 / B3)
        const btnHorn = document.getElementById('btn-horn');
        if (btnHorn) {
            const startH = (e) => {
                e.preventDefault();
                try { btnHorn.setPointerCapture(e.pointerId); } catch (err) {}
                btnHorn.classList.add('active');
                if (navigator.vibrate) navigator.vibrate(10);
                if (this.audioManager) {
                    this.audioManager.unlock();
                    this.audioManager.startHorn();
                }
            };
            const stopH = (e) => {
                try { if (e && e.pointerId) btnHorn.releasePointerCapture(e.pointerId); } catch (err) {}
                btnHorn.classList.remove('active');
                if (this.audioManager) this.audioManager.stopHorn();
            };
            btnHorn.addEventListener('pointerdown', startH);
            btnHorn.addEventListener('pointerup', stopH);
            btnHorn.addEventListener('pointerleave', stopH);
            btnHorn.addEventListener('pointercancel', stopH);
        }

        // 3. Light Controller
        const btnLight = document.getElementById('btn-light');
        if (btnLight) {
            btnLight.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                this.toggleLights();
            });
        }

        // 4. Throttle Slider
        const throttleSlider = document.getElementById('throttle-slider');
        if (throttleSlider) {
            throttleSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value) / 100;
                this.trainPhysics.setThrottleFraction(val);
                this.cameraMovedRecently = true;
            });
        }

        // 5. Day / Night Mode Cycle Button
        const btnDayNight = document.getElementById('btn-day-night');
        if (btnDayNight) {
            btnDayNight.addEventListener('click', () => {
                const preset = this.weatherManager.cycleTimeOfDay();
                btnDayNight.querySelector('.hud-icon').textContent = preset.icon;
                btnDayNight.querySelector('.hud-val').textContent = preset.name;
                btnDayNight.classList.toggle('active', preset.name !== 'Day');
                this.cameraMovedRecently = true;
            });
        }

        // 6. Rain Toggle Button
        const btnRain = document.getElementById('btn-rain');
        if (btnRain) {
            btnRain.addEventListener('click', () => {
                const raining = this.weatherManager.toggleRain();
                btnRain.querySelector('.hud-val').textContent = raining ? 'Rain: ON' : 'Rain: OFF';
                btnRain.classList.toggle('active', raining);
                if (this.audioManager) this.audioManager.setRainSound(raining);
                this.cameraMovedRecently = true;
            });
        }

        // 7. Camera Mode Button
        const btnCamMode = document.getElementById('btn-cam-mode');
        if (btnCamMode) {
            btnCamMode.addEventListener('click', () => this.cycleCameraMode());
        }

        // 8. CPU Eco / FPS Mode Button
        const btnEco = document.getElementById('btn-eco-mode');
        if (btnEco && this.onPerfModeChange) {
            btnEco.addEventListener('click', () => {
                const mode = this.onPerfModeChange();
                btnEco.querySelector('.hud-val').textContent = mode.label;
                btnEco.classList.toggle('eco-active', mode.id !== 'max');
                this.cameraMovedRecently = true;
            });
        }

        // 9. Audio Mute Button
        const btnMute = document.getElementById('btn-mute');
        if (btnMute && this.audioManager) {
            btnMute.addEventListener('click', () => {
                const muted = this.audioManager.toggleMute();
                btnMute.querySelector('.hud-icon').textContent = muted ? '🔇' : '🔊';
                btnMute.classList.toggle('active', muted);
            });
        }

        // 10. Left Camera Navigation (+, -, Recenter)
        const btnZoomIn = document.getElementById('btn-zoom-in');
        const btnZoomOut = document.getElementById('btn-zoom-out');
        const btnRecenter = document.getElementById('btn-recenter');
        if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.zoom(0.75));
        if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.zoom(1.33));
        if (btnRecenter) btnRecenter.addEventListener('click', () => this.recenter());

        // 11. Mobile Slide-Over Menu Button & Drawer (Section 3.2)
        const btnMenu = document.getElementById('btn-menu');
        const menuDrawer = document.getElementById('menu-drawer');
        const btnMenuClose = document.getElementById('btn-menu-close');
        if (btnMenu && menuDrawer) {
            btnMenu.addEventListener('click', () => menuDrawer.classList.toggle('open'));
        }
        if (btnMenuClose && menuDrawer) {
            btnMenuClose.addEventListener('click', () => menuDrawer.classList.remove('open'));
        }

        const btnResetLayout = document.getElementById('btn-reset-layout');
        if (btnResetLayout) {
            btnResetLayout.addEventListener('click', () => {
                this.resetDockPosition();
                if (menuDrawer) menuDrawer.classList.remove('open');
            });
        }

        const btnLeftHanded = document.getElementById('btn-toggle-left-hand');
        if (btnLeftHanded) {
            btnLeftHanded.addEventListener('click', () => {
                document.body.classList.toggle('left-handed-layout');
                const isLH = document.body.classList.contains('left-handed-layout');
                btnLeftHanded.querySelector('.menu-val').textContent = isLH ? 'ON' : 'OFF';
            });
        }
    }

    toggleStartStop() {
        const nextState = !this.trainPhysics.isRunning;
        this.trainPhysics.setRunning(nextState);

        if (this.audioManager) {
            if (nextState) this.audioManager.startEngine();
            else this.audioManager.stopEngine();
        }

        const btn = document.getElementById('btn-start-stop');
        if (btn) {
            btn.classList.toggle('running', nextState);
            btn.querySelector('.btn-icon').textContent = nextState ? '⏹' : '▶';
            btn.querySelector('.btn-label').textContent = nextState ? 'STOP' : 'START';
            btn.querySelector('.btn-sub').textContent = nextState ? 'Apply Brakes' : 'Throttle / Go';
        }
        this.cameraMovedRecently = true;
    }

    toggleLights() {
        const lightsOn = this.locomotive.toggleLights();
        const btn = document.getElementById('btn-light');
        if (btn) {
            btn.classList.toggle('active', lightsOn);
            btn.querySelector('.btn-sub').textContent = lightsOn ? 'Lights ON' : 'Lights OFF';
        }
        this.cameraMovedRecently = true;
    }

    _initKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (e.code === 'Space') {
                e.preventDefault();
                this.toggleStartStop();
            } else if (e.code === 'KeyH') {
                const btnHorn = document.getElementById('btn-horn');
                if (btnHorn) btnHorn.classList.add('active');
                if (this.audioManager) this.audioManager.startHorn();
            } else if (e.code === 'KeyL') {
                this.toggleLights();
            } else if (e.code === 'KeyC') {
                this.cycleCameraMode();
            } else if (e.code === 'KeyR') {
                const btnRain = document.getElementById('btn-rain');
                if (btnRain) btnRain.click();
            } else if (e.code === 'KeyN') {
                const btnDayNight = document.getElementById('btn-day-night');
                if (btnDayNight) btnDayNight.click();
            } else if (e.key === '+' || e.key === '=') {
                this.zoom(0.8);
            } else if (e.key === '-' || e.key === '_') {
                this.zoom(1.25);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'KeyH') {
                const btnHorn = document.getElementById('btn-horn');
                if (btnHorn) btnHorn.classList.remove('active');
                if (this.audioManager) this.audioManager.stopHorn();
            }
        });
    }

    // Draggable Dock with Grip-Only Long-Tap & Clamping (B4 & B5)
    _initDraggableDock() {
        const dock = document.getElementById('train-controls-dock');
        if (!dock) return;

        const clampDock = () => {
            const maxL = Math.max(8, window.innerWidth - dock.offsetWidth - 8);
            const maxT = Math.max(8, window.innerHeight - dock.offsetHeight - 8);
            if (dock.style.left && dock.style.top) {
                const curL = parseInt(dock.style.left, 10);
                const curT = parseInt(dock.style.top, 10);
                if (!isNaN(curL) && !isNaN(curT)) {
                    dock.style.left = Math.max(8, Math.min(maxL, curL)) + 'px';
                    dock.style.top = Math.max(8, Math.min(maxT, curT)) + 'px';
                }
            }
        };

        try {
            const saved = localStorage.getItem('train_dock_pos_v2');
            if (saved) {
                const { left, top } = JSON.parse(saved);
                const maxL = Math.max(8, window.innerWidth - 320);
                const maxT = Math.max(8, window.innerHeight - 100);
                dock.style.left = Math.max(8, Math.min(maxL, left)) + 'px';
                dock.style.top = Math.max(8, Math.min(maxT, top)) + 'px';
                dock.style.bottom = 'auto';
                dock.style.transform = 'none';
            }
        } catch (err) {}

        window.addEventListener('resize', clampDock);
        window.addEventListener('orientationchange', clampDock);

        let holdTimer = null;
        let isDragging = false;
        let startX = 0, startY = 0, origLeft = 0, origTop = 0;

        // B4: ONLY start drag timer from .drag-grip-indicator, NEVER from control buttons or slider!
        dock.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.drag-grip-indicator')) return;
            startX = e.clientX;
            startY = e.clientY;
            const rect = dock.getBoundingClientRect();
            origLeft = rect.left;
            origTop = rect.top;

            holdTimer = setTimeout(() => {
                isDragging = true;
                dock.classList.add('dragging-mode');
                dock.style.left = origLeft + 'px';
                dock.style.top = origTop + 'px';
                dock.style.bottom = 'auto';
                dock.style.transform = 'none';
                if (navigator.vibrate) navigator.vibrate(20);
            }, 450);
        });

        window.addEventListener('pointermove', (e) => {
            if (!isDragging && holdTimer) {
                if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                return;
            }
            if (!isDragging) return;

            const nx = Math.max(8, Math.min(window.innerWidth - dock.offsetWidth - 8, origLeft + (e.clientX - startX)));
            const ny = Math.max(8, Math.min(window.innerHeight - dock.offsetHeight - 8, origTop + (e.clientY - startY)));
            dock.style.left = nx + 'px';
            dock.style.top = ny + 'px';
        });

        const endDrag = () => {
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
            if (isDragging) {
                isDragging = false;
                dock.classList.remove('dragging-mode');
                try {
                    localStorage.setItem('train_dock_pos_v2', JSON.stringify({
                        left: parseInt(dock.style.left, 10),
                        top: parseInt(dock.style.top, 10)
                    }));
                } catch (err) {}
            }
        };
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
    }

    resetDockPosition() {
        const dock = document.getElementById('train-controls-dock');
        if (!dock) return;
        localStorage.removeItem('train_dock_pos_v2');
        dock.style.left = '';
        dock.style.top = '';
        dock.style.bottom = '';
        dock.style.transform = '';
    }

    update(dt) {
        // 1. Update speedometer DOM
        if (this.speedValEl) {
            const kmh = Math.round(this.trainPhysics.speed * 3.6);
            if (kmh !== this.lastDisplayedKmh) {
                this.speedValEl.textContent = kmh;
                this.lastDisplayedKmh = kmh;
            }
        }

        // 2. Throttled audio engine RPM updates
        if (this.audioManager) {
            this.audioManager.updateRPM(this.trainPhysics.getSpeedRatio(), this.trainPhysics.isRunning);
        }

        const trainPos = this.trainPhysics.currentPosition;
        const trainTan = this.trainPhysics.currentTangent;

        // Mode 1: Cab-Forward Cockpit Driver POV (Section 4.3 & B8)
        if (this.camModeIdx === 1) {
            // Local eye in locomotive frame at driver seat: x = -0.55m, y = 3.25m, z = 4.2m
            this.locomotive.bodyGroup.localToWorld(this._deckEye.set(-0.55, 3.25, 4.2));

            const sp = this.trainPhysics.getSpeedRatio();
            const t = performance.now() * 0.001;
            const vib = sp * 0.012;
            const sway = Math.sin(t * 7.2) * 0.014 * sp;
            const bump = (Math.sin(t * 38) + 0.5 * Math.sin(t * 21)) * vib;

            this.camera.position.set(
                this._deckEye.x + sway,
                this._deckEye.y + bump,
                this._deckEye.z + sway
            );

            // Drag = look around (yaw capped to +/-100 deg, pitch to +/-0.45 rad)
            const a = Math.max(-1.75, Math.min(1.75, this.yaw - GAME_CONFIG.camera.defaultYaw));
            const lp = Math.max(-0.45, Math.min(0.45, (this.pitch - GAME_CONFIG.camera.defaultPitch) * 0.9));

            // Look target computed in locomotive local orientation
            this._deckLook.set(Math.sin(a) * 40.0, lp * 40.0, Math.cos(a) * 40.0);
            this.locomotive.bodyGroup.localToWorld(this._deckLook);
            this.camera.lookAt(this._deckLook);

            const targetFov = this._fitFov(78) + (this.deckFovOffset || 0) + sp * 5.0;
            this._applyFov(targetFov);
            return;
        }

        // Orbit FOV adjusted to prevent tunnel vision on mobile (B9)
        this._applyFov(this._fitFov(70) + this.trainPhysics.getSpeedRatio() * 4.0);

        // Mode 2: Trackside Fly-by Camera
        if (this.camModeIdx === 2) {
            this.tracksideTimer += dt;
            const distSq = this.camera.position.distanceToSquared(trainPos);
            if (distSq > 16000 || this.tracksideTimer > 9.0) {
                this.tracksideTimer = 0;
                const aheadU = (this.trainPhysics.progress + 0.025) % 1.0;
                this.trainPhysics.trackSystem.samplePoint(aheadU, this.tracksideAnchor);
                this.trainPhysics.trackSystem.sampleTangent(aheadU, this._tmpVec);
                this.camera.position.set(
                    this.tracksideAnchor.x - this._tmpVec.z * 11.5,
                    this.tracksideAnchor.y + 3.2,
                    this.tracksideAnchor.z + this._tmpVec.x * 11.5
                );
            }
            this.targetLookAt.set(trainPos.x, trainPos.y + 2.2, trainPos.z);
            this.camera.lookAt(this.targetLookAt);
            return;
        }

        // Mode 3: High-Altitude Drone View
        if (this.camModeIdx === 3) {
            this.targetLookAt.set(trainPos.x, trainPos.y + 2.0, trainPos.z);
            this.currentLookAt.lerp(this.targetLookAt, Math.min(1.0, dt * 8.0));
            this.camera.position.set(
                this.currentLookAt.x - trainTan.x * 65,
                this.currentLookAt.y + 95,
                this.currentLookAt.z - trainTan.z * 65
            );
            this.camera.lookAt(this.currentLookAt);
            return;
        }

        // Mode 0: Smooth Orbit Chase Camera
        const sp = this.trainPhysics.getSpeedRatio();
        this.targetDistance += (sp * 5.0 - (this.targetDistance - GAME_CONFIG.camera.defaultDistance) * 0.1) * dt;
        this.distance += (this.targetDistance - this.distance) * Math.min(1.0, dt * 10.0);

        const cosP = Math.cos(this.pitch);
        const sinP = Math.sin(this.pitch);
        const cosY = Math.cos(this.yaw);
        const sinY = Math.sin(this.yaw);

        this.targetLookAt.set(trainPos.x, trainPos.y + 2.1, trainPos.z);
        this.currentLookAt.lerp(this.targetLookAt, Math.min(1.0, dt * 14.0));

        this.camera.position.set(
            this.currentLookAt.x + this.distance * cosP * sinY,
            this.currentLookAt.y + this.distance * sinP,
            this.currentLookAt.z + this.distance * cosP * cosY
        );
        this.camera.lookAt(this.currentLookAt);
    }
}
