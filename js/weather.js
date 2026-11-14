// weather.js - Zero-Shadow-Map Atmospheric Preset Manager (Day, Golden Sunset, Moonlit Starry Night & Monsoon Rain)
// Features: Smooth 2.5s Color & Fog Transitions (B21), Dynamic Starry Night Sky Dome, Monsoonal Downpour

class WeatherManager {
    constructor(scene, renderer, envManager, villageManager) {
        this.scene = scene;
        this.renderer = renderer;
        this.envManager = envManager;
        this.villageManager = villageManager;

        this.presetOrder = ['day', 'sunset', 'night'];
        this.presetIdx = 0;
        this.isRaining = false;
        this.currentPresetKey = 'day';

        this.dirLight = null;
        this.hemiLight = null;
        this.ambientLight = null;
        this.moonMesh = null;
        this.starPoints = null;
        this.starMat = null;

        // Smooth time-of-day transition state (B21)
        this.isTransitioning = false;
        this.transProgress = 1.0;
        this.transDuration = 2.5;
        this.srcSky = new THREE.Color();
        this.targetSky = new THREE.Color();
        this.srcFog = new THREE.Color();
        this.targetFog = new THREE.Color();
        this.srcSun = new THREE.Color();
        this.targetSun = new THREE.Color();
        this.srcHemiSky = new THREE.Color();
        this.targetHemiSky = new THREE.Color();
        this.srcHemiGnd = new THREE.Color();
        this.targetHemiGnd = new THREE.Color();
        this.srcAmb = new THREE.Color();
        this.targetAmb = new THREE.Color();

        this.srcSunInt = 1.25;
        this.targetSunInt = 1.25;
        this.srcHemiInt = 0.72;
        this.targetHemiInt = 0.72;
        this.srcAmbInt = 0.28;
        this.targetAmbInt = 0.28;
        this.srcFogDens = 0.00042;
        this.targetFogDens = 0.00042;
        this.srcStarOp = 0.0;
        this.targetStarOp = 0.0;
        this.srcSunPos = [140, 240, 160];
        this.targetSunPos = [140, 240, 160];
        this.targetWindowGlow = 0.08;

        // Monsoonal Rain Particle System
        this.rainParticles = null;
        this.rainCount = 1800;
        this.rainGeo = null;

        this._initLightingAndSky();
        this._initRainParticles();
        this.applyPreset('day', true); // initial immediate setup
    }

    _initLightingAndSky() {
        const p = GAME_CONFIG.colors.presets.day;

        this.dirLight = new THREE.DirectionalLight(p.sunColor, p.sunIntensity);
        this.dirLight.castShadow = false;
        this.scene.add(this.dirLight);

        this.hemiLight = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiIntensity);
        this.scene.add(this.hemiLight);

        this.ambientLight = new THREE.AmbientLight(p.ambientColor, p.ambientIntensity);
        this.scene.add(this.ambientLight);

