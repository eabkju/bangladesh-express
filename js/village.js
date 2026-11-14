// village.js - Realistic Minecraft-Inspired Rural Bangladeshi Village, Desi Zebu Cattle, Plough Teams & Bengali Sweet Shops
// Features: Day/Night routines, Bengali tea stalls (রহিমে চাচার চায়ের দোকান ইত্যাদি), 4 authentic sweet shops (মিষ্টান্ন ভাণ্ডার),
// Lungi & Gamcha clothing, Desi cattle with humps and eased yaw, 0 PointLights (emissive bulbs + glow sprites), zero track encroachment.

class VillageManager {
    constructor(scene, trackSystem, envManager) {
        this.scene = scene;
        this.trackSystem = trackSystem;
        this.envManager = envManager;

        this.farmers = [];
        this.cows = [];
        this.farmsteads = [];
        this.teaStalls = [];
        this.sweetShops = [];
        this.stallCustomers = [];
        this.nightGlowMaterials = [];

        this.currentTimePreset = 'day';
        this.isRaining = false;

        this._createSharedMaterials();
        this._buildHomesteads();
        this._buildBengaliTeaStalls();
        this._buildBengaliSweetShops();

        // Connect night glow materials to envManager if available
        if (this.envManager && this.envManager.nightGlowMaterials) {
            for (let i = 0; i < this.nightGlowMaterials.length; i++) {
                this.envManager.nightGlowMaterials.push(this.nightGlowMaterials[i]);
            }
        }

        // Verify clearance for all placed buildings (Section 11.3)
        const clearanceTargets = [
            ...this.teaStalls.map(s => ({ position: s.root.position, name: s.cfg.name })),
            ...this.sweetShops.map(s => ({ position: s.root.position, name: s.cfg.name }))
        ];
        if (this.trackSystem.assertClearance) {
            this.trackSystem.assertClearance(clearanceTargets);
        }
    }

    _createSharedMaterials() {
        // 1. Procedural Corrugated Tin Roof (Galvanized iron with subtle rust & grey stripes)
        const tDiff = document.createElement('canvas');
        tDiff.width = 128; tDiff.height = 128;
        const tg = tDiff.getContext('2d');
        tg.fillStyle = '#8a9299';
        tg.fillRect(0, 0, 128, 128);
        for (let x = 0; x < 128; x += 8) {
            tg.fillStyle = (x % 16 === 0) ? '#687077' : '#9ca6ad';
            tg.fillRect(x, 0, 4, 128);
            if (x % 32 === 0) {
                tg.fillStyle = '#8a4030'; // rust stain
                tg.fillRect(x, 40 + (x * 2) % 60, 4, 28);
            }
        }
        const tinTex = new THREE.CanvasTexture(tDiff);
        tinTex.wrapS = THREE.RepeatWrapping;
        tinTex.wrapT = THREE.RepeatWrapping;
        tinTex.repeat.set(4, 4);

        // 2. Mud & Bamboo Woven Wall Texture (মাটির দেয়াল ও চাটাই)
        const mDiff = document.createElement('canvas');
        mDiff.width = 128; mDiff.height = 128;
        const mg = mDiff.getContext('2d');
        mg.fillStyle = '#8c765c';
        mg.fillRect(0, 0, 128, 128);
        mg.strokeStyle = '#6e5a42';
        mg.lineWidth = 2;
        for (let y = 8; y < 128; y += 8) {
            mg.beginPath(); mg.moveTo(0, y); mg.lineTo(128, y); mg.stroke();
        }
        const mudTex = new THREE.CanvasTexture(mDiff);

        // 3. Checked Lungi Textures (মারুন, নীল, সবুজ চেক লুঙ্গি)
        const createLungiTex = (baseCol, lineCol) => {
            const lc = document.createElement('canvas');
            lc.width = 64; lc.height = 64;
            const lcg = lc.getContext('2d');
            lcg.fillStyle = baseCol;
            lcg.fillRect(0, 0, 64, 64);
            lcg.strokeStyle = lineCol;
            lcg.lineWidth = 3;
            for (let i = 0; i < 64; i += 16) {
                lcg.beginPath(); lcg.moveTo(i, 0); lcg.lineTo(i, 64); lcg.stroke();
                lcg.beginPath(); lcg.moveTo(0, i); lcg.lineTo(64, i); lcg.stroke();
            }
            return new THREE.CanvasTexture(lc);
        };
        const lungiMaroon = createLungiTex('#6b1420', '#f4f4f0');
        const lungiNavy = createLungiTex('#162d59', '#38bdf8');
        const lungiGreen = createLungiTex('#144a2b', '#facc15');

        // 4. Swept Earth Courtyard Texture (উঠান)
        const yd = document.createElement('canvas');
        yd.width = 128; yd.height = 128;
        const yg = yd.getContext('2d');
        yg.fillStyle = '#7a664e';
        yg.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 60; i++) {
            yg.fillStyle = (i % 2 === 0) ? '#69553f' : '#8c765c';
            yg.fillRect((i * 37) % 120, (i * 29) % 120, 4, 3);
        }
        const yardTex = new THREE.CanvasTexture(yd);

        // 5. Desi Zebu Cattle Coats (Grey-White, Red-Brown, Dark)
        const createZebuTex = (baseCol, patchCol) => {
            const zc = document.createElement('canvas');
            zc.width = 128; zc.height = 128;
            const zg = zc.getContext('2d');
            zg.fillStyle = baseCol;
            zg.fillRect(0, 0, 128, 128);
            if (patchCol) {
                zg.fillStyle = patchCol;
                zg.beginPath(); zg.ellipse(40, 50, 28, 22, 0.2, 0, Math.PI * 2); zg.fill();
                zg.beginPath(); zg.ellipse(85, 80, 24, 18, -0.3, 0, Math.PI * 2); zg.fill();
            }
            return new THREE.CanvasTexture(zc);
        };
        const zebuWhiteTex = createZebuTex('#e6e8eb', '#9aa2ab');
        const zebuBrownTex = createZebuTex('#8c4828', '#5a2d18');

