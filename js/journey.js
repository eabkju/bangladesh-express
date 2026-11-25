// journey.js - Interactive Bangladeshi Train Journey Manager
// Features: 4-Station Route & Timetable, Station Stop & Boarding Loop, Dynamic Color-Light Signals,
// Speed Limit Zones, Level Crossing Whistle Prompt, Driver Scorecard, & Passing AI Commuter Train.

class JourneyManager {
    constructor(scene, trackSystem, trainPhysics, audioManager) {
        this.scene = scene;
        this.trackSystem = trackSystem;
        this.physics = trainPhysics;
        this.audioManager = audioManager;
        this.trackLength = trackSystem.totalLength || 2200;

        // 4 Stations along the Figure-8 Circuit
        this.stations = [
            { id: 'greenlands', nameBn: 'গ্রিনল্যান্ডস জংশন', nameEn: 'Greenlands Jn', u: 0.085, side: -1, builtInEnv: true },
            { id: 'sabujbagh',  nameBn: 'সবুজবাগ হল্ট',     nameEn: 'Sabujbagh Halt', u: 0.340, side: 1,  builtInEnv: false },
            { id: 'padmaghat',  nameBn: 'পদ্মা ঘাট',         nameEn: 'Padma Ghat',     u: 0.620, side: -1, builtInEnv: false },
            { id: 'uttarpara',  nameBn: 'উত্তরপাড়া',        nameEn: 'Uttarpara',      u: 0.860, side: 1,  builtInEnv: false }
        ];

        this.nextStationIdx = 0;
        this.stationState = 'EN_ROUTE'; // EN_ROUTE | APPROACHING | BOARDING | READY_DEPART
        this.dwellTimer = 0;
        this.dwellDuration = 4.0;

        // Journey Stats
        this.distanceKm = 0;
        this.stationsStopped = 0;
        this.whistleCount = 0;
        this.score = 0;
        this._lastU = this.physics.progress;

        // Level Crossing Whistle Prompt
        this.crossingU = 0.24;
        this.crossingWhistled = false;
        this.hornActive = false;

        // Signals & Speed Zones
        this.signals = [];
        this.currentSpeedLimit = 80;

        // Passing AI Local Train on parallel siding near Greenlands Junction
        this.aiTrain = null;
        this.aiProgress = 0.065;
        this.aiDir = 1;

        // Cached HUD elements
        this.elPill = document.getElementById('journey-pill');
        this.elText = document.getElementById('journey-text');
        this.elSignalDot = document.getElementById('journey-signal-dot');
        this.elPrompt = document.getElementById('journey-prompt');
        this.elScoreVal = document.getElementById('journey-score-val');
        this.elDistVal = document.getElementById('journey-dist-val');
        this.elStopsVal = document.getElementById('journey-stops-val');
        this._lastHudUpdate = 0;

        this._buildAdditionalStations();
        this._buildBlockSignals();
        this._buildPassingAITrain();
        this._initScorecardToggle();
    }

    _initScorecardToggle() {
        const card = document.getElementById('journey-scorecard');
        if (this.elPill && card) {
            this.elPill.addEventListener('click', (e) => {
                e.stopPropagation();
                card.classList.toggle('open');
            });
        }
    }

