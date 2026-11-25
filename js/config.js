// config.js - Global game configuration, physical constants, and color palettes
window.GAME_CONFIG = {
    // Train & Carriages Physics
    train: {
        maxSpeed: 22.2,         // Maximum cruising speed (m/s, ~80 km/h)
        acceleration: 2.4,      // Smooth tractive acceleration rate (m/s^2)
        deceleration: 4.5,      // Responsive air-brake deceleration rate (m/s^2)
        friction: 0.28,         // Coasting rolling friction (m/s^2)
        proCabDefault: true,    // Default to 8-Notch Pro Cab Mode
        wheelRadius: 0.52,      // Wheel radius in meters
        bogieDistance: 6.8,     // Distance between locomotive front and rear bogies
        length: 12.2,           // Total locomotive length
        width: 3.1,             // Total locomotive width
        height: 4.2,            // Total locomotive height

        // 5 Attached Passenger Carriages
        carriageCount: 5,       // Number of trailing passenger carriages
        carriageLength: 11.4,   // Length of each passenger coach
        carriageWidth: 2.92,    // Coach body width
        carriageHeight: 3.65,   // Coach body height
        carriageSpacing: 12.3,  // Center-to-center distance between adjacent train cars
        carriageBogieDist: 6.8  // Bogie spacing on each coach
    },

    // Track Dimensions
    track: {
        gauge: 1.435,           // Standard track gauge (meters)
        railWidth: 0.12,        // Rail head width
        railHeight: 0.16,       // Rail profile height
        sleeperWidth: 2.65,     // Cross-tie / sleeper length
        sleeperHeight: 0.18,    // Sleeper height
        sleeperDepth: 0.26,     // Sleeper depth (along track)
        sleeperSpacing: 1.4,    // Spacing between consecutive instanced sleepers
        ballastTopWidth: 3.4,   // Ballast top width
        ballastBaseWidth: 5.4,  // Ballast bottom width
        ballastHeight: 0.32,    // Ballast embankment height
        lookupSamples: 4096     // Pre-baked O(1) spline lookup samples
    },

    // Camera Settings
    camera: {
        fov: 52,
        near: 0.25,
        far: 2600,
        defaultDistance: 30,
        minDistance: 7,
        maxDistance: 180,
        defaultPitch: 0.34,     // Radians elevation angle
        defaultYaw: -0.68,      // Radians azimuth angle
        deck: {
            eye: { x: -0.55, y: 3.25, z: 4.2 }, // Cab-forward driver seat POV (Option A)
            hfovDeg: 78,
            near: 0.08,
            yawLimit: 1.75,
            pitchLimit: 0.45
        }
    },

    // Performance & Thermal Settings (Low, Moderate, Medium, High Quality Tiers)
    performance: {
        modes: [
            { id: 'low',      name: 'Low',      label: '⚡ Low 30 FPS',      fpsCap: 30, maxDpr: 0.80, lodDistance: 900  },
            { id: 'moderate', name: 'Moderate', label: '🌿 Moderate 40 FPS', fpsCap: 40, maxDpr: 0.95, lodDistance: 1300 },
            { id: 'medium',   name: 'Medium',   label: '✨ Medium 50 FPS',   fpsCap: 50, maxDpr: 1.10, lodDistance: 1600 },
            { id: 'high',     name: 'High',     label: '🚀 High 60 FPS',     fpsCap: 60, maxDpr: 1.20, lodDistance: 1900 }
        ],
        defaultModeIndex: 1 // Default to Moderate 40 FPS for balanced performance & battery
    },

    // Visual Themes / Lighting (Bangladeshi Simulator Palette - Section 20)
    colors: {
        // Bangladeshi Blue-and-Red Train Livery
        trainBody: 0x1b4f9c,    // Royal blue upper body
        coachBody: 0x1b4f9c,
        trainAccent: 0xc8102e,  // Red lower band, nose panel & skirts
        trainStripe: 0xf4f4f0,  // White pin line
        trainRoof: 0x8a9099,    // Light grey roof
        trainFrame: 0x1a1d22,   // Black underframe
        trainBogies: 0x1c2026,
        trainWheels: 0x707882,
        trainBuffersRed: 0xc8102e,

        // Carriage & Window Glow
        coachWindowGlow: 0xffe299,
        coachGangway: 0x14171a,

        // Track & Infrastructure
        rails: 0x9aa2ab,
        sleepers: 0x6e6a63,
        ballast: 0x4c4741,
        subBallast: 0x3b3731,

        // Utility Poles
        poleWood: 0x42352a,
        insulators: 0x5ca38a,
        lampWarm: 0xffd982,

        // Atmospheric Presets (Day, Dawn, Night)
        presets: {
            day: {
                name: 'Day',
                icon: '☀️',
                skyTop: 0x3d7cb8,
                skyHorizon: 0xa8cbe8,
                fogColor: 0x9ec2e0,
                fogDensity: 0.00042,
                sunColor: 0xfff7e6,
                sunIntensity: 1.25,
                sunPos: [140, 240, 160],
                hemiSky: 0x9ec5eb,
                hemiGround: 0x435e3a,
                hemiIntensity: 0.72,
                ambientColor: 0x8ba7c7,
                ambientIntensity: 0.28,
                starOpacity: 0.0,
                moonVisible: false,
                windowGlow: 0.08
            },
            dawn: {
                name: 'Dawn',
                icon: '🌅',
                skyTop: 0x3a4b7c,
                skyHorizon: 0xf4a261,
                fogColor: 0xe8a882,
                fogDensity: 0.00060,
                sunColor: 0xffb870,
                sunIntensity: 1.15,
                sunPos: [220, 85, 120],
                hemiSky: 0xfaa57b,
                hemiGround: 0x3d4f2b,
                hemiIntensity: 0.68,
                ambientColor: 0x7e5f52,
                ambientIntensity: 0.32,
                starOpacity: 0.12,
                moonVisible: false,
                windowGlow: 0.40
            },
            night: {
                name: 'Night',
                icon: '🌙',
                skyTop: 0x060d1a,
                skyHorizon: 0x162a45,
                fogColor: 0x102036,
                fogDensity: 0.00055,
                sunColor: 0xc8daf0,
                sunIntensity: 0.52,
                sunPos: [-120, 200, -140],
                hemiSky: 0x263e63,
                hemiGround: 0x121d2b,
                hemiIntensity: 0.45,
                ambientColor: 0x22344f,
                ambientIntensity: 0.38,
                starOpacity: 0.95,
                moonVisible: true,
                windowGlow: 1.45
            }
        }
    },

    // Audio Frequencies & Tuning
    audio: {
        idleRpmFreq: 26,
        maxRpmFreq: 62,
        hornFrequencies: [311.13, 370.00, 466.16], // Eb4, F#4, Bb4 chord chime
        rainNoiseDensity: 0.22
    }
};