        // Night-glow lantern material
        const lanternGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd978 });

        this.materials = {
            tinRoof: new THREE.MeshLambertMaterial({ map: tinTex }),
            mudWall: new THREE.MeshLambertMaterial({ map: mudTex }),
            sweptYard: new THREE.MeshLambertMaterial({ map: yardTex }),
            bambooPole: new THREE.MeshLambertMaterial({ color: 0xa89060 }),
            bambooFence: new THREE.MeshLambertMaterial({ color: 0x967c4e }),
            haystack: new THREE.MeshLambertMaterial({ color: 0xc9a449 }),
            paddyGreen: new THREE.MeshLambertMaterial({ color: 0x489438 }),
            paddyGolden: new THREE.MeshLambertMaterial({ color: 0xd4a034 }),
            pondWater: new THREE.MeshLambertMaterial({ color: 0x224855 }),
            skinFaceless: new THREE.MeshLambertMaterial({ color: 0xa66d49 }),
            shirtWhite: new THREE.MeshLambertMaterial({ color: 0xf0f2f5 }),
            shirtBlue: new THREE.MeshLambertMaterial({ color: 0x2563eb }),
            gamchaRed: new THREE.MeshLambertMaterial({ color: 0xc8102e }),
            bambooHat: new THREE.MeshLambertMaterial({ color: 0xbfa366 }),
            lungiMaroonMat: new THREE.MeshLambertMaterial({ map: lungiMaroon }),
            lungiNavyMat: new THREE.MeshLambertMaterial({ map: lungiNavy }),
            lungiGreenMat: new THREE.MeshLambertMaterial({ map: lungiGreen }),
            zebuWhite: new THREE.MeshLambertMaterial({ map: zebuWhiteTex }),
            zebuBrown: new THREE.MeshLambertMaterial({ map: zebuBrownTex }),
            brassKettle: new THREE.MeshLambertMaterial({ color: 0xd4a017 }),
            clayPot: new THREE.MeshLambertMaterial({ color: 0x994828 }),
            sweetTray: new THREE.MeshLambertMaterial({ color: 0xffe299 }),
            lanternGlow: lanternGlowMat
        };
        this.nightGlowMaterials.push(lanternGlowMat);
    }

    // Four Rural Bangladeshi Homesteads (Bari / বাড়ি - Section 21.2)
    _buildHomesteads() {
        const homesteadConfigs = [
            {
                name: "বটতলা বাড়ি (North-East Loop)",
                pos: new THREE.Vector3(260, 0, 480),
                rotY: -2.2,
                paddyType: 'green'
            },
            {
                name: "দক্ষিণপাড়া বাড়ি (South River Loop)",
                pos: new THREE.Vector3(240, 0, 950), // Safely inside loop, > 55m from train line
                rotY: -2.2,
                paddyType: 'golden'
            },
            {
                name: "নদীর মোড় বাড়ি (North West)",
                pos: new THREE.Vector3(280, 0, -820),
                rotY: 1.5,
                paddyType: 'green'
            },
            {
                name: "মাঝের গ্রাম বাড়ি (Meadow Loop)",
                pos: new THREE.Vector3(-240, 0, 390),
                rotY: -0.5,
                paddyType: 'golden'
            }
        ];

        for (let i = 0; i < homesteadConfigs.length; i++) {
            const hc = homesteadConfigs[i];
            const bari = new BengaliHomestead(this.scene, this.materials, hc);
            this.farmsteads.push(bari);
            bari.group.updateMatrixWorld(true);

            // Compute safe world coordinates via localToWorld (ensures > 23m track clearance)
            const f1Home = bari.group.localToWorld(new THREE.Vector3(-4, 0, 1));
            const f1Work = bari.group.localToWorld(new THREE.Vector3(16, 0, -2));
            const f2Home = bari.group.localToWorld(new THREE.Vector3(4, 0, -2));
            const f2Work = bari.group.localToWorld(new THREE.Vector3(20, 0, 2));

            const cow1Home = bari.group.localToWorld(new THREE.Vector3(-7, 0, 5.5));
            const cow1Past = bari.group.localToWorld(new THREE.Vector3(15, 0, -6));
            const cow2Home = bari.group.localToWorld(new THREE.Vector3(-5.5, 0, 5.5));
            const cow2Past = bari.group.localToWorld(new THREE.Vector3(19, 0, -6));

            // Add Working Farmers wearing Lungi, Gamcha & Bamboo Hat (Section 22)
            const f1 = new BengaliFarmer(this.scene, this.materials, {
                id: `farmer_${i}_1`,
                homePos: f1Home,
                workPos: f1Work,
                lungiMat: i % 2 === 0 ? this.materials.lungiMaroonMat : this.materials.lungiNavyMat,
                hasHat: true,
                speed: 1.15 + (i * 0.08),
                trackSystem: this.trackSystem,
                initialPreset: this.currentTimePreset
            });

            const f2 = new BengaliFarmer(this.scene, this.materials, {
                id: `farmer_${i}_2`,
                homePos: f2Home,
                workPos: f2Work,
                lungiMat: this.materials.lungiGreenMat,
                hasHat: false,
                speed: 1.25,
                trackSystem: this.trackSystem,
                initialPreset: this.currentTimePreset
            });
            this.farmers.push(f1, f2);

            // Add Desi Zebu Cattle (হাঁটু ও পিঠের কুঁজযুক্ত দেশি গরু - Section 23)
            const cow1 = new DesiZebuCow(this.scene, this.materials, {
                id: `cow_${i}_1`,
                homePos: cow1Home,
                pasturePos: cow1Past,
                isWhite: (i % 2 === 0),
                isDraftWorker: (i === 0 || i === 2), // Plough team bullock
                trackSystem: this.trackSystem,
                initialPreset: this.currentTimePreset
            });

            const cow2 = new DesiZebuCow(this.scene, this.materials, {
                id: `cow_${i}_2`,
                homePos: cow2Home,
                pasturePos: cow2Past,
                isWhite: (i % 2 !== 0),
                isDraftWorker: false,
                trackSystem: this.trackSystem,
                initialPreset: this.currentTimePreset
            });
            this.cows.push(cow1, cow2);
        }
    }

    // Four Authentic Bengali Tea Stalls beside the Track (Section 13.1 & 14)
    _buildBengaliTeaStalls() {
        const stallSpecs = [
            {
                name: "রহিম চাচার চায়ের দোকান",
                subText: "স্পেশাল দুধ-চা ও গরম সিঙ্গারা",
                u: 0.096,
                side: -1,
                offset: 11.5,
                bgColor: '#0f2f1e',
                bannerColor: '#facc15'
            },
            {
                name: "রেলগেট চা-কুঠি",
                subText: "আদা চা ও বনরুটি",
                u: 0.228,
                side: 1,
                offset: 12.0,
                bgColor: '#8c1d18',
                bannerColor: '#fef08a'
            },
            {
                name: "গ্রামের মোড় চা-ঘর",
                subText: "এলাচ-দারুচিনি মসলা চা",
                u: 0.720,
                side: -1,
                offset: 13.5,
                bgColor: '#163d59',
                bannerColor: '#facc15'
            },
            {
                name: "বটতলা চায়ের আড্ডা",
                subText: "ভাঁড়ের চা ও নোনতা বিস্কুট",
                u: 0.442,
                side: 1,
                offset: 12.5,
                bgColor: '#4a2810',
                bannerColor: '#fed7aa'
            }
        ];

        const tmpPos = new THREE.Vector3();
        const tmpYaw = { value: 0 };

        for (let i = 0; i < stallSpecs.length; i++) {
            const spec = stallSpecs[i];
            this.trackSystem.placeBesideTrack(spec.u, spec.side, spec.offset, tmpPos, tmpYaw);

            const stall = new BengaliTeaStall(this.scene, this.materials, {
                name: spec.name,
                subText: spec.subText,
                pos: tmpPos.clone(),
                rotY: tmpYaw.value,
                bgColor: spec.bgColor,
                bannerColor: spec.bannerColor
            });
            this.teaStalls.push(stall);

            // Add Stall Customers & Shopkeeper (Section 12.5)
            const c1 = new BengaliStallPerson(this.scene, this.materials, {
                stallPos: stall.root.position,
                stallRotY: stall.root.rotation.y,
                localPos: new THREE.Vector3(-0.9, 0, 0.4),
                isSitting: true,
                lungiMat: this.materials.lungiMaroonMat,
                hasGamcha: true
            });
            const c2 = new BengaliStallPerson(this.scene, this.materials, {
                stallPos: stall.root.position,
                stallRotY: stall.root.rotation.y,
                localPos: new THREE.Vector3(0.85, 0, 0.7),
                isSitting: false,
                lungiMat: this.materials.lungiNavyMat,
                hasGamcha: false
            });
            const chaiwala = new BengaliStallPerson(this.scene, this.materials, {
                stallPos: stall.root.position,
                stallRotY: stall.root.rotation.y,
                localPos: new THREE.Vector3(0.0, 0, -0.65),
                isSitting: false,
                isShopkeeper: true,
                lungiMat: this.materials.lungiGreenMat,
                hasGamcha: true
            });
            this.stallCustomers.push(c1, c2, chaiwala);
        }
    }

    // Four Bengali Sweet Shops beside the Track (মিষ্টান্ন ভাণ্ডার - Section 13.2)
    _buildBengaliSweetShops() {
        const sweetSpecs = [
            {
                name: "সোনালী মিষ্টান্ন ভাণ্ডার",
                sweets: "রসগোল্লা · সন্দেশ · চমচম",
                u: 0.058,
                side: 1,
                offset: 12.8,
                themeColor: '#b45309'
            },
            {
                name: "পদ্মা মিষ্টি ঘর",
                sweets: "মিষ্টি দই · রসমালাই · কাঁচাগোল্লা",
                u: 0.192,
                side: -1,
                offset: 12.2,
                themeColor: '#047857'
            },
            {
                name: "মধুমতী মিষ্টান্ন",
                sweets: "পান্তুয়া · জিলাপি · বালুশাহি",
                u: 0.362,
                side: 1,
                offset: 13.5,
                themeColor: '#be123c'
            },
            {
                name: "নিরালা মিষ্টির দোকান",
                sweets: "লাড্ডু · গজা · নারকেলের নাড়ু",
                u: 0.584,
                side: -1,
                offset: 12.8,
                themeColor: '#1d4ed8'
            }
        ];

        const tmpPos = new THREE.Vector3();
        const tmpYaw = { value: 0 };

        for (let i = 0; i < sweetSpecs.length; i++) {
            const spec = sweetSpecs[i];
            this.trackSystem.placeBesideTrack(spec.u, spec.side, spec.offset, tmpPos, tmpYaw);

            const shop = new BengaliSweetShop(this.scene, this.materials, {
                name: spec.name,
                sweets: spec.sweets,
                pos: tmpPos.clone(),
                rotY: tmpYaw.value,
                themeColor: spec.themeColor
            });
            this.sweetShops.push(shop);

            // Sweet shopkeeper and customer
            const sk = new BengaliStallPerson(this.scene, this.materials, {
                stallPos: shop.root.position,
                stallRotY: shop.root.rotation.y,
                localPos: new THREE.Vector3(0.0, 0, -0.6),
                isSitting: false,
                isShopkeeper: true,
                lungiMat: this.materials.lungiMaroonMat,
                hasGamcha: true
            });
            const cust = new BengaliStallPerson(this.scene, this.materials, {
                stallPos: shop.root.position,
                stallRotY: shop.root.rotation.y,
                localPos: new THREE.Vector3(0.6, 0, 0.75),
                isSitting: false,
                lungiMat: this.materials.lungiNavyMat,
                hasGamcha: false
            });
            this.stallCustomers.push(sk, cust);
        }
    }

    onTimeOfDayChange(presetKey) {
        this.currentTimePreset = presetKey;
        const isNight = (presetKey === 'night');
        for (let i = 0; i < this.farmers.length; i++) {
            this.farmers[i].setTargetMode(isNight ? 'HEADING_HOME' : 'HEADING_FARM');
        }
        for (let i = 0; i < this.cows.length; i++) {
            this.cows[i].setTargetMode(isNight ? 'HEADING_HOME' : 'HEADING_PASTURE');
        }
    }

    onRainChange(isRaining) {
        this.isRaining = isRaining;
        for (let i = 0; i < this.farmers.length; i++) {
            this.farmers[i].setRaining(isRaining);
        }
        for (let i = 0; i < this.cows.length; i++) {
            this.cows[i].setRaining(isRaining);
        }
    }

    isSettled() {
        for (let i = 0; i < this.farmers.length; i++) {
            if (this.farmers[i].isMoving()) return false;
        }
        for (let i = 0; i < this.cows.length; i++) {
            if (this.cows[i].isMoving()) return false;
        }
        return true;
    }

    update(dt) {
        for (let i = 0; i < this.farmers.length; i++) {
            this.farmers[i].update(dt);
        }
        for (let i = 0; i < this.cows.length; i++) {
            this.cows[i].update(dt);
        }
        for (let i = 0; i < this.stallCustomers.length; i++) {
            this.stallCustomers[i].update(dt);
        }
    }
}