    _buildAdditionalStations() {
        const platMat = new THREE.MeshLambertMaterial({ color: 0x878278 });
        const safetyMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x1e5631 });
        const pillarMat = new THREE.MeshLambertMaterial({ color: 0x263847 });
        const benchMat = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
        const passengerCoat = new THREE.MeshLambertMaterial({ color: 0x2563eb });
        const passengerSkin = new THREE.MeshLambertMaterial({ color: 0xa66d49 });

        const pt = new THREE.Vector3();
        const tan = new THREE.Vector3();

        this.stations.forEach((st) => {
            if (st.builtInEnv) return;

            const stGroup = new THREE.Group();
            const EDGE = 2.05, PW = 4.6, D = EDGE + PW * 0.5;
            const segCount = 5;
            const segLen = 11.0;

            for (let k = -2; k <= 2; k++) {
                const uSeg = (st.u + (k * segLen) / this.trackLength + 1.0) % 1.0;
                this.trackSystem.samplePoint(uSeg, pt);
                this.trackSystem.sampleTangent(uSeg, tan);

                const nx = -tan.z, nz = tan.x;
                const nLen = Math.hypot(nx, nz) || 1.0;
                const rx = nx / nLen, rz = nz / nLen;
                const yaw = Math.atan2(tan.x, tan.z);

                const seg = new THREE.Group();
                seg.position.set(pt.x + st.side * rx * D, pt.y, pt.z + st.side * rz * D);
                seg.rotation.y = yaw;

                const slab = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.8, segLen + 0.3), platMat);
                slab.position.set(0, 0.4, 0);
                seg.add(slab);

                const yel = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.02, segLen + 0.3), safetyMat);
                yel.position.set(-st.side * (PW * 0.5 - 0.25), 0.81, 0);
                seg.add(yel);

                if (Math.abs(k) <= 1) {
                    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.2, segLen + 0.2), roofMat);
                    canopy.position.set(0, 4.6, 0);
                    seg.add(canopy);

                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.8, 6), pillarMat);
                    post.position.set(st.side * 1.1, 2.7, 0);
                    seg.add(post);

                    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 2.2), benchMat);
                    bench.position.set(st.side * 0.8, 0.9, 0);
                    seg.add(bench);
                }

                // Waiting passengers on platform
                if (k === 0 || k === -1) {
                    const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.28), passengerCoat);
                    pBody.position.set(-st.side * 0.6, 1.25, 1.4);
                    const pHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), passengerSkin);
                    pHead.position.set(-st.side * 0.6, 1.85, 1.4);
                    seg.add(pBody, pHead);
                }

                stGroup.add(seg);
            }

            // Station Signboard (Bengali + English)
            this.trackSystem.samplePoint(st.u, pt);
            this.trackSystem.sampleTangent(st.u, tan);
            const nx = -tan.z, nz = tan.x;
            const nLen = Math.hypot(nx, nz) || 1.0;
            const rx = nx / nLen, rz = nz / nLen;
            const yaw = Math.atan2(tan.x, tan.z);

            const sCanvas = document.createElement('canvas');
            sCanvas.width = 512; sCanvas.height = 128;
            const sg = sCanvas.getContext('2d');
            sg.fillStyle = '#0f2f1e';
            sg.fillRect(0, 0, 512, 128);
            sg.strokeStyle = '#e0b658';
            sg.lineWidth = 6;
            sg.strokeRect(4, 4, 504, 120);
            sg.fillStyle = '#ffffff';
            sg.font = "bold 32px 'BnSign', 'Noto Sans Bengali', sans-serif";
            sg.textAlign = 'center';
            sg.textBaseline = 'middle';
            sg.fillText(st.nameBn, 256, 44);
            sg.font = 'bold 22px sans-serif';
            sg.fillStyle = '#facc15';
            sg.fillText(st.nameEn.toUpperCase(), 256, 92);

            const signMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sCanvas) });
            const sign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 4.6), signMat);
            sign.position.set(pt.x + st.side * rx * (D + 0.8), pt.y + 4.7, pt.z + st.side * rz * (D + 0.8));
            sign.rotation.y = yaw;
            stGroup.add(sign);

            stGroup.traverse((c) => {
                c.matrixAutoUpdate = false;
                c.updateMatrix();
            });
            this.scene.add(stGroup);
        });
    }

    _buildBlockSignals() {
        const postMat = new THREE.MeshLambertMaterial({ color: 0x22262a });
        const housingMat = new THREE.MeshLambertMaterial({ color: 0x111418 });
        const pt = new THREE.Vector3();
        const tan = new THREE.Vector3();

        this.stations.forEach((st) => {
            // Place starter/home signal 35m ahead of each station platform
            const sigU = (st.u + 42 / this.trackLength) % 1.0;
            this.trackSystem.samplePoint(sigU, pt);
            this.trackSystem.sampleTangent(sigU, tan);
            const nx = -tan.z, nz = tan.x;
            const nLen = Math.hypot(nx, nz) || 1.0;
            const rx = nx / nLen, rz = nz / nLen;
            const yaw = Math.atan2(tan.x, tan.z);

            const sigGroup = new THREE.Group();
            sigGroup.position.set(pt.x + rx * 2.8, pt.y, pt.z + rz * 2.8);
            sigGroup.rotation.y = yaw;

            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.2, 6), postMat);
            pole.position.y = 2.6;
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.38), housingMat);
            box.position.y = 4.9;
            sigGroup.add(pole, box);

            const redMat = new THREE.MeshBasicMaterial({ color: 0x220505 });
            const amberMat = new THREE.MeshBasicMaterial({ color: 0x221a05 });
            const greenMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });

            const lensGeo = new THREE.CircleGeometry(0.13, 8);
            const rLens = new THREE.Mesh(lensGeo, redMat);
            rLens.position.set(0, 5.25, -0.2);
            rLens.rotation.y = Math.PI;
            const aLens = new THREE.Mesh(lensGeo, amberMat);
            aLens.position.set(0, 4.9, -0.2);
            aLens.rotation.y = Math.PI;
            const gLens = new THREE.Mesh(lensGeo, greenMat);
            gLens.position.set(0, 4.55, -0.2);
            gLens.rotation.y = Math.PI;
            sigGroup.add(rLens, aLens, gLens);

            this.scene.add(sigGroup);
            this.signals.push({
                u: sigU,
                stationId: st.id,
                redMat,
                amberMat,
                greenMat,
                aspect: 'GREEN'
            });
        });
    }

    _buildPassingAITrain() {
        // Lightweight 2-car commuter train on a parallel track beside Greenlands Junction
        const aiGroup = new THREE.Group();
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x0f766e }); // Teal-green commuter livery
        const accentMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
        const darkMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

        const loco = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 10.5), bodyMat);
        loco.position.set(0, 2.1, 0);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.3, 10.52), accentMat);
        stripe.position.set(0, 1.5, 0);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 10.2), roofMat);
        roof.position.set(0, 3.6, 0);
        const coach = new THREE.Mesh(new THREE.BoxGeometry(2.75, 2.6, 10.8), bodyMat);
        coach.position.set(0, 2.0, -11.4);
        const coachRoof = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.22, 10.5), roofMat);
        coachRoof.position.set(0, 3.4, -11.4);
        const under = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 21.5), darkMat);
        under.position.set(0, 0.65, -5.7);

        const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
        const hl = new THREE.Mesh(new THREE.CircleGeometry(0.22, 8), hlMat);
        hl.position.set(0, 2.1, 5.28);

        aiGroup.add(loco, stripe, roof, coach, coachRoof, under, hl);
        this.scene.add(aiGroup);
        this.aiTrain = aiGroup;
        this._aiPt = new THREE.Vector3();
        this._aiTan = new THREE.Vector3();
    }

    onHornPressed() {
        this.hornActive = true;
        const dCross = this._forwardDistMeters(this.crossingU);
        if (!this.crossingWhistled && (dCross < 180 || this._absDistMeters(this.crossingU) < 40)) {
            this.crossingWhistled = true;
            this.whistleCount++;
            this.score += 50;
            this._showPrompt('📢 Crossing Whistle Confirmed! (+50 pts)', '#10b981');
        }
    }

    onHornReleased() {
        this.hornActive = false;
    }

    _forwardDistMeters(targetU) {
        let du = targetU - this.physics.progress;
        if (du < 0) du += 1.0;
        return du * this.trackLength;
    }

    _absDistMeters(targetU) {
        let du = Math.abs(targetU - this.physics.progress);
        if (du > 0.5) du = 1.0 - du;
        return du * this.trackLength;
    }

    _setSignalAspect(sig, aspect) {
        if (sig.aspect === aspect) return;
        sig.aspect = aspect;
        sig.redMat.color.setHex(aspect === 'RED' ? 0xef4444 : 0x220505);
        sig.amberMat.color.setHex(aspect === 'AMBER' ? 0xf59e0b : 0x221a05);
        sig.greenMat.color.setHex(aspect === 'GREEN' ? 0x10b981 : 0x052212);
    }

    _showPrompt(msg, color = '#facc15') {
        if (!this.elPrompt) return;
        this.elPrompt.textContent = msg;
        this.elPrompt.style.borderColor = color;
        this.elPrompt.classList.add('show');
        clearTimeout(this._promptTimer);
        this._promptTimer = setTimeout(() => {
            if (this.elPrompt) this.elPrompt.classList.remove('show');
        }, 2800);
    }

    update(dt) {
        // 1. Track Distance Traveled
        let du = this.physics.progress - this._lastU;
        if (du < -0.5) du += 1.0;
        if (du > 0.5) du -= 1.0;
        this.distanceKm += Math.abs(du) * (this.trackLength / 1000.0);
        this._lastU = this.physics.progress;

        // 2. Passing AI Train Animation (loops smoothly on parallel siding between u=0.05 and u=0.13)
        if (this.aiTrain) {
            this.aiProgress += (dt * 9.5) / this.trackLength;
            if (this.aiProgress > 0.14) this.aiProgress = 0.04;
            this.trackSystem.samplePoint(this.aiProgress, this._aiPt);
            this.trackSystem.sampleTangent(this.aiProgress, this._aiTan);
            const nx = -this._aiTan.z, nz = this._aiTan.x;
            const nLen = Math.hypot(nx, nz) || 1.0;
            // Offset +6.0m to the opposite side of Greenlands Junction platform
            this.aiTrain.position.set(
                this._aiPt.x + (nx / nLen) * 6.0,
                this._aiPt.y,
                this._aiPt.z + (nz / nLen) * 6.0
            );
            this.aiTrain.rotation.y = Math.atan2(this._aiTan.x, this._aiTan.z);
        }

        // 3. Level Crossing Whistle Reset & Prompt
        const distToCross = this._forwardDistMeters(this.crossingU);
        if (distToCross > 260 && distToCross < this.trackLength - 80) {
            this.crossingWhistled = false;
        } else if (distToCross > 25 && distToCross < 155 && !this.crossingWhistled) {
            if (this.elPrompt && !this.elPrompt.classList.contains('show')) {
                this._showPrompt('⚠️ Level Crossing Ahead — Blow Horn (H)!', '#f59e0b');
            }
        }

        // 4. Station Stop & Signal State Machine
        const targetSt = this.stations[this.nextStationIdx];
        const distToSt = this._absDistMeters(targetSt.u);
        const fwdToSt = this._forwardDistMeters(targetSt.u);
        const kmh = this.physics.getKmh();

        // Speed Limit Zone & Audio Environment Hooks
        const onBridge = this.physics.currentPosition.y > 1.0;
        this.currentSpeedLimit = (distToSt < 150 || onBridge) ? 45 : 80;
        if (this.audioManager) {
            this.audioManager.setBridgeResonance(onBridge, this.physics.getSpeedRatio());
            this.audioManager.setBrakeSqueal(this.physics.brakeFraction > 0.45 && this.physics.getSpeedRatio() > 0.18);
            if (this._absDistMeters(this.crossingU) < 85) {
                this.audioManager.playCrossingBell();
            }
        }

        // Update block signals
        for (let i = 0; i < this.signals.length; i++) {
            const sig = this.signals[i];
            if (i === this.nextStationIdx) {
                if (this.stationState === 'BOARDING') {
                    this._setSignalAspect(sig, 'RED');
                } else if (fwdToSt < 220 && this.stationState !== 'READY_DEPART') {
                    this._setSignalAspect(sig, 'AMBER');
                } else {
                    this._setSignalAspect(sig, 'GREEN');
                }
            } else {
                this._setSignalAspect(sig, 'GREEN');
            }
        }

        // Station approach & boarding logic
        if (this.stationState === 'EN_ROUTE') {
            if (fwdToSt < 240 && distToSt > 38) {
                this.stationState = 'APPROACHING';
                this._showPrompt(`📍 Approaching ${targetSt.nameEn} — Slow down to stop`, '#38bdf8');
            }
        } else if (this.stationState === 'APPROACHING') {
            if (distToSt <= 38 && kmh <= 1) {
                this.stationState = 'BOARDING';
                this.dwellTimer = this.dwellDuration;
                this.stationsStopped++;
                this.score += 100;
                if (this.audioManager) this.audioManager.playStationBell();
                this._showPrompt(`🚉 Stopped at ${targetSt.nameEn}! Boarding... (+100 pts)`, '#10b981');
            } else if (fwdToSt > 350 && distToSt > 60) {
                // Passed station without stopping -> advance to next station
                this.nextStationIdx = (this.nextStationIdx + 1) % this.stations.length;
                this.stationState = 'EN_ROUTE';
            }
        } else if (this.stationState === 'BOARDING') {
            this.dwellTimer -= dt;
            if (this.dwellTimer <= 0) {
                this.stationState = 'READY_DEPART';
                if (this.audioManager) this.audioManager.playGuardWhistle();
                this._showPrompt(`🟢 Signal Green! Depart ${targetSt.nameEn}`, '#10b981');
            }
        } else if (this.stationState === 'READY_DEPART') {
            if (distToSt > 65) {
                this.nextStationIdx = (this.nextStationIdx + 1) % this.stations.length;
                this.stationState = 'EN_ROUTE';
            }
        }

        // 5. Throttled HUD Update (~4 Hz)
        const now = performance.now();
        if (now - this._lastHudUpdate > 240) {
            this._lastHudUpdate = now;
            this._updateHUD(targetSt, fwdToSt, kmh);
        }
    }

    _updateHUD(targetSt, fwdToSt, kmh) {
        const sig = this.signals[this.nextStationIdx];
        const aspect = sig ? sig.aspect : 'GREEN';

        if (this.elSignalDot) {
            this.elSignalDot.style.background = aspect === 'RED' ? '#ef4444' : (aspect === 'AMBER' ? '#f59e0b' : '#10b981');
        }

        if (this.elText) {
            if (this.stationState === 'BOARDING') {
                this.elText.textContent = `🚉 ${targetSt.nameEn} · Boarding (${Math.ceil(this.dwellTimer)}s)`;
            } else if (this.stationState === 'READY_DEPART') {
                this.elText.textContent = `🟢 Clear to Depart · ${targetSt.nameEn}`;
            } else {
                const distStr = fwdToSt >= 1000 ? `${(fwdToSt / 1000).toFixed(1)}km` : `${Math.round(fwdToSt)}m`;
                const overLimit = kmh > this.currentSpeedLimit + 5;
                this.elText.textContent = `${targetSt.nameEn} · ${distStr} · Max ${this.currentSpeedLimit}${overLimit ? ' ⚠️' : ''}`;
            }
        }

        if (this.elScoreVal) this.elScoreVal.textContent = String(this.score);
        if (this.elDistVal) this.elDistVal.textContent = `${this.distanceKm.toFixed(2)} km`;
        if (this.elStopsVal) this.elStopsVal.textContent = String(this.stationsStopped);
    }
}
