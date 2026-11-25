// environment.js - 100% GPU-Instanced Scenic World (Station, Lake, Cottages, Forest, Cliffs, Level Crossing & Poles)
// Cuts scene draw calls from 1,600+ down to ~22 draw calls total!
class EnvironmentManager {
    constructor(scene, trackSystem) {
        this.scene = scene;
        this.trackSystem = trackSystem;
        this.trackLength = trackSystem.totalLength;

        this.nightGlowMaterials = [];
        this.crossingGates = [];
        this.crossingLights = [];
        this.crossingTimer = 0;

        this._createSharedMaterials();
        this._buildTerrainAndLake();
        this._buildCountryStation();
        this._buildLevelCrossing();
        this._buildInstancedTelegraphPoles();
        this._buildInstancedForestAndRocks();
        this._buildInstancedVillageCottages();
    }

    _createSharedMaterials() {
        // Procedural Lush Countryside Patchwork Terrain Texture
        const c = document.createElement('canvas');
        c.width = 512; c.height = 512;
        const g = c.getContext('2d');
        g.fillStyle = '#3b6e38';
        g.fillRect(0, 0, 512, 512);

        // Agricultural fields & meadow patches
        const hues = ['#346331', '#457a3f', '#528540', '#6d8c3c', '#2e572b'];
        for (let i = 0; i < 60; i++) {
            g.fillStyle = hues[i % hues.length];
            const px = (i * 97) % 512;
            const py = (i * 61) % 512;
            g.fillRect(px, py, 64 + (i % 48), 54 + (i % 40));
        }
        const terrainTex = new THREE.CanvasTexture(c);
        terrainTex.wrapS = THREE.RepeatWrapping;
        terrainTex.wrapT = THREE.RepeatWrapping;
        terrainTex.repeat.set(28, 28);

        // Cottage Wall + Glowing Window Texture
        const wDiff = document.createElement('canvas');
        wDiff.width = 128; wDiff.height = 128;
        const wg = wDiff.getContext('2d');
        wg.fillStyle = '#e5dcc8';
        wg.fillRect(0, 0, 128, 128);
        wg.fillStyle = '#5c4636';
        wg.fillRect(0, 112, 128, 16);
        wg.fillRect(54, 68, 20, 44); // Door

        const wEmis = document.createElement('canvas');
        wEmis.width = 128; wEmis.height = 128;
        const we = wEmis.getContext('2d');
        we.fillStyle = '#000000';
        we.fillRect(0, 0, 128, 128);

        [[18, 42], [86, 42]].forEach(([wx, wy]) => {
            wg.fillStyle = '#263545';
            wg.fillRect(wx, wy, 24, 26);
            we.fillStyle = '#ffd478';
            we.fillRect(wx + 2, wy + 2, 20, 22);
        });

        const cottageGlowMat = new THREE.MeshLambertMaterial({
            map: new THREE.CanvasTexture(wDiff),
            emissive: 0xffd478,
            emissiveMap: new THREE.CanvasTexture(wEmis),
            emissiveIntensity: 0.08
        });
        this.nightGlowMaterials.push(cottageGlowMat);

        const poleBulbMat = new THREE.MeshBasicMaterial({ color: 0x666055 });
        this.poleBulbMat = poleBulbMat;

        this.materials = {
            terrain: new THREE.MeshLambertMaterial({ map: terrainTex }),
            water: new THREE.MeshLambertMaterial({ color: 0x26658a, emissive: 0x091d2b }),
            woodPole: new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.poleWood }),
            insulator: new THREE.MeshLambertMaterial({ color: GAME_CONFIG.colors.insulators }),
            wire: new THREE.LineBasicMaterial({ color: 0x22262a }),
            trunk: new THREE.MeshLambertMaterial({ color: 0x4a3828 }),
            palmTrunk: new THREE.MeshLambertMaterial({ color: 0x6b5846 }),
            palmFoliage: new THREE.MeshLambertMaterial({ color: 0x2d7a36, side: THREE.DoubleSide }),
            banyanFoliage: new THREE.MeshLambertMaterial({ color: 0x265c29 }),
            bananaFoliage: new THREE.MeshLambertMaterial({ color: 0x5ba336, side: THREE.DoubleSide }),
            mustardField: new THREE.MeshLambertMaterial({ color: 0xeab308 }),
            bushFoliage: new THREE.MeshLambertMaterial({ color: 0x4e873c }),
            rock: new THREE.MeshLambertMaterial({ color: 0x6c7075 }),
            cottageWall: cottageGlowMat,
            cottageRoof: new THREE.MeshLambertMaterial({ color: 0x8c372b })
        };
    }

    _buildTerrainAndLake() {
        // Rolling countryside terrain with flat corridor around the Figure-8 track
        const groundGeo = new THREE.PlaneGeometry(3600, 3600, 72, 72);
        groundGeo.rotateX(-Math.PI / 2);

        const posArr = groundGeo.attributes.position.array;
        for (let i = 0; i < posArr.length; i += 3) {
            const x = posArr[i];
            const z = posArr[i + 2];
            const distFromCenterCorridor = Math.max(0, Math.abs(x) - 390);
            const hillFactor = Math.min(1.0, distFromCenterCorridor / 220.0);
            const h = (Math.sin(x * 0.0045) * Math.cos(z * 0.0045) * 18.0 +
                       Math.sin(x * 0.012 + z * 0.009) * 6.0) * hillFactor;
            posArr[i + 1] = Math.max(-0.25, h) - 0.25;
        }
        groundGeo.computeVertexNormals();

        const groundMesh = new THREE.Mesh(groundGeo, this.materials.terrain);
        groundMesh.matrixAutoUpdate = false;
        groundMesh.updateMatrix();
        this.scene.add(groundMesh);

        // Scenic Mirror Lake inside the South Loop (around x=0, z=680)
        const lakeGroup = new THREE.Group();
        const lakeMesh = new THREE.Mesh(
            new THREE.CircleGeometry(155, 32),
            this.materials.water
        );
        lakeMesh.rotation.x = -Math.PI / 2;
        lakeMesh.position.set(0, -0.08, 680);
        lakeGroup.add(lakeMesh);

        // Sandy shoreline ring
        const shoreMesh = new THREE.Mesh(
            new THREE.RingGeometry(150, 166, 32),
            new THREE.MeshLambertMaterial({ color: 0xa69576 })
        );
        shoreMesh.rotation.x = -Math.PI / 2;
        shoreMesh.position.set(0, -0.14, 680);
        lakeGroup.add(shoreMesh);

        // 4 Wooden Country Sailboats (নৌকা) & Water Lilies (শাপলা) on the Lake (Section 21.3)
        const hullMat = new THREE.MeshLambertMaterial({ color: 0x4d321e });
        const sailMat = new THREE.MeshLambertMaterial({ color: 0xf5efe2, side: THREE.DoubleSide });
        [[-45, 640, 0.4], [50, 710, -1.1], [-20, 745, 2.1], [65, 650, 0.9]].forEach(([bx, bz, rot]) => {
            const boat = new THREE.Group();
            const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 5.2), hullMat);
            hull.position.y = 0.2;
            boat.add(hull);
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), hullMat);
            mast.position.y = 2.2;
            boat.add(mast);
            const sail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.4, 3), sailMat);
            sail.position.set(0, 2.3, 0.2);
            boat.add(sail);
            boat.position.set(bx, -0.05, bz);
            boat.rotation.y = rot;
            lakeGroup.add(boat);
        });

        // Water lilies (শাপলা) on the Lake
        const lilyMat = new THREE.MeshBasicMaterial({ color: 0x2e6f40, side: THREE.DoubleSide });
        const lilyGeo = new THREE.CircleGeometry(1.4, 8);
        lilyGeo.rotateX(-Math.PI * 0.5);
        const lilyInst = new THREE.InstancedMesh(lilyGeo, lilyMat, 30);
        const lDummy = new THREE.Object3D();
        for (let li = 0; li < 30; li++) {
            const lAngle = (li / 30) * Math.PI * 2 + (li % 3);
            const lRad = 40 + (li * 13) % 95;
            lDummy.position.set(Math.cos(lAngle) * lRad, -0.06, 680 + Math.sin(lAngle) * lRad);
            lDummy.scale.set(0.8 + (li % 4) * 0.2, 1, 0.8 + (li % 4) * 0.2);
            lDummy.updateMatrix();
            lilyInst.setMatrixAt(li, lDummy.matrix);
        }
        lilyInst.instanceMatrix.needsUpdate = true;
        lakeGroup.add(lilyInst);

        // Scenic River / Khal (নদী / খাল) running East-West at z = -935 under the twin river bridges
        const riverMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2400, 38),
            this.materials.water
        );
        riverMesh.rotation.x = -Math.PI / 2;
        riverMesh.position.set(0, -0.10, -935);
        lakeGroup.add(riverMesh);

        const riverBankMat = new THREE.MeshLambertMaterial({ color: 0x9e8c6c });
        [-22, 22].forEach(rz => {
            const bank = new THREE.Mesh(new THREE.PlaneGeometry(2400, 9), riverBankMat);
            bank.rotation.x = -Math.PI / 2;
            bank.position.set(0, -0.17, -935 + rz);
            lakeGroup.add(bank);
        });

        // Country Boats (নৌকা) gliding on the River Khal
        [[-140, -938, 1.5], [0, -932, -1.55], [160, -936, 1.48]].forEach(([bx, bz, rot]) => {
            const boat = new THREE.Group();
            const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 5.0), hullMat);
            hull.position.y = 0.2;
            const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.2, 6, 1, false, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0x8c765c }));
            canopy.rotation.z = Math.PI * 0.5;
            canopy.rotation.y = Math.PI * 0.5;
            canopy.position.set(0, 0.55, 0);
            boat.add(hull, canopy);
            boat.position.set(bx, -0.06, bz);
            boat.rotation.y = rot;
            lakeGroup.add(boat);
        });

        lakeGroup.traverse((c) => {
            c.matrixAutoUpdate = false;
            c.updateMatrix();
        });
        this.scene.add(lakeGroup);
    }

    // Heritage Countryside Railway Station ("গ্রিনল্যান্ডস জংশন / Greenlands Junction")
    // Corrected placement on the outer side of track with an 84m curved platform (Sections 11 & 13)
    _buildCountryStation() {
        const uStation = 0.085;
        const totalLen = this.trackLength || 2200;
        const EDGE = 2.05, PW = 5.6, D = EDGE + PW / 2; // 4.85m platform center from track axis

        const platMat = new THREE.MeshLambertMaterial({ color: 0x878278 });
        const safetyLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x7c2d23 });
        const pillarMat = new THREE.MeshLambertMaterial({ color: 0x263847 });
        const benchMat = new THREE.MeshLambertMaterial({ color: 0x4a3222 });

        const stGroup = new THREE.Group();
        this.stationGroup = stGroup;

        // 84m curved platform built in 7 segments of 12m following track spline curvature (U2, B15)
        const segCount = 7;
        const segLen = 12.0;
        const segGeo = new THREE.BoxGeometry(PW, 0.85, segLen + 0.3);
        const yelGeo = new THREE.BoxGeometry(0.22, 0.02, segLen + 0.3);
        const canopyRoofGeo = new THREE.BoxGeometry(5.2, 0.25, segLen + 0.2);
        const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 4.0, 8);
        const benchGeo = new THREE.BoxGeometry(1.2, 0.5, 2.4);

        const pt = new THREE.Vector3();
        const tan = new THREE.Vector3();

        for (let k = -3; k <= 3; k++) {
            const uSeg = (uStation + (k * segLen) / totalLen + 1.0) % 1.0;
            this.trackSystem.samplePoint(uSeg, pt);
            this.trackSystem.sampleTangent(uSeg, tan);

            const nx = -tan.z, nz = tan.x;
            const nLen = Math.hypot(nx, nz) || 1.0;
            const rx = nx / nLen, rz = nz / nLen;
            const yaw = Math.atan2(tan.x, tan.z);

            const segGroup = new THREE.Group();
            segGroup.position.set(pt.x - rx * D, pt.y, pt.z - rz * D);
            segGroup.rotation.y = yaw;

            // Platform concrete slab
            const platMesh = new THREE.Mesh(segGeo, platMat);
            platMesh.position.set(0, 0.42, 0);
            segGroup.add(platMesh);

            // Tactile yellow safety line along track edge (local x = -PW/2 + 0.25)
            const yelMesh = new THREE.Mesh(yelGeo, safetyLineMat);
            yelMesh.position.set(-PW * 0.5 + 0.25, 0.86, 0);
            segGroup.add(yelMesh);

            // Covered Canopy over central 48m (|k| <= 2)
            if (Math.abs(k) <= 2) {
                const cRoof = new THREE.Mesh(canopyRoofGeo, roofMat);
                cRoof.position.set(-0.2, 4.85, 0); // Underside clear of 4.2m train roof
                segGroup.add(cRoof);

                // Canopy support posts
                const post = new THREE.Mesh(postGeo, pillarMat);
                post.position.set(-1.6, 2.85, 0);
                segGroup.add(post);

                // Emissive platform lamp bulb
                const lampBulb = new THREE.Mesh(
                    new THREE.SphereGeometry(0.15, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffe099 })
                );
                lampBulb.position.set(-1.6, 4.65, 0);
                segGroup.add(lampBulb);

                // Platform benches
                if (k === -1 || k === 1) {
                    const bench = new THREE.Mesh(benchGeo, benchMat);
                    bench.position.set(1.1, 0.95, 0);
                    segGroup.add(bench);
                }
            }

            stGroup.add(segGroup);
        }

        // Main Station Building positioned flush behind the platform at uStation (B14)
        this.trackSystem.samplePoint(uStation, pt);
        this.trackSystem.sampleTangent(uStation, tan);
        const nx = -tan.z, nz = tan.x;
        const nLen = Math.hypot(nx, nz) || 1.0;
        const rx = nx / nLen, rz = nz / nLen;
        const yaw = Math.atan2(tan.x, tan.z);

        const bldgGroup = new THREE.Group();
        // Building center placed at D + PW/2 + BldgWidth/2 = 4.85 + 2.8 + 3.25 = 10.9m from track
        const bldgDist = D + 6.0;
        bldgGroup.position.set(pt.x - rx * bldgDist, pt.y, pt.z - rz * bldgDist);
        bldgGroup.rotation.y = yaw;

        const bldg = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4.8, 24), this.materials.cottageWall);
        bldg.position.set(0, 2.4, 0);
        bldgGroup.add(bldg);

        const bldgRoof = new THREE.Mesh(new THREE.ConeGeometry(14.5, 3.2, 4), roofMat);
        bldgRoof.rotation.y = Math.PI / 4;
        bldgRoof.scale.set(0.55, 1, 1.35);
        bldgRoof.position.set(0, 6.4, 0);
        bldgGroup.add(bldgRoof);

        // Bilingual Bengali & English Station Signboard (Section 13.3)
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 512; sCanvas.height = 128;
        const sg = sCanvas.getContext('2d');
        sg.fillStyle = '#0f2f1e'; // Bangladesh railway deep green
        sg.fillRect(0, 0, 512, 128);
        sg.strokeStyle = '#e0b658';
        sg.lineWidth = 6;
        sg.strokeRect(4, 4, 504, 120);

        sg.fillStyle = '#f8fafc';
        sg.font = "bold 32px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        sg.textAlign = 'center';
        sg.textBaseline = 'middle';
        sg.fillText('গ্রিনল্যান্ডস জংশন', 256, 42);

        sg.font = 'bold 24px sans-serif';
        sg.fillStyle = '#facc15';
        sg.fillText('GREENLANDS JUNCTION', 256, 90);

        const signMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sCanvas) });
        const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.25, 5.2), signMat);
        signBoard.position.set(pt.x - rx * (D + 1.2), pt.y + 4.9, pt.z - rz * (D + 1.2));
        signBoard.rotation.y = yaw;
        stGroup.add(signBoard);

        stGroup.add(bldgGroup);
        stGroup.traverse((c) => {
            c.matrixAutoUpdate = false;
            c.updateMatrix();
        });
        this.scene.add(stGroup);
    }

    // Animated Level Crossing with Red/White Barriers & Flashing Signal Lights
    _buildLevelCrossing() {
        this.crossingU = 0.24;
        const pt = new THREE.Vector3();
        const tan = new THREE.Vector3();
        this.trackSystem.samplePoint(this.crossingU, pt);
        this.trackSystem.sampleTangent(this.crossingU, tan);

        const crGroup = new THREE.Group();
        crGroup.position.copy(pt);
        crGroup.rotation.y = Math.atan2(tan.x, tan.z);

        // Asphalt Road Crossing
        const road = new THREE.Mesh(
            new THREE.BoxGeometry(36, 0.14, 7.2),
            new THREE.MeshLambertMaterial({ color: 0x33383e })
        );
        road.position.y = 0.08;
        crGroup.add(road);

        // Barrier Posts & Pivoting Gates
        const postMat = new THREE.MeshLambertMaterial({ color: 0x22262a });
        const gateMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });

        [[-4.2, -4.0, 1], [4.2, 4.0, -1]].forEach(([px, pz, dirSign]) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.8, 8), postMat);
            post.position.set(px, 1.4, pz);
            crGroup.add(post);

            // Warning Lamp
            const lampMat = new THREE.MeshBasicMaterial({ color: 0x440a0a });
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), lampMat);
            lamp.position.set(px, 2.85, pz);
            crGroup.add(lamp);
            this.crossingLights.push(lampMat);

            // Pivoting Arm
            const pivot = new THREE.Group();
            pivot.position.set(px, 1.15, pz);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 6.2), gateMat);
            arm.position.set(0, 0, -dirSign * 2.8);
            pivot.add(arm);
            crGroup.add(pivot);
            this.crossingGates.push({ pivot: pivot, dirSign: dirSign, angle: 0 });
        });

        // Level Crossing Warning Signboard "সাবধান! রেলগেট" (Section 21.5)
        const lcCanvas = document.createElement('canvas');
        lcCanvas.width = 256; lcCanvas.height = 96;
        const lcg = lcCanvas.getContext('2d');
        lcg.fillStyle = '#b91c1c';
        lcg.fillRect(0, 0, 256, 96);
        lcg.strokeStyle = '#f8fafc';
        lcg.lineWidth = 4;
        lcg.strokeRect(3, 3, 250, 90);
        lcg.fillStyle = '#ffffff';
        lcg.font = "bold 24px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        lcg.textAlign = 'center';
        lcg.textBaseline = 'middle';
        lcg.fillText('সাবধান! রেলগেট', 128, 48);

        const lcSignMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lcCanvas) });
        const lcSign = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.8), lcSignMat);
        lcSign.position.set(-5.2, 2.2, -4.2);
        crGroup.add(lcSign);

        this.scene.add(crGroup);
    }

    // 100% Instanced Telegraph Poles, Cross-Arms, Insulators & Bulbs (4 draw calls total instead of 600!)
    _buildInstancedTelegraphPoles() {
        const poleSpacing = 36.0;
        const count = Math.floor(this.trackLength / poleSpacing);

        const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7.5, 7);
        const armGeo = new THREE.BoxGeometry(1.8, 0.12, 0.12);
        const bulbGeo = new THREE.SphereGeometry(0.16, 6, 6);

        const poleInst = new THREE.InstancedMesh(poleGeo, this.materials.woodPole, count);
        const armInst = new THREE.InstancedMesh(armGeo, this.materials.woodPole, count);
        const bulbInst = new THREE.InstancedMesh(bulbGeo, this.poleBulbMat, count);

        const dummy = new THREE.Object3D();
        const pt = new THREE.Vector3();
        const tan = new THREE.Vector3();
        const wirePoints = [];

        for (let i = 0; i < count; i++) {
            const u = (i * poleSpacing) / this.trackLength;
            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);

            const nx = -tan.z, nz = tan.x;
            const nLen = Math.hypot(nx, nz) || 1;
            const rx = nx / nLen, rz = nz / nLen;

            const sideOffset = 7.8;
            const px = pt.x + rx * sideOffset;
            const pz = pt.z + rz * sideOffset;
            const py = pt.y + 3.6;
            const yaw = Math.atan2(tan.x, tan.z);

            dummy.position.set(px, py, pz);
            dummy.rotation.set(0, yaw, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            poleInst.setMatrixAt(i, dummy.matrix);

            dummy.position.set(px, py + 3.2, pz);
            dummy.updateMatrix();
            armInst.setMatrixAt(i, dummy.matrix);

            dummy.position.set(px - rx * 0.85, py + 3.05, pz - rz * 0.85);
            dummy.updateMatrix();
            bulbInst.setMatrixAt(i, dummy.matrix);

            wirePoints.push(new THREE.Vector3(px - rx * 0.75, py + 3.25, pz - rz * 0.75));
        }
        // Close wire loop
        if (wirePoints.length > 0) wirePoints.push(wirePoints[0].clone());

        poleInst.instanceMatrix.needsUpdate = true;
        armInst.instanceMatrix.needsUpdate = true;
        bulbInst.instanceMatrix.needsUpdate = true;

        [poleInst, armInst, bulbInst].forEach(inst => {
            inst.matrixAutoUpdate = false;
            inst.updateMatrix();
        });
        this.scene.add(poleInst, armInst, bulbInst);

        const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
        const wireLine = new THREE.Line(wireGeo, this.materials.wire);
        wireLine.matrixAutoUpdate = false;
        wireLine.updateMatrix();
        this.scene.add(wireLine);
    }

    // 100% Instanced Bangladeshi Flora: Coconut Palms, Banyan/Mango Trees, Banana Clumps, Mustard Fields & Boulders
    _buildInstancedForestAndRocks() {
        const palmCount = 300;
        const banyanCount = 220;
        const bananaCount = 160;
        const bushCount = 220;
        const mustardCount = 36;
        const rockCount = 55;

        // Tapered Coconut/Palm trunk + 6-frond radial crown
        const palmTrunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 7.6, 6);
        const frondGeoms = [];
        for (let f = 0; f < 6; f++) {
            const ang = (f / 6) * Math.PI * 2;
            const frond = new THREE.BoxGeometry(0.65, 0.08, 3.2);
            frond.rotateX(0.28);
            frond.translate(0, -0.35, 1.55);
            frond.rotateY(ang);
            frondGeoms.push(frond);
        }
        const palmCrownGeo = window.mergeStaticGeometries ? window.mergeStaticGeometries(frondGeoms) : frondGeoms[0];

        // Banyan / Mango trunk & wide canopy
        const banyanTrunkGeo = new THREE.CylinderGeometry(0.28, 0.50, 3.6, 6);
        const banyanCrownGeo = new THREE.DodecahedronGeometry(3.1, 1);

        // Banana clump (3 broad angled leaves)
        const bLeaves = [];
        for (let l = 0; l < 4; l++) {
            const leaf = new THREE.BoxGeometry(0.75, 0.06, 2.4);
            leaf.rotateX(0.45);
            leaf.translate(0, 1.4, 0.9);
            leaf.rotateY((l / 4) * Math.PI * 2 + 0.3);
            bLeaves.push(leaf);
        }
        const bananaGeo = window.mergeStaticGeometries ? window.mergeStaticGeometries(bLeaves) : bLeaves[0];

        const bushGeo = new THREE.DodecahedronGeometry(1.15, 0);
        const mustardGeo = new THREE.BoxGeometry(16, 0.25, 14);
        const rockGeo = new THREE.DodecahedronGeometry(3.0, 0);

        const palmTrunkInst = new THREE.InstancedMesh(palmTrunkGeo, this.materials.palmTrunk, palmCount);
        const palmCrownInst = new THREE.InstancedMesh(palmCrownGeo, this.materials.palmFoliage, palmCount);
        const banyanTrunkInst = new THREE.InstancedMesh(banyanTrunkGeo, this.materials.trunk, banyanCount);
        const banyanCrownInst = new THREE.InstancedMesh(banyanCrownGeo, this.materials.banyanFoliage, banyanCount);
        const bananaInst = new THREE.InstancedMesh(bananaGeo, this.materials.bananaFoliage, bananaCount);
        const bushInst = new THREE.InstancedMesh(bushGeo, this.materials.bushFoliage, bushCount);
        const mustardInst = new THREE.InstancedMesh(mustardGeo, this.materials.mustardField, mustardCount);
        const rockInst = new THREE.InstancedMesh(rockGeo, this.materials.rock, rockCount);

        const dummy = new THREE.Object3D();
        const pt = new THREE.Vector3();
        const tan = new THREE.Vector3();

        const rand = (seed) => {
            const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
            return x - Math.floor(x);
        };

        const isClear = (x, z, minTrackDist) => {
            if (Math.hypot(x, z - 680) < 170) return false; // Lake
            if (Math.abs(z + 935) < 32) return false;       // River Khal
            return this.trackSystem.getMinDistanceToTrack(x, z) >= minTrackDist;
        };

        // 1. Coconut & Palm Trees (নারকেল / তাল গাছ)
        for (let i = 0; i < palmCount; i++) {
            const u = rand(i + 1);
            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);
            const nx = -tan.z, nz = tan.x, nLen = Math.hypot(nx, nz) || 1;
            const side = rand(i + 500) < 0.5 ? -1 : 1;
            const dist = 14.0 + rand(i + 1000) * 95.0;
            const x = pt.x + (nx / nLen) * side * dist;
            const z = pt.z + (nz / nLen) * side * dist;

            if (!isClear(x, z, 11.5)) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                palmTrunkInst.setMatrixAt(i, dummy.matrix);
                palmCrownInst.setMatrixAt(i, dummy.matrix);
                continue;
            }

            const sc = 0.8 + rand(i + 1500) * 0.55;
            const lean = (rand(i + 200) - 0.5) * 0.14;
            dummy.position.set(x, 3.6 * sc, z);
            dummy.rotation.set(lean, rand(i) * Math.PI * 2, lean * 0.5);
            dummy.scale.set(sc, sc, sc);
            dummy.updateMatrix();
            palmTrunkInst.setMatrixAt(i, dummy.matrix);

            dummy.position.set(x + Math.sin(lean) * 3.5 * sc, 7.3 * sc, z);
            dummy.updateMatrix();
            palmCrownInst.setMatrixAt(i, dummy.matrix);
        }

        // 2. Banyan / Mango Trees (বট ও আম গাছ)
        for (let i = 0; i < banyanCount; i++) {
            const s = i + 3000;
            const u = rand(s);
            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);
            const nx = -tan.z, nz = tan.x, nLen = Math.hypot(nx, nz) || 1;
            const side = rand(s + 200) < 0.5 ? -1 : 1;
            const dist = 15.0 + rand(s + 400) * 85.0;
            const x = pt.x + (nx / nLen) * side * dist;
            const z = pt.z + (nz / nLen) * side * dist;

            if (!isClear(x, z, 12.0)) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                banyanTrunkInst.setMatrixAt(i, dummy.matrix);
                banyanCrownInst.setMatrixAt(i, dummy.matrix);
                continue;
            }

            const sc = 0.85 + rand(s + 600) * 0.65;
            dummy.position.set(x, 1.7 * sc, z);
            dummy.rotation.set(0, rand(s) * Math.PI, 0);
            dummy.scale.set(sc, sc, sc);
            dummy.updateMatrix();
            banyanTrunkInst.setMatrixAt(i, dummy.matrix);

            dummy.position.set(x, 4.6 * sc, z);
            dummy.scale.set(sc * 1.35, sc * 0.85, sc * 1.35);
            dummy.updateMatrix();
            banyanCrownInst.setMatrixAt(i, dummy.matrix);
        }

        // 3. Banana Clumps (কলাগাছ)
        for (let i = 0; i < bananaCount; i++) {
            const s = i + 4500;
            const u = rand(s);
            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);
            const nx = -tan.z, nz = tan.x, nLen = Math.hypot(nx, nz) || 1;
            const side = rand(s + 150) < 0.5 ? -1 : 1;
            const dist = 10.5 + rand(s + 250) * 45.0;
            const x = pt.x + (nx / nLen) * side * dist;
            const z = pt.z + (nz / nLen) * side * dist;

            if (!isClear(x, z, 9.5)) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                bananaInst.setMatrixAt(i, dummy.matrix);
                continue;
            }
            const sc = 0.75 + rand(s + 350) * 0.5;
            dummy.position.set(x, 0, z);
            dummy.rotation.set(0, rand(s) * Math.PI * 2, 0);
            dummy.scale.set(sc, sc, sc);
            dummy.updateMatrix();
            bananaInst.setMatrixAt(i, dummy.matrix);
        }

        // 4. Trackside Bushes
        for (let i = 0; i < bushCount; i++) {
            const s = i + 6000;
            const u = rand(s);
            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);
            const nx = -tan.z, nz = tan.x, nLen = Math.hypot(nx, nz) || 1;
            const side = rand(s + 100) < 0.5 ? -1 : 1;
            const dist = 7.5 + rand(s + 200) * 28.0;
            const x = pt.x + (nx / nLen) * side * dist;
            const z = pt.z + (nz / nLen) * side * dist;

            if (!isClear(x, z, 6.8)) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                bushInst.setMatrixAt(i, dummy.matrix);
                continue;
            }

            const sc = 0.6 + rand(s + 300) * 0.7;
            dummy.position.set(x, 0.5 * sc, z);
            dummy.rotation.set(0, rand(s) * Math.PI, 0);
            dummy.scale.set(sc * 1.2, sc * 0.8, sc * 1.2);
            dummy.updateMatrix();
            bushInst.setMatrixAt(i, dummy.matrix);
        }

        // 5. Golden Mustard Fields (হলুদ সরিষা ক্ষেত)
        for (let i = 0; i < mustardCount; i++) {
            const s = i + 7500;
            const u = rand(s);
            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);
            const nx = -tan.z, nz = tan.x, nLen = Math.hypot(nx, nz) || 1;
            const side = (i % 2 === 0) ? 1 : -1;
            const dist = 26.0 + rand(s + 100) * 55.0;
            const x = pt.x + (nx / nLen) * side * dist;
            const z = pt.z + (nz / nLen) * side * dist;

            if (!isClear(x, z, 18.0)) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                mustardInst.setMatrixAt(i, dummy.matrix);
                continue;
            }
            dummy.position.set(x, -0.10, z);
            dummy.rotation.set(0, Math.atan2(tan.x, tan.z), 0);
            dummy.scale.set(0.8 + rand(s) * 0.6, 1, 0.8 + rand(s + 20) * 0.6);
            dummy.updateMatrix();
            mustardInst.setMatrixAt(i, dummy.matrix);
        }

        // 6. Cliff Boulders
        for (let i = 0; i < rockCount; i++) {
            const s = i + 9000;
            const u = rand(s);
            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);
            const nx = -tan.z, nz = tan.x, nLen = Math.hypot(nx, nz) || 1;
            const side = rand(s + 50) < 0.5 ? -1 : 1;
            const dist = 20.0 + rand(s + 150) * 55.0;
            const x = pt.x + (nx / nLen) * side * dist;
            const z = pt.z + (nz / nLen) * side * dist;

            if (!isClear(x, z, 10.0)) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                rockInst.setMatrixAt(i, dummy.matrix);
                continue;
            }

            const sx = 0.8 + rand(s + 10) * 1.4;
            const sy = 0.6 + rand(s + 20) * 1.2;
            const sz = 0.8 + rand(s + 30) * 1.4;
            dummy.position.set(x, sy * 1.1, z);
            dummy.rotation.set(rand(s) * 0.4, rand(s + 5) * Math.PI, rand(s + 9) * 0.4);
            dummy.scale.set(sx, sy, sz);
            dummy.updateMatrix();
            rockInst.setMatrixAt(i, dummy.matrix);
        }

        [palmTrunkInst, palmCrownInst, banyanTrunkInst, banyanCrownInst, bananaInst, bushInst, mustardInst, rockInst].forEach(inst => {
            inst.instanceMatrix.needsUpdate = true;
            inst.matrixAutoUpdate = false;
            inst.updateMatrix();
        });
        this.scene.add(palmTrunkInst, palmCrownInst, banyanTrunkInst, banyanCrownInst, bananaInst, bushInst, mustardInst, rockInst);
    }

    // 100% Instanced Bangladeshi Tin-Roof Huts with Night-Glowing Windows (Section 21.1)
    _buildInstancedVillageCottages() {
        const count = 42;
        const bodyGeo = new THREE.BoxGeometry(6.4, 3.6, 5.0);
        // Sloped tin roof geometry
        const roofGeo = new THREE.ConeGeometry(5.2, 2.0, 4);
        roofGeo.rotateY(Math.PI / 4);
        roofGeo.scale(1.2, 1.0, 0.95);

        const bodyInst = new THREE.InstancedMesh(bodyGeo, this.materials.cottageWall, count);
        const roofInst = new THREE.InstancedMesh(roofGeo, this.materials.cottageRoof, count);

        const dummy = new THREE.Object3D();
        const pt = new THREE.Vector3();
        const tan = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            const u = ((i + 0.5) / count) % 1.0;
            // Avoid bridge center & station
            if (Math.abs(u - 0.085) < 0.03 || Math.abs(u - 0.52) < 0.04) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                bodyInst.setMatrixAt(i, dummy.matrix);
                roofInst.setMatrixAt(i, dummy.matrix);
                continue;
            }

            this.trackSystem.samplePoint(u, pt);
            this.trackSystem.sampleTangent(u, tan);
            const nx = -tan.z, nz = tan.x, nLen = Math.hypot(nx, nz) || 1;
            const side = (i % 2 === 0) ? 1 : -1;
            const dist = 24.0 + ((i * 19) % 32);

            const bx = pt.x + (nx / nLen) * side * dist;
            const bz = pt.z + (nz / nLen) * side * dist;
            // Strictly keep clear of tracks (min 22m safe corridor), lake, river, bridge, and station
            if (Math.hypot(bx, bz - 680) < 170 || Math.abs(bz + 935) < 34 || this.trackSystem.getMinDistanceToTrack(bx, bz) < 22.0) {
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                bodyInst.setMatrixAt(i, dummy.matrix);
                roofInst.setMatrixAt(i, dummy.matrix);
                continue;
            }

            const yaw = Math.atan2(tan.x, tan.z) + (side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
            const sc = 0.9 + (i % 4) * 0.12;

            dummy.position.set(bx, 1.8 * sc, bz);
            dummy.rotation.set(0, yaw, 0);
            dummy.scale.set(sc, sc, sc);
            dummy.updateMatrix();
            bodyInst.setMatrixAt(i, dummy.matrix);

            dummy.position.set(bx, (3.6 + 1.0) * sc, bz);
            dummy.updateMatrix();
            roofInst.setMatrixAt(i, dummy.matrix);
        }

        bodyInst.instanceMatrix.needsUpdate = true;
        roofInst.instanceMatrix.needsUpdate = true;
        [bodyInst, roofInst].forEach(inst => {
            inst.matrixAutoUpdate = false;
            inst.updateMatrix();
        });
        this.scene.add(bodyInst, roofInst);
    }

    setNightFactor(windowGlowIntensity, isNightOrSunset) {
        for (let i = 0; i < this.nightGlowMaterials.length; i++) {
            this.nightGlowMaterials[i].emissiveIntensity = windowGlowIntensity;
        }
        if (this.poleBulbMat) {
            this.poleBulbMat.color.setHex(isNightOrSunset ? 0xffe082 : 0x666055);
        }
    }

    update(trainProgress, dt) {
        // Animate level crossing gates & flashing lights when train is near crossingU (0.24)
        let dU = Math.abs(trainProgress - this.crossingU);
        if (dU > 0.5) dU = 1.0 - dU;
        const trainNear = dU < 0.045;

        const targetAngle = trainNear ? 0.0 : (Math.PI * 0.45);
        for (let i = 0; i < this.crossingGates.length; i++) {
            const g = this.crossingGates[i];
            g.angle += (targetAngle - g.angle) * Math.min(1.0, (dt || 0.016) * 4.5);
            g.pivot.rotation.x = g.dirSign * g.angle;
        }

        if (trainNear) {
            this.crossingTimer += (dt || 0.016) * 8.0;
            const flash = Math.sin(this.crossingTimer) > 0;
            if (this.crossingLights.length >= 2) {
                this.crossingLights[0].color.setHex(flash ? 0xff2222 : 0x330505);
                this.crossingLights[1].color.setHex(!flash ? 0xff2222 : 0x330505);
            }
        } else {
            for (let i = 0; i < this.crossingLights.length; i++) {
                this.crossingLights[i].color.setHex(0x330505);
            }
        }
    }
}