// =========================================================================
// BENGALI HOMESTEAD (বাড়ি - Section 21.2)
// Swept courtyard, 2 tin-roofed huts, cowshed, conical haystack & pond
// =========================================================================
class BengaliHomestead {
    constructor(scene, materials, cfg) {
        this.scene = scene;
        this.materials = materials;
        this.cfg = cfg;
        this.group = new THREE.Group();
        this.group.position.copy(cfg.pos);
        this.group.rotation.y = cfg.rotY || 0;

        this._buildCourtyardAndHuts();
        this._buildCowshedAndHaystack();
        this._buildPaddyAndPond(cfg.paddyType);
        this.scene.add(this.group);
    }

    _buildCourtyardAndHuts() {
        // Swept Earth Courtyard (উঠান)
        const yard = new THREE.Mesh(new THREE.BoxGeometry(28, 0.12, 24), this.materials.sweptYard);
        yard.position.set(0, 0.06, 0);
        this.group.add(yard);

        // Main Tin-Roof Hut (মূল ঘর)
        const hut1 = this._createHut(7.2, 3.6, 5.2, 0x9ca6ad);
        hut1.position.set(-6, 0, -4);
        this.group.add(hut1);

        // Kitchen / Granary Hut (রান্নাঘর / গোলাঘর)
        const hut2 = this._createHut(5.4, 3.2, 4.2, 0x8a4030);
        hut2.position.set(6, 0, -5);
        hut2.rotation.y = Math.PI * 0.5;
        this.group.add(hut2);

        // Bamboo Fence (বাঁশের বেড়া)
        const fenceGeo = new THREE.BoxGeometry(26, 1.1, 0.08);
        const f1 = new THREE.Mesh(fenceGeo, this.materials.bambooFence);
        f1.position.set(0, 0.6, -11.5);
        this.group.add(f1);

        // Courtyard Lantern
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), this.materials.bambooPole);
        pole.position.set(2, 1.6, 2);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), this.materials.lanternGlow);
        lantern.position.set(2, 3.1, 2);
        this.group.add(pole, lantern);
    }

    _createHut(w, h, d, roofColor) {
        const g = new THREE.Group();
        // Mud / bamboo walls
        const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.materials.mudWall);
        walls.position.y = h * 0.5;
        g.add(walls);

        // Gable corrugated tin roof (Section 21.1)
        const roofRoofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.72, 1.8, 4);
        roofRoofGeo.rotateY(Math.PI / 4);
        roofRoofGeo.scale(w / Math.max(w, d), 1.0, d / Math.max(w, d));
        const roofMat = new THREE.MeshLambertMaterial({
            color: roofColor,
            map: this.materials.tinRoof.map
        });
        const roof = new THREE.Mesh(roofRoofGeo, roofMat);
        roof.position.set(0, h + 0.85, 0);
        g.add(roof);

        // Veranda with bamboo posts
        const verFloor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 1.6), this.materials.sweptYard);
        verFloor.position.set(0, 0.08, d * 0.5 + 0.8);
        g.add(verFloor);

        [-w * 0.45, w * 0.45].forEach(px => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), this.materials.bambooPole);
            post.position.set(px, h * 0.5, d * 0.5 + 1.5);
            g.add(post);
        });
        return g;
    }

    _buildCowshedAndHaystack() {
        // Cowshed (গোয়ালঘর)
        const shed = new THREE.Group();
        shed.position.set(-7, 0, 6);
        const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.1, 4.6), this.materials.tinRoof);
        shedRoof.position.set(0, 2.4, 0);
        shedRoof.rotation.x = 0.12;
        shed.add(shedRoof);

        [[-2.8, -1.8], [2.8, -1.8], [-2.8, 1.8], [2.8, 1.8]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.3, 6), this.materials.bambooPole);
            post.position.set(px, 1.15, pz);
            shed.add(post);
        });
        this.group.add(shed);

        // Conical Haystack (খড়ের পালা - Section 21.2)
        const hayGeo = new THREE.ConeGeometry(2.2, 4.2, 10);
        const hay = new THREE.Mesh(hayGeo, this.materials.haystack);
        hay.position.set(8, 2.1, 5);
        this.group.add(hay);
    }

    _buildPaddyAndPond(paddyType) {
        // Paddy Field (ধানক্ষেত - Section 21.3)
        const pMat = paddyType === 'golden' ? this.materials.paddyGolden : this.materials.paddyGreen;
        const field = new THREE.Mesh(new THREE.BoxGeometry(22, 0.1, 18), pMat);
        field.position.set(18, 0.05, -2);
        this.group.add(field);

        // Raised field bunds (আইল)
        const bundGeo = new THREE.BoxGeometry(22.4, 0.22, 0.4);
        const b1 = new THREE.Mesh(bundGeo, this.materials.sweptYard);
        b1.position.set(18, 0.11, -11);
        const b2 = new THREE.Mesh(bundGeo, this.materials.sweptYard);
        b2.position.set(18, 0.11, 7);
        this.group.add(b1, b2);

        // Small Homestead Pond (পুকুর)
        const pond = new THREE.Mesh(new THREE.CircleGeometry(6.5, 18), this.materials.pondWater);
        pond.rotation.x = -Math.PI * 0.5;
        pond.position.set(-14, 0.02, -5);
        this.group.add(pond);

        // Bathing Ghat (পুকুরের ঘাট)
        const ghat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 3.2), this.materials.bambooPole);
        ghat.position.set(-14, 0.06, -1);
        this.group.add(ghat);
    }
}

