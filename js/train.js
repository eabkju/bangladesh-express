// train.js - Visually Rich, Ultra-Low-Draw-Call Bangladeshi Livery Diesel Locomotive & 5 Carriages
// Features: Cab-Forward Layout (Option A), Authentic Bangladeshi Blue-Red Livery ("বাংলাদেশ রেলওয়ে"),
// Twin Headlights with Volumetric Cones & Ground Glow, Detailed 3D Driver Deck Interior with Animated Instrument Needles & Windshield Wipers.

class TrainLocomotive {
    constructor(scene, physics) {
        this.scene = scene;
        this.physics = physics;

        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.bodyGroup = new THREE.Group();
        this.bodyGroup.rotation.order = 'YXZ';
        this.root.add(this.bodyGroup);

        this.bogieCount = (1 + (GAME_CONFIG.train.carriageCount || 5)) * 2;
        this.bogieInst = null;
        this.wheelInst = null;
        this._bogieDummy = new THREE.Object3D();
        this._wheelDummy = new THREE.Object3D();
        this.roofFans = [];

        // Master Lighting & Emissive Materials (Zero SpotLight shader overhead!)
        this.lightsOn = false;
        this.headlightBeams = [];
        this.groundGlow = null;
        this.markerLamps = [];
        this.emissiveMaterials = [];

        // 5 Attached Passenger Carriages
        this.carriages = [];

        // Lightweight pooled exhaust smoke particles (14 puffs)
        this.smokePool = [];
        this.smokeTimer = 0;

        // Cab interior & driver deck view state
        this.isDeckViewActive = false;
        this.cabInterior = null;
        this.cabExteriorFront = null;
        this.speedNeedle = null;
        this.brakeNeedle = null;
        this.amperageNeedle = null;
        this.throttleHandle = null;
        this.brakeHandle = null;
        this.reverserHandle = null;
        this.dashMat = null;
        this.windRainMesh = null;
        this.windRainTex = null;
        this.warningLampMat = null;
        this.wiperArm = null;

        this._buildSharedTextures();
        this.buildLocomotive();
        this.buildCarriages();
        this._initExhaustSmoke();
        this.setLights(false);
        this.setDeckView(false);
        this.forceUpdate();

        // Listen for Bengali font readiness to redraw crisp Bengali livery text
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => this.redrawLivery());
        }
    }

    _buildSharedTextures() {
        // 1. Bangladeshi Passenger Coach Side Texture (Royal Blue, Red Band, White Pin Line)
        const cDiff = document.createElement('canvas');
        cDiff.width = 512; cDiff.height = 128;
        this.cCoachCtx = cDiff.getContext('2d');
        this.coachCanvas = cDiff;

        // Emissive Window Canvas
        const cEmis = document.createElement('canvas');
        cEmis.width = 512; cEmis.height = 128;
        this.cEmisCtx = cEmis.getContext('2d');
        this.coachEmisCanvas = cEmis;

        // 2. Locomotive Hood Side Texture (Louvres, Crimson Band, Bengali Number Badge "২৯০৫")
        const lCanvas = document.createElement('canvas');
        lCanvas.width = 512; lCanvas.height = 128;
        this.cLocoCtx = lCanvas.getContext('2d');
        this.locoCanvas = lCanvas;

        // 3. Hazard Buffer Beam Texture
        const bCanvas = document.createElement('canvas');
        bCanvas.width = 256; bCanvas.height = 64;
        const bg = bCanvas.getContext('2d');
        bg.fillStyle = '#c8102e';
        bg.fillRect(0, 0, 256, 64);
        bg.fillStyle = '#f8fafc';
        for (let x = -64; x < 320; x += 36) {
            bg.beginPath();
            bg.moveTo(x, 0); bg.lineTo(x + 18, 0);
            bg.lineTo(x + 42, 64); bg.lineTo(x + 24, 64);
            bg.closePath(); bg.fill();
        }
        this.hazardTex = new THREE.CanvasTexture(bCanvas);

        // 4. Fake Soft Drop-Shadow Texture
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 64; sCanvas.height = 64;
        const sg = sCanvas.getContext('2d');
        const sGrad = sg.createRadialGradient(32, 32, 6, 32, 32, 31);
        sGrad.addColorStop(0, 'rgba(0,0,0,0.55)');
        sGrad.addColorStop(1, 'rgba(0,0,0,0.0)');
        sg.fillStyle = sGrad;
        sg.fillRect(0, 0, 64, 64);
        this.shadowTex = new THREE.CanvasTexture(sCanvas);

        // 5. Driver Desk Gauge Dials Canvas
        const dCanvas = document.createElement('canvas');
        dCanvas.width = 512; dCanvas.height = 128;
        const dg = dCanvas.getContext('2d');
        dg.fillStyle = '#1c222b';
        dg.fillRect(0, 0, 512, 128);

        // 3 Circular Dial Faces: Speedometer, Brake Cylinder, Ammeter
        const dialCenters = [100, 256, 412];
        const dialLabels = ['KM/H', 'BRAKE BAR', 'MOTOR AMP'];
        dialCenters.forEach((cx, idx) => {
            dg.fillStyle = '#0f141c';
            dg.beginPath(); dg.arc(cx, 64, 50, 0, Math.PI * 2); dg.fill();
            dg.strokeStyle = '#64748b'; dg.lineWidth = 3; dg.stroke();

            // Dial scale ticks
            dg.strokeStyle = '#e2e8f0'; dg.lineWidth = 2;
            for (let a = -2.2; a <= 2.2; a += 0.55) {
                const x1 = cx + Math.sin(a) * 38;
                const y1 = 64 - Math.cos(a) * 38;
                const x2 = cx + Math.sin(a) * 46;
                const y2 = 64 - Math.cos(a) * 46;
                dg.beginPath(); dg.moveTo(x1, y1); dg.lineTo(x2, y2); dg.stroke();
            }

            dg.fillStyle = '#94a3b8';
            dg.font = 'bold 11px sans-serif';
            dg.textAlign = 'center';
            dg.fillText(dialLabels[idx], cx, 88);
        });
        this.dashTex = new THREE.CanvasTexture(dCanvas);

        this.coachSideTex = new THREE.CanvasTexture(this.coachCanvas);
        this.coachSideEmis = new THREE.CanvasTexture(this.coachEmisCanvas);
        this.locoHoodTex = new THREE.CanvasTexture(this.locoCanvas);

        this.redrawLivery();
    }

    redrawLivery() {
        const g = this.cCoachCtx;
        // --- 1. Passenger Coach Side ---
        // Royal Blue upper body
        g.fillStyle = '#1b4f9c';
        g.fillRect(0, 0, 512, 128);

        // Light grey roof band
        g.fillStyle = '#8a9099';
        g.fillRect(0, 0, 512, 14);

        // Dark chassis underframe
        g.fillStyle = '#1a1d22';
        g.fillRect(0, 108, 512, 20);

        // White pin line above waist
        g.fillStyle = '#f4f4f0';
        g.fillRect(0, 74, 512, 3);

        // Crimson red lower waist band
        g.fillStyle = '#c8102e';
        g.fillRect(0, 77, 512, 31);

        // White pin line below red band
        g.fillStyle = '#f4f4f0';
        g.fillRect(0, 107, 512, 1.5);

        // White end passenger entry doors
        [14, 466].forEach(dx => {
            g.fillStyle = '#102e5c';
            g.fillRect(dx, 26, 32, 78);
            g.strokeStyle = '#f4f4f0';
            g.lineWidth = 2;
            g.strokeRect(dx, 26, 32, 78);
            g.fillStyle = '#6289a8';
            g.fillRect(dx + 6, 33, 20, 28);
        });

        // Bengali Rail text & Class marker in crisp white
        g.fillStyle = '#ffffff';
        g.font = "bold 15px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText('বাংলাদেশ রেলওয়ে', 140, 93);

        g.font = "bold 13px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        g.fillText('শোভন', 340, 93);

        g.font = "bold 14px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        g.fillText('১২৪৫', 415, 93);

        // Emissive Window Canvas
        const ge = this.cEmisCtx;
        ge.fillStyle = '#000000';
        ge.fillRect(0, 0, 512, 128);

        // 6 Panoramic Bay Windows
        for (let i = 0; i < 6; i++) {
            const wx = 64 + i * 64;
            g.fillStyle = '#0d1622';
            g.fillRect(wx, 29, 48, 36);

            const grad = g.createLinearGradient(wx, 31, wx, 63);
            grad.addColorStop(0, '#5a82a6');
            grad.addColorStop(1, '#9ab8d4');
            g.fillStyle = grad;
            g.fillRect(wx + 2, 31, 44, 32);

            g.fillStyle = '#c8d6e5';
            g.fillRect(wx + 23, 31, 2, 32);

            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.beginPath();
            g.moveTo(wx + 6, 31); g.lineTo(wx + 18, 31);
            g.lineTo(wx + 10, 63); g.lineTo(wx + 2, 63);
            g.closePath(); g.fill();

            // Warm coach interior glow
            ge.fillStyle = '#ffe299';
            ge.fillRect(wx + 2, 31, 44, 32);
        }

        [14, 466].forEach(dx => {
            ge.fillStyle = '#ffd27d';
            ge.fillRect(dx + 6, 33, 20, 28);
        });

        // --- 2. Locomotive Hood Side ---
        const lg = this.cLocoCtx;
        lg.fillStyle = '#1b4f9c'; // Royal Blue
        lg.fillRect(0, 0, 512, 128);

        // Louvred cooling vents
        lg.fillStyle = '#0d1d33';
        for (let i = 0; i < 5; i++) {
            const vx = 45 + i * 82;
            lg.fillRect(vx, 22, 58, 44);
            lg.fillStyle = '#203a5e';
            for (let k = 0; k < 6; k++) {
                lg.fillRect(vx + 4, 26 + k * 6.5, 50, 3);
            }
            lg.fillStyle = '#0d1d33';
        }

        // White pin line & Red band
        lg.fillStyle = '#f4f4f0';
        lg.fillRect(0, 75, 512, 3);
        lg.fillStyle = '#c8102e';
        lg.fillRect(0, 78, 512, 28);
        lg.fillStyle = '#f4f4f0';
        lg.fillRect(0, 106, 512, 2);

        // Bengali locomotive number badge "২৯০৫"
        lg.fillStyle = '#0b1420';
        lg.fillRect(200, 74, 112, 24);
        lg.strokeStyle = '#f4f4f0';
        lg.lineWidth = 2;
        lg.strokeRect(200, 74, 112, 24);

        lg.fillStyle = '#ffffff';
        lg.font = "bold 17px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        lg.textAlign = 'center';
        lg.textBaseline = 'middle';
        lg.fillText('২৯০৫', 256, 86);

        this.coachSideTex.needsUpdate = true;
        this.coachSideEmis.needsUpdate = true;
        this.locoHoodTex.needsUpdate = true;
    }

    buildLocomotive() {
        const L = GAME_CONFIG.train.length; // 12.2m
        const W = GAME_CONFIG.train.width;  // 3.1m

        const bodyMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.trainBody });
        const hoodSideMat = new THREE.MeshLambertMaterial({ map: this.locoHoodTex });
        const redMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.trainAccent });
        const deckMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.trainFrame });
        const roofMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.trainRoof });
        const hazardMat = new THREE.MeshLambertMaterial({ map: this.hazardTex });
        const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1e24 });
        const handrailMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });

        // Soft Ground Drop Shadow
        const shadowPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(W * 1.35, L * 1.12),
            new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false })
        );
        shadowPlane.rotation.x = -Math.PI * 0.5;
        shadowPlane.position.y = 0.06;
        this.bodyGroup.add(shadowPlane);

        // 1. Main Chassis Deck & Fuel Tank
        const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.38, L), deckMat);
        deck.position.y = 1.34;
        this.bodyGroup.add(deck);

        const fuelTank = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, 0.55, 3.8), darkMat);
        fuelTank.position.set(0, 0.85, -0.6);
        this.bodyGroup.add(fuelTank);

        // Side Sills (Red Accent Line)
        [-W * 0.5 - 0.02, W * 0.5 + 0.02].forEach(x => {
            const sill = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, L), redMat);
            sill.position.set(x, 1.34, 0);
            this.bodyGroup.add(sill);
        });

        // Front & Rear Hazard Buffer Beams (Crimson & White)
        [L * 0.5 + 0.08, -L * 0.5 - 0.08].forEach(z => {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.65, 0.18), hazardMat);
            beam.position.set(0, 0.96, z);
            this.bodyGroup.add(beam);
        });

        // Front Buffer Beam Marker Lamps (Section 20.2)
        const frontZ = L * 0.5;
        const markerLensMat = new THREE.MeshBasicMaterial({ color: 0x661111 });
        [-1.32, 1.32].forEach(x => {
            const ml = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), markerLensMat);
            ml.position.set(x, 1.05, frontZ + 0.18);
            this.bodyGroup.add(ml);
            this.markerLamps.push(ml);
        });

        // =========================================================================
        // CAB-FORWARD LAYOUT (Option A - Section 4.1 & 20)
        // Cab is at the front (z = +2.15 to +5.35), Hood is behind the cab (z = -5.35 to +2.15)
        // =========================================================================

        // 2. Long Engine Hood (Behind Cab: z: -5.35 to +2.15, length 7.5m, center z = -1.6m)
        const hoodL = 7.5, hoodW = 2.55, hoodH = 2.15, hoodZ = -1.6;
        const hoodMats = [hoodSideMat, hoodSideMat, roofMat, darkMat, bodyMat, bodyMat];
        const hood = new THREE.Mesh(new THREE.BoxGeometry(hoodW, hoodH, hoodL), hoodMats);
        hood.position.set(0, 2.6, hoodZ);
        this.bodyGroup.add(hood);

        // Dual Circular Cooling Fan Housings on Hood Roof + Rotating Blades
        [-3.8, -1.4].forEach(fz => {
            const fanRing = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.18, 12), roofMat);
            fanRing.position.set(0, 3.74, fz);
            this.bodyGroup.add(fanRing);

            const bladeGroup = new THREE.Group();
            bladeGroup.position.set(0, 3.79, fz);
            const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.16), redMat);
            const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 1.1), redMat);
            bladeGroup.add(b1, b2);
            this.bodyGroup.add(bladeGroup);
            this.roofFans.push(bladeGroup);
        });

        // Exhaust Stack on Hood Roof
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.38, 8), darkMat);
        stack.position.set(0, 3.82, 0.6);
        this.bodyGroup.add(stack);

        // Hood Walkway Handrails
        [-W * 0.46, W * 0.46].forEach(x => {
            const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, hoodL + 0.2), handrailMat);
            topRail.position.set(x, 2.35, hoodZ);
            this.bodyGroup.add(topRail);
            for (let sz = -5.0; sz <= 1.8; sz += 1.7) {
                const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.04), handrailMat);
                stanchion.position.set(x, 1.92, sz);
                this.bodyGroup.add(stanchion);
            }
        });

        // 3. Elevated Driver Cab at Front (z: +2.15 to +5.35, center cabZ = +3.75m)
        const cabL = 3.2, cabW = 2.92, cabH = 2.52, cabZ = 3.75;

        // Exterior Cab Group (walls, roof, windows)
        const extCab = new THREE.Group();
        this.bodyGroup.add(extCab);

        // Rear & Side Walls
        const rearWall = new THREE.Mesh(new THREE.BoxGeometry(cabW, cabH, 0.12), bodyMat);
        rearWall.position.set(0, 2.8, cabZ - cabL * 0.5);
        extCab.add(rearWall);

        [-cabW * 0.5 + 0.06, cabW * 0.5 - 0.06].forEach(x => {
            const sWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, cabH, cabL), bodyMat);
            sWall.position.set(x, 2.8, cabZ);
            extCab.add(sWall);
        });

        // Curved Cab Roof
        const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.12, 0.18, cabL + 0.2), roofMat);
        cabRoof.position.set(0, 4.12, cabZ);
        extCab.add(cabRoof);

        // Front Cab Wall with Windshield Opening
        this.cabExteriorFront = new THREE.Group();
        const fLower = new THREE.Mesh(new THREE.BoxGeometry(cabW, 1.15, 0.14), redMat);
        fLower.position.set(0, 2.12, cabZ + cabL * 0.5);
        const fUpper = new THREE.Mesh(new THREE.BoxGeometry(cabW, 0.32, 0.14), bodyMat);
        fUpper.position.set(0, 3.96, cabZ + cabL * 0.5);
        const aPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.55, 0.14), bodyMat);
        aPillarL.position.set(-cabW * 0.5 + 0.12, 3.05, cabZ + cabL * 0.5);
        const aPillarR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.55, 0.14), bodyMat);
        aPillarR.position.set(cabW * 0.5 - 0.12, 3.05, cabZ + cabL * 0.5);
        this.cabExteriorFront.add(fLower, fUpper, aPillarL, aPillarR);
        extCab.add(this.cabExteriorFront);

        // Short Front Nose / Veranda in front of Cab (z: +5.35 to +6.1)
        const noseBox = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.1, 0.75), redMat);
        noseBox.position.set(0, 1.88, cabZ + cabL * 0.5 + 0.38);
        this.bodyGroup.add(noseBox);

        // Cab Windows (Emissive-ready)
        const cabWinMat = new THREE.MeshLambertMaterial({
            color: 0x7fa3c4,
            emissive: 0xffe299,
            emissiveIntensity: 0.15
        });
        this.emissiveMaterials.push(cabWinMat);

        // Side Windows
        [-cabW * 0.5 - 0.02, cabW * 0.5 + 0.02].forEach(x => {
            const sWin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 1.4), cabWinMat);
            sWin.position.set(x, 3.32, cabZ + 0.2);
            extCab.add(sWin);
        });

        // =========================================================================
        // 4. CAB INTERIOR & DRIVER DECK (Section 4.2)
        // Visible in Deck POV (camModeIdx === 1), gives authentic simulator cockpit feel
        // =========================================================================
        this.cabInterior = new THREE.Group();
        this.cabInterior.position.set(0, 0, cabZ);

        // Cab Floor
        const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.16, 0.1, cabL - 0.2), darkMat);
        cabFloor.position.set(0, 1.54, 0);
        this.cabInterior.add(cabFloor);

        // Driver Desk Console at Front Wall
        const deskGroup = new THREE.Group();
        deskGroup.position.set(0, 2.42, cabL * 0.5 - 0.32);

        const deskBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, 0.65), darkMat);
        deskBase.position.set(0, -0.25, 0);
        deskGroup.add(deskBase);

        // Sloped Instrument Panel (Backlit when lights ON)
        this.dashMat = new THREE.MeshLambertMaterial({
            map: this.dashTex,
            emissive: 0xffe299,
            emissiveMap: this.dashTex,
            emissiveIntensity: 0.15
        });
        const dashPanel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.42, 0.08), this.dashMat);
        dashPanel.rotation.x = -Math.PI * 0.22;
        dashPanel.position.set(0, 0.22, 0.12);
        deskGroup.add(dashPanel);

        // 3D Animated Needles on Instrument Dials
        const needleMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const needleGeo = new THREE.BoxGeometry(0.012, 0.11, 0.01);
        needleGeo.translate(0, 0.045, 0);

        this.speedNeedle = new THREE.Mesh(needleGeo, needleMat);
        this.speedNeedle.position.set(-0.72, 0.22, 0.16);
        this.speedNeedle.rotation.x = -Math.PI * 0.22;
        deskGroup.add(this.speedNeedle);

        this.brakeNeedle = new THREE.Mesh(needleGeo, needleMat);
        this.brakeNeedle.position.set(0.0, 0.22, 0.16);
        this.brakeNeedle.rotation.x = -Math.PI * 0.22;
        deskGroup.add(this.brakeNeedle);

        this.amperageNeedle = new THREE.Mesh(needleGeo, needleMat);
        this.amperageNeedle.position.set(0.72, 0.22, 0.16);
        this.amperageNeedle.rotation.x = -Math.PI * 0.22;
        deskGroup.add(this.amperageNeedle);

        // Throttle Handle & Brake Lever
        const leverMat = new THREE.MeshLambertMaterial({ color: 0xe0b658 });
        const leverGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6);
        leverGeo.translate(0, 0.11, 0);

        this.throttleHandle = new THREE.Mesh(leverGeo, leverMat);
        this.throttleHandle.position.set(-0.42, 0.18, 0.18);
        deskGroup.add(this.throttleHandle);

        this.brakeHandle = new THREE.Mesh(leverGeo, redMat);
        this.brakeHandle.position.set(-0.24, 0.18, 0.18);
        deskGroup.add(this.brakeHandle);

        const revGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6);
        revGeo.translate(0, 0.08, 0);
        this.reverserHandle = new THREE.Mesh(revGeo, handrailMat);
        this.reverserHandle.position.set(-0.56, 0.18, 0.18);
        deskGroup.add(this.reverserHandle);

        // Warning Indicator Lamp (toggles with LIGHTS)
        this.warningLampMat = new THREE.MeshBasicMaterial({ color: 0x331100 });
        const warnLamp = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), this.warningLampMat);
        warnLamp.position.set(0.38, 0.26, 0.18);
        deskGroup.add(warnLamp);

        this.cabInterior.add(deskGroup);

        // Windshield Glass with Faint Reflection Tint
        const windGlass = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 1.35),
            new THREE.MeshBasicMaterial({ color: 0x6ba8d9, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
        );
        windGlass.position.set(0, 3.15, cabL * 0.5 - 0.02);
        this.cabInterior.add(windGlass);

        // Windshield Rain Streaks Overlay (scrolls in Deck POV when raining)
        const rCanvas = document.createElement('canvas');
        rCanvas.width = 128; rCanvas.height = 128;
        const rg = rCanvas.getContext('2d');
        rg.clearRect(0, 0, 128, 128);
        rg.fillStyle = 'rgba(210, 235, 255, 0.45)';
        for (let i = 0; i < 42; i++) {
            const rx = (i * 31) % 124;
            const ry = (i * 53) % 116;
            rg.fillRect(rx, ry, 2, 10 + (i % 8));
        }
        this.windRainTex = new THREE.CanvasTexture(rCanvas);
        this.windRainTex.wrapS = THREE.RepeatWrapping;
        this.windRainTex.wrapT = THREE.RepeatWrapping;
        this.windRainTex.repeat.set(2, 1.5);
        this.windRainMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2.36, 1.32),
            new THREE.MeshBasicMaterial({ map: this.windRainTex, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })
        );
        this.windRainMesh.position.set(0, 3.15, cabL * 0.5 - 0.01);
        this.windRainMesh.visible = false;
        this.cabInterior.add(this.windRainMesh);

        // Windshield Wiper Arm (animated in rain)
        const wiperGeo = new THREE.BoxGeometry(0.018, 0.65, 0.02);
        wiperGeo.translate(0, 0.28, 0);
        this.wiperArm = new THREE.Mesh(wiperGeo, darkMat);
        this.wiperArm.position.set(-0.55, 2.52, cabL * 0.5 + 0.02);
        this.cabInterior.add(this.wiperArm);

        // Driver Seat (Left-side drive: x = -0.55m)
        const seatGroup = new THREE.Group();
        seatGroup.position.set(-0.55, 1.85, -0.2);
        const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), darkMat);
        const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.12), darkMat);
        seatBack.position.set(0, 0.45, -0.22);
        seatGroup.add(seatBase, seatBack);
        this.cabInterior.add(seatGroup);

        this.bodyGroup.add(this.cabInterior);

        // =========================================================================
        // 5. TWIN HEADLIGHTS + VOLUMETRIC CONES (Section 20.2)
        // Mounted on the front nose face (frontZ = 6.1m) at x = -0.78m and +0.78m
        // =========================================================================
        this.headlightLensMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
        const hlHousingGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.22, 10);
        hlHousingGeo.rotateX(Math.PI * 0.5);
        const hlLensGeo = new THREE.CircleGeometry(0.18, 12);

        // Volumetric light beam cone geometry
        const beamGeo = new THREE.ConeGeometry(3.6, 26, 12, 1, true);
        beamGeo.rotateX(-Math.PI * 0.5);
        beamGeo.translate(0, -0.9, 13.0);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0xfff6d0,
            transparent: true,
            opacity: 0.09,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        [-0.78, 0.78].forEach(x => {
            const h = new THREE.Mesh(hlHousingGeo, darkMat);
            h.position.set(x, 2.35, frontZ + 0.1);
            this.bodyGroup.add(h);

            const l = new THREE.Mesh(hlLensGeo, this.headlightLensMat);
            l.position.set(x, 2.35, frontZ + 0.22);
            this.bodyGroup.add(l);

            const cone = new THREE.Mesh(beamGeo, beamMat);
            cone.position.set(x, 2.35, frontZ + 0.22);
            cone.visible = false;
            this.bodyGroup.add(cone);
            this.headlightBeams.push(cone);
        });

        // Forward Ground Glow Projection Decal (soft radial beam on rails ahead, zero SpotLight cost!)
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128; glowCanvas.height = 256;
        const gg = glowCanvas.getContext('2d');
        const grad = gg.createRadialGradient(64, 220, 8, 64, 128, 128);
        grad.addColorStop(0, 'rgba(255, 244, 190, 0.55)');
        grad.addColorStop(0.5, 'rgba(255, 230, 140, 0.22)');
        grad.addColorStop(1, 'rgba(255, 220, 120, 0.0)');
        gg.fillStyle = grad;
        gg.fillRect(0, 0, 128, 256);

        const glowGeo = new THREE.PlaneGeometry(6.8, 36);
        glowGeo.rotateX(-Math.PI * 0.5);
        this.groundGlow = new THREE.Mesh(
            glowGeo,
            new THREE.MeshBasicMaterial({
                map: new THREE.CanvasTexture(glowCanvas),
                transparent: true,
                opacity: 0.75,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        this.groundGlow.position.set(0, 0.14, frontZ + 19);
        this.groundGlow.visible = false;
        this.bodyGroup.add(this.groundGlow);

        // 6. Instanced Articulated Bogies & Wheels (2 draw calls for entire train!)
        this._initInstancedBogiesAndWheels();
    }

    buildCarriages() {
        const coachCount = GAME_CONFIG.train.carriageCount || 5;
        const L = GAME_CONFIG.train.carriageLength || 11.4;
        const W = GAME_CONFIG.train.carriageWidth || 2.92;
        const H = 2.65;

        const sideMat = new THREE.MeshLambertMaterial({
            map: this.coachSideTex,
            emissive: 0xffe299,
            emissiveMap: this.coachSideEmis,
            emissiveIntensity: 0.08
        });
        this.emissiveMaterials.push(sideMat);

        const endMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.coachBody });
        const roofMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.trainRoof });
        const darkMat = new THREE.MeshLambertMaterial({ color: 0x15181c });
        const coachMats = [sideMat, sideMat, roofMat, darkMat, endMat, endMat];

        const bodyGeo = new THREE.BoxGeometry(W, H, L);
        const roofArchGeo = new THREE.BoxGeometry(W * 0.86, 0.18, L - 0.3);
        const bellowsGeo = new THREE.BoxGeometry(1.55, 2.15, 0.65);
        const shadowGeo = new THREE.PlaneGeometry(W * 1.32, L * 1.1);
        const shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false });

        // End Name Board Canvas ("গ্রামবাংলা এক্সপ্রেস")
        const nbCanvas = document.createElement('canvas');
        nbCanvas.width = 256; nbCanvas.height = 64;
        const nbg = nbCanvas.getContext('2d');
        nbg.fillStyle = '#0f2f1e';
        nbg.fillRect(0, 0, 256, 64);
        nbg.strokeStyle = '#e0b658';
        nbg.lineWidth = 4;
        nbg.strokeRect(2, 2, 252, 60);
        nbg.fillStyle = '#ffffff';
        nbg.font = "bold 18px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        nbg.textAlign = 'center';
        nbg.textBaseline = 'middle';
        nbg.fillText('গ্রামবাংলা এক্সপ্রেস', 128, 32);
        const nameBoardTex = new THREE.CanvasTexture(nbCanvas);
        const nameBoardMat = new THREE.MeshBasicMaterial({ map: nameBoardTex });

        for (let i = 0; i < coachCount; i++) {
            const carGroup = new THREE.Group();
            carGroup.rotation.order = 'YXZ';
            this.root.add(carGroup);

            // Soft ground shadow
            const sh = new THREE.Mesh(shadowGeo, shadowMat);
            sh.rotation.x = -Math.PI * 0.5;
            sh.position.y = 0.06;
            carGroup.add(sh);

            // Coach body
            const body = new THREE.Mesh(bodyGeo, coachMats);
            body.position.y = 2.48;
            carGroup.add(body);

            // Roof crown
            const roofCrown = new THREE.Mesh(roofArchGeo, roofMat);
            roofCrown.position.y = 3.88;
            carGroup.add(roofCrown);

            // Gangway bellows
            const bellows = new THREE.Mesh(bellowsGeo, darkMat);
            bellows.position.set(0, 2.35, L * 0.5 + 0.32);
            carGroup.add(bellows);

            // Train Name Board on coach rear
            const nameBoard = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.38, 0.05), nameBoardMat);
            nameBoard.position.set(0, 3.4, -L * 0.5 - 0.03);
            carGroup.add(nameBoard);

            // Two Red Tail Lamps on the very last coach (Section 20.2)
            if (i === coachCount - 1) {
                const tailLensMat = new THREE.MeshBasicMaterial({ color: 0xdd1111 });
                [-0.92, 0.92].forEach(tx => {
                    const tailLamp = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), tailLensMat);
                    tailLamp.position.set(tx, 1.85, -L * 0.5 - 0.04);
                    tailLamp.rotation.y = Math.PI;
                    carGroup.add(tailLamp);
                });
            }

            this.carriages.push({
                group: carGroup
            });
        }
    }

    _initInstancedBogiesAndWheels() {
        const frameMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.trainBogies });
        const wheelMat = new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.trainWheels });
        const wheelR = GAME_CONFIG.train.wheelRadius || 0.52;
        const halfGauge = 0.82;

        // Merge bogie frame + 2 axles into 1 geometry
        const frameGeo = new THREE.BoxGeometry(2.28, 0.26, 2.4);
        frameGeo.translate(0, 0.64, 0);
        const axle1 = new THREE.CylinderGeometry(0.06, 0.06, halfGauge * 2, 6);
        axle1.rotateZ(Math.PI * 0.5);
        axle1.translate(0, wheelR, -0.82);
        const axle2 = new THREE.CylinderGeometry(0.06, 0.06, halfGauge * 2, 6);
        axle2.rotateZ(Math.PI * 0.5);
        axle2.translate(0, wheelR, 0.82);

        const mergedBogieGeo = window.mergeStaticGeometries
            ? window.mergeStaticGeometries([frameGeo, axle1, axle2])
            : frameGeo;

        this.bogieInst = new THREE.InstancedMesh(mergedBogieGeo, frameMat, this.bogieCount);
        this.bogieInst.frustumCulled = false;

        const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.12, 10);
        wheelGeo.rotateZ(Math.PI * 0.5);
        this.wheelInst = new THREE.InstancedMesh(wheelGeo, wheelMat, this.bogieCount * 4);
        this.wheelInst.frustumCulled = false;

        this.root.add(this.bogieInst, this.wheelInst);
    }

    _initExhaustSmoke() {
        const puffGeo = new THREE.IcosahedronGeometry(0.32, 0);
        for (let i = 0; i < 14; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0xd8dee6,
                transparent: true,
                opacity: 0.0,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(puffGeo, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.smokePool.push({
                mesh: mesh,
                mat: mat,
                age: 99,
                maxAge: 1.4,
                vx: 0, vy: 0, vz: 0
            });
        }
    }

    toggleLights() {
        this.setLights(!this.lightsOn);
        return this.lightsOn;
    }

    setLights(on) {
        this.lightsOn = on;
        if (this.headlightLensMat) {
            this.headlightLensMat.color.setHex(on ? 0xfff8d6 : 0x555555);
        }
        if (this.headlightBeams) {
            this.headlightBeams.forEach(b => {
                b.visible = on && !this.isDeckViewActive;
            });
        }
        if (this.groundGlow) {
            this.groundGlow.visible = on;
        }
        if (this.markerLamps) {
            this.markerLamps.forEach(ml => {
                ml.material.color.setHex(on ? 0xff2222 : 0x661111);
            });
        }
        if (this.warningLampMat) {
            this.warningLampMat.color.setHex(on ? 0xffaa00 : 0x331100);
        }
        if (this.dashMat) {
            this.dashMat.emissiveIntensity = on ? 0.65 : 0.15;
        }
        const glow = on ? 1.35 : 0.06;
        for (let i = 0; i < this.emissiveMaterials.length; i++) {
            this.emissiveMaterials[i].emissiveIntensity = glow;
        }
    }

    // Toggle Deck POV Visibility (Section 4.2)
    setDeckView(isDeck) {
        this.isDeckViewActive = isDeck;
        if (this.cabInterior) {
            this.cabInterior.visible = isDeck;
        }
        if (this.cabExteriorFront) {
            this.cabExteriorFront.visible = !isDeck;
        }
        if (this.headlightBeams) {
            this.headlightBeams.forEach(b => {
                b.visible = this.lightsOn && !isDeck;
            });
        }
    }

    forceUpdate() {
        this._syncMeshes();
    }

    update(dt, moved) {
        // 1. Cooling Fans
        const fanSpeed = this.physics.isRunning ? (4.0 + this.physics.speed * 0.8) : 0.8;
        for (let i = 0; i < this.roofFans.length; i++) {
            this.roofFans[i].rotation.y += fanSpeed * dt;
        }

        // 2. Cab Instrument Needles & Levers (Section 4.2 + Pro Cab)
        if (this.isDeckViewActive) {
            const kmh = this.physics.getKmh ? this.physics.getKmh() : (this.physics.speed * 3.6);
            const kmhRatio = Math.min(1.0, kmh / 80.0);
            if (this.speedNeedle) {
                this.speedNeedle.rotation.z = 2.2 - kmhRatio * 4.4;
            }
            if (this.brakeNeedle) {
                const brakePressure = this.physics.getBrakePressureBar ? this.physics.getBrakePressureBar() : (this.physics.isRunning ? 5.0 : 0.0);
                this.brakeNeedle.rotation.z = 2.2 - (brakePressure / 10.0) * 4.4;
            }
            if (this.amperageNeedle) {
                const ampRatio = this.physics.getTractiveEffortRatio ? this.physics.getTractiveEffortRatio() : 0.0;
                this.amperageNeedle.rotation.z = 2.2 - ampRatio * 4.4;
            }
            if (this.throttleHandle) {
                const tf = this.physics.proCabMode ? (this.physics.notch / 8.0) : (this.physics.throttleFraction || 0.85);
                this.throttleHandle.rotation.x = -0.4 + tf * 0.8;
            }
            if (this.brakeHandle) {
                const bf = this.physics.proCabMode ? this.physics.brakeFraction : (this.physics.isRunning ? 0.0 : 1.0);
                this.brakeHandle.rotation.x = 0.35 - bf * 0.7;
            }
            if (this.reverserHandle) {
                const rev = this.physics.reverser || 0;
                this.reverserHandle.rotation.x = rev * 0.42;
            }
            if (this.windRainMesh && this.windRainTex) {
                this.windRainMesh.visible = !!this.physics.isRaining;
                if (this.physics.isRaining) {
                    this.windRainTex.offset.y += dt * (1.2 + kmhRatio * 1.4);
                }
            }
            if (this.wiperArm) {
                if (this.physics.isRaining) {
                    this.wiperArm.rotation.z = Math.sin(performance.now() * 0.005) * 0.75;
                } else {
                    this.wiperArm.rotation.z = 0;
                }
            }
        }

        // 3. Exhaust Smoke
        if (!this.isDeckViewActive) {
            this._updateSmoke(dt);
        }

        // 4. Synchronize body and bogies if train moved
        if (moved) {
            this._syncMeshes();
        }
    }

    _updateBogieInstance(bogieIdx, pos, tangent, wheelRot) {
        const yaw = Math.atan2(tangent.x, tangent.z);
        this._bogieDummy.position.copy(pos);
        this._bogieDummy.rotation.set(0, yaw, 0);
        this._bogieDummy.updateMatrix();
        this.bogieInst.setMatrixAt(bogieIdx, this._bogieDummy.matrix);

        const wheelR = GAME_CONFIG.train.wheelRadius || 0.52;
        const halfGauge = 0.82;
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        let wIdx = bogieIdx * 4;

        for (let zi = -1; zi <= 1; zi += 2) {
            const lz = zi * 0.82;
            for (let xi = -1; xi <= 1; xi += 2) {
                const lx = xi * halfGauge;
                this._wheelDummy.position.set(
                    pos.x + lx * cosY + lz * sinY,
                    pos.y + wheelR,
                    pos.z - lx * sinY + lz * cosY
                );
                this._wheelDummy.rotation.set(wheelRot, yaw, 0, 'YXZ');
                this._wheelDummy.updateMatrix();
                this.wheelInst.setMatrixAt(wIdx++, this._wheelDummy.matrix);
            }
        }
    }

    _syncMeshes() {
        const rot = this.physics.wheelRotation;
        const spRatio = this.physics.getSpeedRatio ? this.physics.getSpeedRatio() : 0;
        const swayT = performance.now() * 0.001;

        // 1. Locomotive Main Body (with curve banking & subtle suspension sway)
        this.bodyGroup.position.copy(this.physics.currentPosition);
        const tan = this.physics.currentTangent;
        this.bodyGroup.rotation.y = Math.atan2(tan.x, tan.z);
        const hDist = Math.hypot(tan.x, tan.z) || 1.0;
        this.bodyGroup.rotation.x = -Math.atan2(tan.y, hDist);
        const locoCurve = this.physics.frontBogieTan.x * this.physics.rearBogieTan.z - this.physics.frontBogieTan.z * this.physics.rearBogieTan.x;
        const locoBank = Math.max(-0.055, Math.min(0.055, locoCurve * 0.55 * spRatio));
        this.bodyGroup.rotation.z = locoBank + Math.sin(swayT * 2.5) * 0.008 * spRatio;

        // 2. Locomotive Bogies & Wheels
        let bIdx = 0;
        if (this.bogieInst && this.wheelInst) {
            this._updateBogieInstance(bIdx++, this.physics.frontBogiePos, this.physics.frontBogieTan, rot);
            this._updateBogieInstance(bIdx++, this.physics.rearBogiePos, this.physics.rearBogieTan, rot);
        }

        // 3. Passenger Carriages (with curve banking & staggered suspension sway)
        for (let i = 0; i < this.carriages.length; i++) {
            const car = this.carriages[i];
            const data = this.physics.carriagesData[i];
            if (!data) continue;

            car.group.position.copy(data.position);
            car.group.rotation.y = Math.atan2(data.tangent.x, data.tangent.z);
            const hd = Math.hypot(data.tangent.x, data.tangent.z) || 1.0;
            car.group.rotation.x = -Math.atan2(data.tangent.y, hd);
            const carCurve = data.frontTangent.x * data.rearTangent.z - data.frontTangent.z * data.rearTangent.x;
            const carBank = Math.max(-0.055, Math.min(0.055, carCurve * 0.55 * spRatio));
            car.group.rotation.z = carBank + Math.sin(swayT * 2.5 + (i + 1) * 0.85) * 0.011 * spRatio;

            if (this.bogieInst && this.wheelInst) {
                this._updateBogieInstance(bIdx++, data.frontBogiePos, data.frontTangent, rot);
                this._updateBogieInstance(bIdx++, data.rearBogiePos, data.rearTangent, rot);
            }
        }

        if (this.bogieInst && this.wheelInst) {
            this.bogieInst.instanceMatrix.needsUpdate = true;
            this.wheelInst.instanceMatrix.needsUpdate = true;
        }
    }

    _updateSmoke(dt) {
        const isActive = this.physics.isRunning || this.physics.speed > 0.2;
        const interval = isActive ? Math.max(0.06, 0.22 - (this.physics.getSpeedRatio ? this.physics.getSpeedRatio() : 0) * 0.14) : 0.6;
        this.smokeTimer += dt;

        if (this.smokeTimer >= interval) {
            this.smokeTimer = 0;
            for (let i = 0; i < this.smokePool.length; i++) {
                const p = this.smokePool[i];
                if (p.age >= p.maxAge) {
                    const pos = this.physics.currentPosition;
                    const tan = this.physics.currentTangent;
                    p.age = 0;
                    p.maxAge = 1.1 + Math.random() * 0.4;
                    // Exhaust stack is at +0.6m on hood
                    p.mesh.position.set(
                        pos.x + tan.x * 0.6 + (Math.random() - 0.5) * 0.2,
                        pos.y + 4.1,
                        pos.z + tan.z * 0.6 + (Math.random() - 0.5) * 0.2
                    );
                    p.vx = (Math.random() - 0.5) * 0.8 - tan.x * (this.physics.speed * 0.18);
                    p.vy = 2.2 + (this.physics.getSpeedRatio ? this.physics.getSpeedRatio() : 0) * 2.4;
                    p.vz = (Math.random() - 0.5) * 0.8 - tan.z * (this.physics.speed * 0.18);
                    p.mesh.scale.setScalar(0.55);
                    p.mat.opacity = isActive ? 0.38 : 0.15;
                    p.mesh.visible = true;
                    break;
                }
            }
        }

        for (let i = 0; i < this.smokePool.length; i++) {
            const p = this.smokePool[i];
            if (p.age < p.maxAge) {
                p.age += dt;
                if (p.age >= p.maxAge) {
                    p.mesh.visible = false;
                } else {
                    const t = p.age / p.maxAge;
                    p.mesh.position.x += p.vx * dt;
                    p.mesh.position.y += p.vy * dt;
                    p.mesh.position.z += p.vz * dt;
                    p.mesh.scale.setScalar(0.55 + t * 2.1);
                    p.mat.opacity = (1.0 - t) * 0.34;
                }
            }
        }
    }
}