// Lightweight zero-dependency BufferGeometry merger for draw-call reduction
window.mergeStaticGeometries = function(geometries) {
    if (!geometries || geometries.length === 0) return null;
    const nonIndexed = geometries.map(g => g.index ? g.toNonIndexed() : g);

    let totalVerts = 0;
    let hasNormals = true;
    let hasUvs = true;
    for (let i = 0; i < nonIndexed.length; i++) {
        const pos = nonIndexed[i].attributes.position;
        if (!pos) continue;
        totalVerts += pos.count;
        if (!nonIndexed[i].attributes.normal) hasNormals = false;
        if (!nonIndexed[i].attributes.uv) hasUvs = false;
    }

    const posArr = new Float32Array(totalVerts * 3);
    const normArr = hasNormals ? new Float32Array(totalVerts * 3) : null;
    const uvArr = hasUvs ? new Float32Array(totalVerts * 2) : null;

    let offset3 = 0;
    let offset2 = 0;
    for (let i = 0; i < nonIndexed.length; i++) {
        const g = nonIndexed[i];
        const pos = g.attributes.position;
        if (!pos) continue;
        posArr.set(pos.array, offset3);
        if (normArr && g.attributes.normal) normArr.set(g.attributes.normal.array, offset3);
        if (uvArr && g.attributes.uv) uvArr.set(g.attributes.uv.array, offset2);
        offset3 += pos.count * 3;
        offset2 += pos.count * 2;
        if (g !== geometries[i]) g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    if (normArr) merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    if (uvArr) merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    return merged;
};