// =========================================================================
// BENGALI TEA STALL (চায়ের দোকান - Section 13.1)
// Emissive glowing bulb, NO PointLights (U5 / B20), hanging bananas & clay pots
// =========================================================================
class BengaliTeaStall {
    constructor(scene, materials, cfg) {
        this.scene = scene;
        this.materials = materials;
        this.cfg = cfg;

        this.root = new THREE.Group();
        this.root.position.copy(cfg.pos);
        this.root.rotation.y = cfg.rotY;

        this._buildStallStructure();
        this._buildGlowingBulbSprite();
        this._buildTeaCounter();
        this._buildSignboard();

        this.scene.add(this.root);
    }

    _buildStallStructure() {
        const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 2.7, 6);
        [[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(postGeo, this.materials.bambooPole);
            post.position.set(px, 1.35, pz);
            this.root.add(post);
        });

        // Sloped Tin Roof
        const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.10, 3.2), this.materials.tinRoof);
        roof.position.set(0, 2.75, 0.1);
        roof.rotation.x = 0.08;
        this.root.add(roof);

        // Bamboo mat side walls (চাটাই)
        const matWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 2.6), this.materials.mudWall);
        matWall.position.set(-1.8, 1.2, 0);
        this.root.add(matWall);

        // Seating wooden bench
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 2.0), this.materials.bambooPole);
        bench.position.set(-1.2, 0.48, 0.3);
        this.root.add(bench);
    }

    _buildGlowingBulbSprite() {
        // Cord & socket
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        cord.position.set(0, 2.38, 0.0);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe680 }));
        bulb.position.set(0, 1.95, 0.0);
        this.root.add(cord, bulb);

        // Additive soft glow sprite (zero PointLight shader cost! U5 & B20)
        const gCanvas = document.createElement('canvas');
        gCanvas.width = 64; gCanvas.height = 64;
        const gg = gCanvas.getContext('2d');
        const grad = gg.createRadialGradient(32, 32, 2, 32, 32, 30);
        grad.addColorStop(0, 'rgba(255, 210, 100, 0.85)');
        grad.addColorStop(0.4, 'rgba(255, 170, 50, 0.35)');
        grad.addColorStop(1, 'rgba(255, 140, 20, 0.0)');
        gg.fillStyle = grad;
        gg.fillRect(0, 0, 64, 64);
        const glowTex = new THREE.CanvasTexture(gCanvas);

        const glowMat = new THREE.SpriteMaterial({
            map: glowTex,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true
        });
        const glowSprite = new THREE.Sprite(glowMat);
        glowSprite.scale.set(3.8, 3.8, 1.0);
        glowSprite.position.set(0, 1.95, 0);
        this.root.add(glowSprite);
    }

    _buildTeaCounter() {
        const counter = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.95, 0.75), this.materials.mudWall);
        counter.position.set(0, 0.48, 0.1);
        this.root.add(counter);

        // Brass tea kettle (কেটলি)
        const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.30, 8), this.materials.brassKettle);
        kettle.position.set(0.65, 1.12, 0.1);
        this.root.add(kettle);

        // Stacked clay tea cups (ভাঁড় / মাটির কাপ)
        for (let i = 0; i < 3; i++) {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.12, 6), this.materials.clayPot);
            cup.position.set(-0.65 + i * 0.18, 1.02, 0.1);
            this.root.add(cup);
        }
    }

    _buildSignboard() {
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 512; sCanvas.height = 128;
        const sg = sCanvas.getContext('2d');
        sg.fillStyle = this.cfg.bgColor || '#0f2f1e';
        sg.fillRect(0, 0, 512, 128);
        sg.strokeStyle = this.cfg.bannerColor || '#facc15';
        sg.lineWidth = 6;
        sg.strokeRect(4, 4, 504, 120);

        sg.fillStyle = '#f8fafc';
        sg.font = "bold 32px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        sg.textAlign = 'center';
        sg.textBaseline = 'middle';
        sg.fillText(this.cfg.name, 256, 45);

        sg.font = "bold 20px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        sg.fillStyle = this.cfg.bannerColor || '#facc15';
        sg.fillText(this.cfg.subText, 256, 92);

        const signMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sCanvas) });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.85, 0.08), signMat);
        sign.position.set(0, 2.95, 1.45);
        this.root.add(sign);
    }
}

