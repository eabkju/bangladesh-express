// weather.js - Zero-Shadow-Map Atmospheric Preset Manager (Day, Dawn, Moonlit Starry Night & Monsoon Rain)
// Features: Smooth 2.5s Color & Fog Transitions (B21), Dynamic Starry Night Sky Dome, Monsoonal Downpour

class WeatherManager {
    constructor(scene, renderer, envManager, villageManager) {
        this.scene = scene;
        this.renderer = renderer;
        this.envManager = envManager;
        this.villageManager = villageManager;

        this.presetOrder = ['day', 'dawn', 'night'];
        this.presetIdx = 0;
        this.isRaining = false;
        this.currentPresetKey = 'day';

        this.dirLight = null;
        this.hemiLight = null;
        this.ambientLight = null;
        this.skyDome = null;
        this.skyUniforms = null;
        this.cloudInst = null;
        this.cloudData = [];
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

        // Monsoonal Rain Particle System (100% GPU Shader-Driven — Zero CPU loop / Zero buffer upload)
        this.rainParticles = null;
        this.rainCount = 900;
        this.rainGeo = null;
        this.rainMat = null;
        this.rainTime = 0;

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

        // Gradient Sky Dome (1 draw call, uses skyTop -> skyHorizon + soft sun halo)
        this.skyUniforms = {
            uTopColor: { value: new THREE.Color(p.skyTop) },
            uHorizonColor: { value: new THREE.Color(p.skyHorizon) },
            uSunDir: { value: new THREE.Vector3(p.sunPos[0], p.sunPos[1], p.sunPos[2]).normalize() },
            uSunColor: { value: new THREE.Color(p.sunColor) },
            uSunGlow: { value: 0.45 }
        };
        const skyGeo = new THREE.SphereGeometry(2100, 20, 12);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: this.skyUniforms,
            vertexShader: [
                'varying vec3 vLocalPos;',
                'void main() {',
                '    vLocalPos = normalize(position);',
                '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 uTopColor;',
                'uniform vec3 uHorizonColor;',
                'uniform vec3 uSunDir;',
                'uniform vec3 uSunColor;',
                'uniform float uSunGlow;',
                'varying vec3 vLocalPos;',
                'void main() {',
                '    float h = clamp(vLocalPos.y, 0.0, 1.0);',
                '    vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.55));',
                '    float sunDot = max(dot(vLocalPos, normalize(uSunDir)), 0.0);',
                '    col += uSunColor * (pow(sunDot, 24.0) * 0.55 + pow(sunDot, 180.0) * 0.85) * uSunGlow;',
                '    gl_FragColor = vec4(col, 1.0);',
                '}'
            ].join('\n'),
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        });
        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyDome);

        // Instanced Drifting Clouds (1 draw call, 26 clouds)
        const cloudCount = 26;
        const c1 = new THREE.DodecahedronGeometry(18, 0);
        c1.scale(1.8, 0.55, 1.1);
        const c2 = new THREE.DodecahedronGeometry(13, 0);
        c2.scale(1.4, 0.5, 1.0);
        c2.translate(16, -2, 3);
        const c3 = new THREE.DodecahedronGeometry(12, 0);
        c3.scale(1.3, 0.48, 0.9);
        c3.translate(-15, -2.5, -2);
        const cloudGeo = window.mergeStaticGeometries ? window.mergeStaticGeometries([c1, c2, c3]) : c1;
        this.cloudMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.72,
            fog: true
        });
        this.cloudInst = new THREE.InstancedMesh(cloudGeo, this.cloudMat, cloudCount);
        this.cloudDummy = new THREE.Object3D();
        for (let i = 0; i < cloudCount; i++) {
            const cx = ((i * 277) % 2200) - 1100;
            const cy = 155 + (i % 5) * 24;
            const cz = ((i * 419) % 2400) - 1200;
            const sc = 0.8 + (i % 4) * 0.35;
            this.cloudData.push({ x: cx, y: cy, z: cz, sc: sc, speed: 3.5 + (i % 5) * 1.1, rot: (i * 0.7) % Math.PI });
            this.cloudDummy.position.set(cx, cy, cz);
            this.cloudDummy.rotation.set(0, this.cloudData[i].rot, 0);
            this.cloudDummy.scale.setScalar(sc);
            this.cloudDummy.updateMatrix();
            this.cloudInst.setMatrixAt(i, this.cloudDummy.matrix);
        }
        this.cloudInst.instanceMatrix.needsUpdate = true;
        this.cloudInst.frustumCulled = false;
        this.scene.add(this.cloudInst);

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
        const speeds = new Float32Array(this.rainCount);

        for (let i = 0; i < this.rainCount; i++) {
            positions[i * 3]     = (Math.random() - 0.5) * 180;
            positions[i * 3 + 1] = Math.random() * 70;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 180;
            speeds[i] = 44 + Math.random() * 22;
        }

        this.rainGeo = new THREE.BufferGeometry();
        this.rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainGeo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

        this.rainMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uColor: { value: new THREE.Color(0xaed4f7) },
                uOpacity: { value: 0.62 },
                uSize: { value: 2.2 }
            },
            vertexShader: [
                'attribute float aSpeed;',
                'uniform float uTime;',
                'uniform float uSize;',
                'void main() {',
                '    vec3 p = position;',
                '    p.y = mod(p.y - uTime * aSpeed, 70.0);',
                '    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);',
                '    gl_PointSize = uSize * (180.0 / max(1.0, -mvPos.z));',
                '    gl_Position = projectionMatrix * mvPos;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 uColor;',
                'uniform float uOpacity;',
                'void main() {',
                '    vec2 c = gl_PointCoord - vec2(0.5);',
                '    if (abs(c.x) > 0.18) discard;',
                '    float alpha = uOpacity * (1.0 - abs(c.y) * 1.6);',
                '    if (alpha <= 0.01) discard;',
                '    gl_FragColor = vec4(uColor, alpha);',
                '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false
        });

        this.rainParticles = new THREE.Points(this.rainGeo, this.rainMat);
        this.rainParticles.frustumCulled = false;
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
        if (key === 'sunset') key = 'dawn';
        const p = GAME_CONFIG.colors.presets[key] || GAME_CONFIG.colors.presets.day;
        this.currentPresetKey = key;
        const pIdx = this.presetOrder.indexOf(key);
        if (pIdx !== -1) this.presetIdx = pIdx;

        if (immediate) {
            this.scene.background.setHex(p.skyHorizon);
            this.scene.fog.color.setHex(p.fogColor);
            this.scene.fog.density = this.isRaining ? 0.00105 : p.fogDensity;

            if (this.skyUniforms) {
                this.skyUniforms.uTopColor.value.setHex(p.skyTop);
                this.skyUniforms.uHorizonColor.value.setHex(p.skyHorizon);
                this.skyUniforms.uSunDir.value.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]).normalize();
                this.skyUniforms.uSunColor.value.setHex(p.sunColor);
                this.skyUniforms.uSunGlow.value = (key === 'night' || this.isRaining) ? 0.0 : (key === 'dawn' ? 0.85 : 0.45);
            }
            if (this.cloudMat) {
                this.cloudMat.color.setHex(key === 'night' ? 0x1e2c42 : (key === 'dawn' ? 0xffd0a8 : 0xffffff));
                this.cloudMat.opacity = this.isRaining ? 0.35 : (key === 'night' ? 0.35 : 0.72);
            }

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
        this.srcSkyTop = this.skyUniforms ? this.skyUniforms.uTopColor.value.clone() : new THREE.Color(p.skyTop);
        this.targetSkyTop = new THREE.Color(p.skyTop);
        this.srcCloudCol = this.cloudMat ? this.cloudMat.color.clone() : new THREE.Color(0xffffff);
        this.targetCloudCol = new THREE.Color(key === 'night' ? 0x1e2c42 : (key === 'dawn' ? 0xffd0a8 : 0xffffff));
        this.srcSunGlow = this.skyUniforms ? this.skyUniforms.uSunGlow.value : 0.45;
        this.targetSunGlow = (key === 'night' || this.isRaining) ? 0.0 : (key === 'dawn' ? 0.85 : 0.45);
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

            if (this.skyUniforms) {
                this.skyUniforms.uHorizonColor.value.copy(this.scene.background);
                this.skyUniforms.uTopColor.value.lerpColors(this.srcSkyTop, this.targetSkyTop, ease);
                this.skyUniforms.uSunColor.value.lerpColors(this.srcSun, this.targetSun, ease);
                this.skyUniforms.uSunDir.value.copy(this.dirLight.position).normalize();
                this.skyUniforms.uSunGlow.value = this.srcSunGlow + (this.targetSunGlow - this.srcSunGlow) * ease;
            }
            if (this.cloudMat) {
                this.cloudMat.color.lerpColors(this.srcCloudCol, this.targetCloudCol, ease);
            }

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
        if (centerPosition) {
            if (this.skyDome) {
                this.skyDome.position.set(centerPosition.x, 0, centerPosition.z);
            }
            if (this.starPoints.visible) {
                this.starPoints.position.x = centerPosition.x;
                this.starPoints.position.z = centerPosition.z;
                this.moonMesh.position.set(centerPosition.x - 450, 380, centerPosition.z - 650);
            }
        }

        // Drift clouds gently
        if (this.cloudInst && this.cloudData.length > 0) {
            for (let i = 0; i < this.cloudData.length; i++) {
                const c = this.cloudData[i];
                c.x += c.speed * dt;
                if (c.x > 1100) c.x = -1100;
                this.cloudDummy.position.set(c.x, c.y, c.z);
                this.cloudDummy.rotation.set(0, c.rot, 0);
                this.cloudDummy.scale.setScalar(c.sc);
                this.cloudDummy.updateMatrix();
                this.cloudInst.setMatrixAt(i, this.cloudDummy.matrix);
            }
            this.cloudInst.instanceMatrix.needsUpdate = true;
        }

        if (this.isRaining && this.rainParticles && centerPosition) {
            this.rainParticles.position.x = centerPosition.x;
            this.rainParticles.position.z = centerPosition.z;
            this.rainTime += dt;
            if (this.rainMat) {
                this.rainMat.uniforms.uTime.value = this.rainTime;
            }
        }
    }
}