        this.scene.background = new THREE.Color(p.skyHorizon);
        this.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);

        // Glowing Full Moon
        const moonGeo = new THREE.SphereGeometry(28, 16, 16);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xfefcd6, fog: false });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.moonMesh.position.set(-450, 380, -650);
        this.moonMesh.visible = false;
        this.scene.add(this.moonMesh);

        // Starry Night Sky (600 stars in 1 Points call)
        const starCount = 600;
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(0.15 + Math.random() * 0.85);
            const r = 1600;
            starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            starPos[i * 3 + 1] = r * Math.cos(phi);
            starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        this.starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 3.5,
            transparent: true,
            opacity: 0.0,
            fog: false
        });
        this.starPoints = new THREE.Points(starGeo, this.starMat);
        this.starPoints.visible = false;
        this.scene.add(this.starPoints);
    }

    _initRainParticles() {
        const positions = new Float32Array(this.rainCount * 3);
        const velocities = new Float32Array(this.rainCount);

        for (let i = 0; i < this.rainCount; i++) {
            positions[i * 3]     = (Math.random() - 0.5) * 190;
            positions[i * 3 + 1] = Math.random() * 70;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 190;
            velocities[i] = 44 + Math.random() * 20;
        }

        this.rainGeo = new THREE.BufferGeometry();
        this.rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainGeo.userData = { velocities: velocities };

        const rainMat = new THREE.PointsMaterial({
            color: 0xaed4f7,
            size: 0.45,
            transparent: true,
            opacity: 0.65
        });

        this.rainParticles = new THREE.Points(this.rainGeo, rainMat);
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    }

    cycleTimeOfDay() {
        this.presetIdx = (this.presetIdx + 1) % this.presetOrder.length;
        const key = this.presetOrder[this.presetIdx];
        return this.applyPreset(key, false);
    }

    // Smooth time-of-day preset transition (B21)
    applyPreset(key, immediate = false) {
        const p = GAME_CONFIG.colors.presets[key] || GAME_CONFIG.colors.presets.day;
        this.currentPresetKey = key;

        if (immediate) {
            this.scene.background.setHex(p.skyHorizon);
            this.scene.fog.color.setHex(p.fogColor);
            this.scene.fog.density = this.isRaining ? 0.00105 : p.fogDensity;

            this.dirLight.color.setHex(p.sunColor);
            this.dirLight.intensity = this.isRaining ? p.sunIntensity * 0.55 : p.sunIntensity;
            this.dirLight.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);

            this.hemiLight.color.setHex(p.hemiSky);
            this.hemiLight.groundColor.setHex(p.hemiGround);
            this.hemiLight.intensity = p.hemiIntensity;

            this.ambientLight.color.setHex(p.ambientColor);
            this.ambientLight.intensity = p.ambientIntensity;

            this.moonMesh.visible = p.moonVisible && !this.isRaining;
            this.starPoints.visible = p.starOpacity > 0.05 && !this.isRaining;
            this.starMat.opacity = p.starOpacity;

            if (this.envManager) this.envManager.setNightFactor(p.windowGlow, key !== 'day');
            if (this.villageManager) this.villageManager.onTimeOfDayChange(key);
            this.isTransitioning = false;
            return p;
        }

        // Start smooth 2.5s transition
        this.srcSky.copy(this.scene.background);
        this.targetSky.setHex(p.skyHorizon);
        this.srcFog.copy(this.scene.fog.color);
        this.targetFog.setHex(p.fogColor);

        this.srcSun.copy(this.dirLight.color);
        this.targetSun.setHex(p.sunColor);
        this.srcSunInt = this.dirLight.intensity;
        this.targetSunInt = this.isRaining ? p.sunIntensity * 0.55 : p.sunIntensity;

        this.srcHemiSky.copy(this.hemiLight.color);
        this.targetHemiSky.setHex(p.hemiSky);
        this.srcHemiGnd.copy(this.hemiLight.groundColor);
        this.targetHemiGnd.setHex(p.hemiGround);
        this.srcHemiInt = this.hemiLight.intensity;
        this.targetHemiInt = p.hemiIntensity;

        this.srcAmb.copy(this.ambientLight.color);
        this.targetAmb.setHex(p.ambientColor);
        this.srcAmbInt = this.ambientLight.intensity;
        this.targetAmbInt = p.ambientIntensity;

        this.srcFogDens = this.scene.fog.density;
        this.targetFogDens = this.isRaining ? 0.00105 : p.fogDensity;

        this.srcStarOp = this.starMat.opacity;
        this.targetStarOp = (this.isRaining || !p.moonVisible) ? 0.0 : p.starOpacity;

        this.srcSunPos = [this.dirLight.position.x, this.dirLight.position.y, this.dirLight.position.z];
        this.targetSunPos = p.sunPos;
        this.targetWindowGlow = p.windowGlow;

        this.moonMesh.visible = p.moonVisible && !this.isRaining;
        this.starPoints.visible = true;

        this.isTransitioning = true;
        this.transProgress = 0.0;

        if (this.villageManager) this.villageManager.onTimeOfDayChange(key);
        return p;
    }

    setVillageManager(vm) {
        this.villageManager = vm;
    }

    toggleRain() {
        this.isRaining = !this.isRaining;
        this.rainParticles.visible = this.isRaining;
        this.applyPreset(this.currentPresetKey || 'day', false);
        if (this.villageManager) {
            this.villageManager.onRainChange(this.isRaining);
        }
        return this.isRaining;
    }

    update(dt, centerPosition) {
        // Step smooth time-of-day transition (B21)
        if (this.isTransitioning) {
            this.transProgress += dt / this.transDuration;
            const t = Math.min(1.0, this.transProgress);
            // Smooth ease in/out
            const ease = t * t * (3.0 - 2.0 * t);

            this.scene.background.lerpColors(this.srcSky, this.targetSky, ease);
            this.scene.fog.color.lerpColors(this.srcFog, this.targetFog, ease);
            this.scene.fog.density = this.srcFogDens + (this.targetFogDens - this.srcFogDens) * ease;

            this.dirLight.color.lerpColors(this.srcSun, this.targetSun, ease);
            this.dirLight.intensity = this.srcSunInt + (this.targetSunInt - this.srcSunInt) * ease;
            this.dirLight.position.set(
                this.srcSunPos[0] + (this.targetSunPos[0] - this.srcSunPos[0]) * ease,
                this.srcSunPos[1] + (this.targetSunPos[1] - this.srcSunPos[1]) * ease,
                this.srcSunPos[2] + (this.targetSunPos[2] - this.srcSunPos[2]) * ease
            );

            this.hemiLight.color.lerpColors(this.srcHemiSky, this.targetHemiSky, ease);
            this.hemiLight.groundColor.lerpColors(this.srcHemiGnd, this.targetHemiGnd, ease);
            this.hemiLight.intensity = this.srcHemiInt + (this.targetHemiInt - this.srcHemiInt) * ease;

            this.ambientLight.color.lerpColors(this.srcAmb, this.targetAmb, ease);
            this.ambientLight.intensity = this.srcAmbInt + (this.targetAmbInt - this.srcAmbInt) * ease;

            this.starMat.opacity = this.srcStarOp + (this.targetStarOp - this.srcStarOp) * ease;

            if (this.envManager) {
                this.envManager.setNightFactor(this.targetWindowGlow * ease, this.currentPresetKey !== 'day');
            }

            if (t >= 1.0) {
                this.isTransitioning = false;
                this.starPoints.visible = (this.targetStarOp > 0.05);
            }
        }

        // Center celestial objects & weather around train position
        if (centerPosition && this.starPoints.visible) {
            this.starPoints.position.x = centerPosition.x;
            this.starPoints.position.z = centerPosition.z;
            this.moonMesh.position.set(centerPosition.x - 450, 380, centerPosition.z - 650);
        }

        if (this.isRaining && this.rainParticles && centerPosition) {
            this.rainParticles.position.x = centerPosition.x;
            this.rainParticles.position.z = centerPosition.z;

            const posAttr = this.rainGeo.attributes.position;
            const posArray = posAttr.array;
            const vels = this.rainGeo.userData.velocities;

            for (let i = 0; i < this.rainCount; i++) {
                posArray[i * 3 + 1] -= vels[i] * dt;
                if (posArray[i * 3 + 1] < 0) {
                    posArray[i * 3 + 1] = 65 + (i % 12);
                }
            }
            posAttr.needsUpdate = true;
        }
    }
}