// =========================================================================
// BENGALI SWEET SHOP (মিষ্টান্ন ভাণ্ডার - Section 13.2)
// Display counter with glowing sweet trays, clay curd pots & Bengali sign
// =========================================================================
class BengaliSweetShop {
    constructor(scene, materials, cfg) {
        this.scene = scene;
        this.materials = materials;
        this.cfg = cfg;

        this.root = new THREE.Group();
        this.root.position.copy(cfg.pos);
        this.root.rotation.y = cfg.rotY;

        this._buildStructure();
        this._buildSweetCounter();
        this._buildSignboard();

        this.scene.add(this.root);
    }

    _buildStructure() {
        // Pillars & Tin Roof
        const postGeo = new THREE.CylinderGeometry(0.09, 0.10, 2.8, 6);
        [[-2.0, -1.4], [2.0, -1.4], [-2.0, 1.4], [2.0, 1.4]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(postGeo, this.materials.bambooPole);
            post.position.set(px, 1.4, pz);
            this.root.add(post);
        });

        const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 3.4), this.materials.tinRoof);
        roof.position.set(0, 2.85, 0.1);
        roof.rotation.x = 0.06;
        this.root.add(roof);

        // Rear and side enclosures
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.2, 0.1), this.materials.mudWall);
        wall.position.set(0, 1.1, -1.35);
        this.root.add(wall);
    }

    _buildSweetCounter() {
        // Glass display showcase
        const counterBase = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 0.9), this.materials.mudWall);
        counterBase.position.set(0, 0.35, 0.2);
        this.root.add(counterBase);

        const glassCase = new THREE.Mesh(
            new THREE.BoxGeometry(3.0, 0.55, 0.8),
            new THREE.MeshBasicMaterial({ color: 0xbee3f8, transparent: true, opacity: 0.25 })
        );
        glassCase.position.set(0, 0.95, 0.2);
        this.root.add(glassCase);

        // Trays of traditional Bengali sweets (রসগোল্লা, চমচম, জিলাপি)
        const trayGeo = new THREE.BoxGeometry(0.75, 0.06, 0.32);
        [-0.85, 0.0, 0.85].forEach(tx => {
            const tray = new THREE.Mesh(trayGeo, this.materials.sweetTray);
            tray.position.set(tx, 0.82, 0.2);
            this.root.add(tray);
        });

        // Stacked traditional clay curd pots (দইয়ের হাঁড়ি)
        [[-1.1, 0.5], [-1.1, 0.8], [1.1, 0.5]].forEach(([cx, cz]) => {
            const pot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this.materials.clayPot);
            pot.position.set(cx, 0.92, cz);
            this.root.add(pot);
        });
    }

    _buildSignboard() {
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 512; sCanvas.height = 128;
        const sg = sCanvas.getContext('2d');
        sg.fillStyle = this.cfg.themeColor || '#b45309';
        sg.fillRect(0, 0, 512, 128);
        sg.strokeStyle = '#fef08a';
        sg.lineWidth = 6;
        sg.strokeRect(4, 4, 504, 120);

        sg.fillStyle = '#ffffff';
        sg.font = "bold 32px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        sg.textAlign = 'center';
        sg.textBaseline = 'middle';
        sg.fillText(this.cfg.name, 256, 44);

        sg.font = "bold 21px 'BnSign', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
        sg.fillStyle = '#fef08a';
        sg.fillText(this.cfg.sweets, 256, 92);

        const signMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sCanvas) });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.88, 0.08), signMat);
        sign.position.set(0, 3.02, 1.55);
        this.root.add(sign);
    }
}

// =========================================================================
// BENGALI FARMER (কৃষক - Section 22)
// Wears Lungi, Gamcha, Bamboo Hat (জাপি/টোকা), Bare feet.
// B18 Fix: Torso and head tilt correctly reset in rain umbrella state!
// =========================================================================
class BengaliFarmer {
    constructor(scene, materials, opts) {
        this.scene = scene;
        this.materials = materials;
        this.opts = opts;
        this.trackSystem = opts.trackSystem;

        this.homePos = opts.homePos.clone();
        this.workPos = opts.workPos.clone();

        const isNight = (opts.initialPreset === 'night');
        this.state = isNight ? 'AT_HOME' : 'FARMING';
        this.currentPos = isNight ? opts.homePos.clone() : opts.workPos.clone();
        this.targetPos = isNight ? opts.homePos.clone() : opts.workPos.clone();

        this.isRaining = false;
        this.speed = opts.speed || 1.2;
        this.walkPhase = Math.random() * Math.PI * 2;
        this.idleTimer = Math.random() * 5.0;

        this._dir = new THREE.Vector3();

        this._buildMesh(opts);
        if (isNight && this.toolGroup) this.toolGroup.visible = false;
        this.scene.add(this.root);
    }

    _buildMesh(opts) {
        this.root = new THREE.Group();
        this.root.position.copy(this.currentPos);

        // Bare feet (skin colored foot block - Section 22.1)
        const legGeo = new THREE.BoxGeometry(0.16, 0.62, 0.16);
        this.leftLeg = new THREE.Mesh(legGeo, this.materials.skinFaceless);
        this.leftLeg.position.set(-0.14, 0.31, 0);
        this.rightLeg = new THREE.Mesh(legGeo, this.materials.skinFaceless);
        this.rightLeg.position.set(0.14, 0.31, 0);
        this.root.add(this.leftLeg, this.rightLeg);

        // Lungi cylinder / block parented to hips (Section 22.1)
        const lungiMat = opts.lungiMat || this.materials.lungiMaroonMat;
        this.lungiMesh = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.58, 0.34), lungiMat);
        this.lungiMesh.position.set(0, 0.62, 0);
        this.root.add(this.lungiMesh);

        // Torso: singlet/vest or bare torso
        this.torsoMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.48, 0.56, 0.28),
            opts.hasShirt ? this.materials.shirtWhite : this.materials.skinFaceless
        );
        this.torsoMesh.position.set(0, 1.14, 0);
        this.root.add(this.torsoMesh);

        // Head (plain block, no facial features)
        this.headGroup = new THREE.Group();
        this.headGroup.position.set(0, 1.62, 0);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), this.materials.skinFaceless);
        this.headGroup.add(head);

        // Bamboo Hat (জাপি / টোকা - Section 22.1)
        if (opts.hasHat) {
            const hat = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.18, 8), this.materials.bambooHat);
            hat.position.set(0, 0.22, 0);
            this.headGroup.add(hat);
        } else {
            // Gamcha head wrap (গামছা বাঁধা)
            const gamchaWrap = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 8), this.materials.gamchaRed);
            gamchaWrap.rotation.x = Math.PI * 0.5;
            gamchaWrap.position.set(0, 0.12, 0);
            this.headGroup.add(gamchaWrap);
        }
        this.root.add(this.headGroup);

        // Arms & Farming Hoe (কোদাল)
        const armGeo = new THREE.BoxGeometry(0.13, 0.58, 0.13);
        this.leftArm = new THREE.Mesh(armGeo, this.materials.skinFaceless);
        this.leftArm.position.set(-0.31, 1.10, 0);
        this.rightArm = new THREE.Mesh(armGeo, this.materials.skinFaceless);
        this.rightArm.position.set(0.31, 1.10, 0);
        this.root.add(this.leftArm, this.rightArm);

        // Hoe Tool (কোদাল)
        this.toolGroup = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), this.materials.bambooPole);
        handle.position.set(0, -0.3, 0.25);
        handle.rotation.x = Math.PI * 0.32;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.03), new THREE.MeshLambertMaterial({ color: 0x444444 }));
        blade.position.set(0, -0.8, 0.62);
        this.toolGroup.add(handle, blade);
        this.rightArm.add(this.toolGroup);

        // Umbrella (ছাতা)
        this.umbrellaGroup = new THREE.Group();
        const upole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 6), this.materials.bambooPole);
        const ucanopy = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.35, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0x1b2838, side: THREE.DoubleSide }));
        ucanopy.position.set(0, 0.95, 0);
        this.umbrellaGroup.add(upole, ucanopy);
        this.umbrellaGroup.position.set(0, -0.4, 0.2);
        this.umbrellaGroup.visible = false;
        this.rightArm.add(this.umbrellaGroup);
    }

    setTargetMode(mode) {
        if (mode === 'HEADING_HOME') {
            this.targetPos.copy(this.homePos);
            this.state = 'HEADING_HOME';
            if (this.toolGroup) this.toolGroup.visible = false;
        } else if (mode === 'HEADING_FARM') {
            this.targetPos.copy(this.workPos);
            this.state = 'HEADING_FARM';
            if (this.toolGroup) this.toolGroup.visible = true;
        }
    }

    setRaining(isRaining) {
        this.isRaining = isRaining;
        this.umbrellaGroup.visible = isRaining;
        if (this.toolGroup) this.toolGroup.visible = !isRaining && (this.state === 'FARMING');
    }

    isMoving() {
        if (this.isRaining) return false;
        return (this.state === 'HEADING_HOME' || this.state === 'HEADING_FARM');
    }

    update(dt) {
        // Strict Track Envelope Safety Guard: Never allow farmer closer than 6.0m to any rail
        if (this.trackSystem) {
            const trackDist = this.trackSystem.getMinDistanceToTrack(this.currentPos.x, this.currentPos.z, 8);
            if (trackDist < 6.0) {
                this.currentPos.lerp(this.homePos, 0.25);
                this.root.position.copy(this.currentPos);
            }
        }

        // B18 FIX: Properly reset torso & head rotation so farmer does not freeze bent over!
        if (this.isRaining) {
            this.torsoMesh.rotation.x = 0;
            this.torsoMesh.rotation.z = 0;
            this.headGroup.rotation.x = 0;
            this.headGroup.rotation.y = 0;
            this.rightArm.rotation.x = -Math.PI * 0.72;
            this.rightArm.rotation.z = -0.15;
            this.leftArm.rotation.x = 0;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
            return;
        }

        if (this.state === 'HEADING_HOME' || this.state === 'HEADING_FARM') {
            this._dir.subVectors(this.targetPos, this.currentPos);
            this._dir.y = 0;
            const dist = this._dir.length();

            if (dist > 0.4) {
                this._dir.normalize();
                this.currentPos.addScaledVector(this._dir, Math.min(dist, this.speed * dt));
                this.root.position.copy(this.currentPos);

                this.root.rotation.y = Math.atan2(this._dir.x, this._dir.z);

                this.walkPhase += dt * 6.2;
                const swing = Math.sin(this.walkPhase) * 0.52;
                this.leftLeg.rotation.x = swing;
                this.rightLeg.rotation.x = -swing;
                this.leftArm.rotation.x = -swing * 0.7;
                this.rightArm.rotation.x = swing * 0.7;
                this.torsoMesh.rotation.x = 0;
                this.headGroup.rotation.x = 0;
            } else {
                if (this.state === 'HEADING_HOME') {
                    this.state = 'AT_HOME';
                    if (this.toolGroup) this.toolGroup.visible = false;
                } else {
                    this.state = 'FARMING';
                    if (this.toolGroup) this.toolGroup.visible = true;
                }
            }
            return;
        }

        if (this.state === 'AT_HOME') {
            // Resting at home / courtyard in evening and night
            this.idleTimer += dt * 1.5;
            const breath = Math.sin(this.idleTimer) * 0.04;
            this.torsoMesh.rotation.x = breath;
            this.headGroup.rotation.x = breath * 0.5;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
            this.leftArm.rotation.x = 0;
            this.rightArm.rotation.x = 0;
            if (this.toolGroup) this.toolGroup.visible = false;
            return;
        }

        if (this.state === 'FARMING') {
            this.idleTimer += dt * 2.8;
            const hoeSwing = Math.sin(this.idleTimer) * 0.45;
            this.torsoMesh.rotation.x = 0.22 + hoeSwing * 0.15;
            this.headGroup.rotation.x = 0.20 + hoeSwing * 0.12;
            this.rightArm.rotation.x = -0.5 + hoeSwing * 0.8;
            this.leftArm.rotation.x = -0.3 + hoeSwing * 0.4;
        }
    }
}

// =========================================================================
// DESI ZEBU CATTLE & PLOUGH TEAM (দেশি গরু ও লাঙল - Section 23)
// Withers hump, dewlap, upward curved horns.
// B19 Fix: currentPos synchronized, eased yaw turning at furrow ends!
// =========================================================================
class DesiZebuCow {
    constructor(scene, materials, opts) {
        this.scene = scene;
        this.materials = materials;
        this.opts = opts;
        this.trackSystem = opts.trackSystem;

        this.homePos = opts.homePos.clone();
        this.pasturePos = opts.pasturePos.clone();

        const isNight = (opts.initialPreset === 'night');
        this.state = isNight ? 'AT_HOME' : 'GRAZING';
        this.currentPos = isNight ? opts.homePos.clone() : opts.pasturePos.clone();
        this.targetPos = isNight ? opts.homePos.clone() : opts.pasturePos.clone();

        this.isRaining = false;
        this.isDraftWorker = opts.isDraftWorker || false;
        this.speed = 0.85;
        this.walkPhase = Math.random() * Math.PI * 2;
        this.grazeTimer = Math.random() * 5.0;
        this.targetYaw = 0;

        this._dir = new THREE.Vector3();

        this._buildMesh(opts);
        this.scene.add(this.root);
    }

    _buildMesh(opts) {
        this.root = new THREE.Group();
        this.root.position.copy(this.currentPos);

        const coatMat = opts.isWhite ? this.materials.zebuWhite : this.materials.zebuBrown;

        // Slender body frame (Section 23.1)
        this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 1.55), coatMat);
        this.bodyMesh.position.y = 1.05;
        this.root.add(this.bodyMesh);

        // Prominent Withers Hump (দেশি গরুর কুঁজ - Section 23.1)
        const hump = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.42), coatMat);
        hump.position.set(0, 1.52, 0.45);
        this.root.add(hump);

        // Thin Legs
        const legGeo = new THREE.BoxGeometry(0.14, 0.75, 0.14);
        this.legFL = new THREE.Mesh(legGeo, coatMat);
        this.legFL.position.set(-0.25, 0.38, 0.52);
        this.legFR = new THREE.Mesh(legGeo, coatMat);
        this.legFR.position.set(0.25, 0.38, 0.52);
        this.legBL = new THREE.Mesh(legGeo, coatMat);
        this.legBL.position.set(-0.25, 0.38, -0.52);
        this.legBR = new THREE.Mesh(legGeo, coatMat);
        this.legBR.position.set(0.25, 0.38, -0.52);
        this.root.add(this.legFL, this.legFR, this.legBL, this.legBR);

        // Neck & Head with Dewlap Flap (গলকম্বল)
        this.headNeck = new THREE.Group();
        this.headNeck.position.set(0, 1.25, 0.8);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.48), coatMat);
        head.position.set(0, 0.05, 0.22);
        this.headNeck.add(head);

        // Dewlap flap (গলকম্বল) under neck
        const dewlap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.30, 0.36), coatMat);
        dewlap.position.set(0, -0.22, 0.1);
        this.headNeck.add(dewlap);

        // Upward-curved Horns (দেশি গরুর শিং)
        const hornGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.32, 6);
        [-0.16, 0.16].forEach(hx => {
            const horn = new THREE.Mesh(hornGeo, new THREE.MeshLambertMaterial({ color: 0x222222 }));
            horn.position.set(hx, 0.32, 0.18);
            horn.rotation.z = (hx < 0 ? -0.35 : 0.35);
            horn.rotation.x = -0.25;
            this.headNeck.add(horn);
        });
        this.root.add(this.headNeck);

        // Tail
        this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 4), coatMat);
        this.tail.position.set(0, 0.95, -0.82);
        this.tail.rotation.x = 0.25;
        this.root.add(this.tail);

        // Wooden Plough Yoke for Draft Bullock (জোয়াল ও লাঙল - Section 23.2)
        if (this.isDraftWorker) {
            const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.10, 0.10), this.materials.bambooPole);
            yoke.position.set(0, 1.35, 0.45);
            this.root.add(yoke);
        }
    }

    setTargetMode(mode) {
        if (mode === 'HEADING_HOME') {
            this.targetPos.copy(this.homePos);
            this.state = 'HEADING_HOME';
        } else if (mode === 'HEADING_PASTURE') {
            this.targetPos.copy(this.pasturePos);
            this.state = 'HEADING_PASTURE';
        }
    }

    setRaining(isRaining) {
        this.isRaining = isRaining;
    }

    isMoving() {
        if (this.isRaining) return false;
        return (this.state === 'HEADING_HOME' || this.state === 'HEADING_PASTURE');
    }

    update(dt) {
        // Strict Track Envelope Safety Guard: Never allow cattle closer than 6.0m to any rail
        if (this.trackSystem) {
            const trackDist = this.trackSystem.getMinDistanceToTrack(this.currentPos.x, this.currentPos.z, 8);
            if (trackDist < 6.0) {
                this.currentPos.lerp(this.homePos, 0.25);
                this.root.position.copy(this.currentPos);
            }
        }

        if (this.isRaining) {
            this.legFL.rotation.x = 0;
            this.legFR.rotation.x = 0;
            this.legBL.rotation.x = 0;
            this.legBR.rotation.x = 0;
            return;
        }

        if (this.state === 'HEADING_HOME' || this.state === 'HEADING_PASTURE') {
            this._dir.subVectors(this.targetPos, this.currentPos);
            this._dir.y = 0;
            const dist = this._dir.length();

            if (dist > 0.45) {
                this._dir.normalize();
                this.currentPos.addScaledVector(this._dir, Math.min(dist, this.speed * dt));
                this.root.position.copy(this.currentPos);

                this.root.rotation.y = Math.atan2(this._dir.x, this._dir.z);

                this.walkPhase += dt * 5.0;
                const swing = Math.sin(this.walkPhase) * 0.4;
                this.legFL.rotation.x = swing;
                this.legFR.rotation.x = -swing;
                this.legBL.rotation.x = -swing;
                this.legBR.rotation.x = swing;
            } else {
                this.state = (this.state === 'HEADING_HOME') ? 'AT_HOME' : 'GRAZING';
            }
            return;
        }

        if (this.state === 'AT_HOME') {
            // Resting inside/beside the cowshed (গোয়ালঘর)
            this.grazeTimer += dt;
            this.legFL.rotation.x = 0;
            this.legFR.rotation.x = 0;
            this.legBL.rotation.x = 0;
            this.legBR.rotation.x = 0;
            this.tail.rotation.z = Math.sin(this.grazeTimer * 1.8) * 0.22;
            this.headNeck.rotation.x = 0.08 + Math.sin(this.grazeTimer * 0.7) * 0.05;
            this.root.position.copy(this.homePos);
            this.currentPos.copy(this.homePos);
            return;
        }

        if (this.state === 'GRAZING') {
            this.grazeTimer += dt;
            if (this.isDraftWorker) {
                // B19 FIX: Update currentPos smoothly, ease yaw at end of furrow!
                const furrowPace = Math.sin(this.grazeTimer * 0.5);
                const stepSwing = furrowPace * 0.28;
                this.legFL.rotation.x = stepSwing;
                this.legFR.rotation.x = -stepSwing;
                this.legBL.rotation.x = -stepSwing;
                this.legBR.rotation.x = stepSwing;

                this.root.position.x = this.pasturePos.x + furrowPace * 2.8;
                this.root.position.z = this.pasturePos.z + Math.cos(this.grazeTimer * 0.25) * 0.6;
                // Keep currentPos strictly synchronized! (B19)
                this.currentPos.copy(this.root.position);

                // Smoothly ease yaw instead of snapping 180 degrees in 1 frame (B19)
                this.targetYaw = (furrowPace >= 0) ? 0 : Math.PI;
                let dyaw = this.targetYaw - this.root.rotation.y;
                while (dyaw < -Math.PI) dyaw += Math.PI * 2;
                while (dyaw > Math.PI) dyaw -= Math.PI * 2;
                this.root.rotation.y += dyaw * Math.min(1.0, dt * 4.0);
            } else {
                // Head lowered grazing
                this.headNeck.rotation.x = 0.35 + Math.sin(this.grazeTimer * 0.6) * 0.08;
            }
        }
    }
}

// =========================================================================
// BENGALI STALL / SWEET SHOP PERSON (Section 12.5 & 22)
// Shopkeeper or tea-drinking customer wearing lungi and gamcha
// =========================================================================
class BengaliStallPerson {
    constructor(scene, materials, opts) {
        this.scene = scene;
        this.materials = materials;
        this.opts = opts;

        this.root = new THREE.Group();
        this.root.position.copy(opts.stallPos);
        this.root.rotation.y = opts.stallRotY;

        this.sipTimer = Math.random() * 4.0;

        this._buildMesh(opts);
        this.scene.add(this.root);
    }

    _buildMesh(opts) {
        const pGroup = new THREE.Group();
        pGroup.position.copy(opts.localPos);

        const lungiMat = opts.lungiMat || this.materials.lungiMaroonMat;
        const skinMat = this.materials.skinFaceless;

        if (opts.isSitting) {
            // Seated pose on bench
            const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.42), lungiMat);
            thigh.position.set(0, 0.44, 0.15);
            const shin = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.16), skinMat);
            shin.position.set(0, 0.22, 0.34);
            pGroup.add(thigh, shin);
        } else {
            // Standing pose
            const lungi = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.68, 0.32), lungiMat);
            lungi.position.set(0, 0.44, 0);
            pGroup.add(lungi);
        }

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.26), this.materials.shirtWhite);
        torso.position.set(0, 0.98, 0);
        pGroup.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
        head.position.set(0, 1.42, 0);
        pGroup.add(head);

        // Gamcha draped over shoulder (Section 22.1)
        if (opts.hasGamcha) {
            const gamcha = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.30), this.materials.gamchaRed);
            gamcha.position.set(-0.18, 1.05, 0);
            pGroup.add(gamcha);
        }

        // Tea cup or sweet box in hand
        this.rArm = new THREE.Group();
        this.rArm.position.set(0.26, 1.05, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.48, 0.11), skinMat);
        arm.position.y = -0.22;
        this.rArm.add(arm);

        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.08, 6), this.materials.clayPot);
        cup.position.set(0, -0.44, 0.08);
        this.rArm.add(cup);
        pGroup.add(this.rArm);

        this.root.add(pGroup);
    }

    update(dt) {
        this.sipTimer += dt;
        // Sip tea periodically
        const sipCycle = Math.sin(this.sipTimer * 1.2);
        if (sipCycle > 0.8) {
            this.rArm.rotation.x = -Math.PI * 0.6;
        } else {
            this.rArm.rotation.x = -Math.PI * 0.15;
        }
    }
}
