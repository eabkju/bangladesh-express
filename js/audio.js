// audio.js - Zero-Allocation Procedural Web Audio Synthesizer
// Features: Diesel Engine Pulse & Cylinder Thumps, Track Click-Clack Rhythm, Air Brake Hiss, Multi-Chime Nathan Horn & Rain Patter
// Optimized for low-end mobile devices, zero LFO leak, and thermal efficiency.
class TrainAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.isInitialized = false;
        this.isMuted = false;

        // Master & Cab Acoustic Muffler
        this.masterGain = null;
        this.envFilter = null;
        this.analyser = null;
        this._analyserData = null;

        // Spatial & Event Audio
        this.bridgeGain = null;
        this.squealGain = null;
        this.jointBuffer = null;
        this._lastBellT = 0;

        // Engine synthesis
        this.engineOsc1 = null;
        this.engineOsc2 = null;
        this.enginePulseSource = null;
        this.enginePulseGain = null;
        this.engineFilter = null;
        this.chugGain = null;
        this.engineGain = null;
        this.lfo = null;
        this.lfoGain = null;

        // Automation throttling state
        this._lastRpmT = 0;
        this._lastRatio = -1;
        this._lastRun = null;

        // Rhythm & Ambience
        this.wheelSource = null;
        this.wheelGain = null;
        this.rainGain = null;
        this.noiseBuffer = null;
        this.enginePulseBuffer = null;

        // Horn
        this.hornGain = null;
        this.hornOscs = [];

        this.isEngineRunning = false;
        this.isRaining = false;

        // Auto-suspend audio when browser tab is hidden to save CPU & stop horn
        document.addEventListener('visibilitychange', () => {
            if (!this.audioCtx) return;
            if (document.hidden) {
                this.stopHorn();
                this.audioCtx.suspend();
            } else if (!this.isMuted) {
                this.audioCtx.resume();
            }
        });

        window.addEventListener('blur', () => {
            this.stopHorn();
        });
    }

    init() {
        if (this.isInitialized) {
            if (this.audioCtx && this.audioCtx.state === 'suspended' && !this.isMuted) {
                this.audioCtx.resume();
            }
            return;
        }

        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        // Use latencyHint: 'playback' to lower CPU usage and glitch risk on mobile (N4)
        try {
            this.audioCtx = new AC({ latencyHint: 'playback' });
        } catch (e) {
            this.audioCtx = new AC();
        }

        // Handle iOS and mobile interrupted state (N5)
        this.audioCtx.onstatechange = () => {
            if (this.audioCtx && this.audioCtx.state === 'interrupted' && !document.hidden && !this.isMuted) {
                this.audioCtx.resume();
            }
        };

        // Master DynamicsCompressor used as limiter only, avoiding raised noise floor (N3)
        const comp = this.audioCtx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-6, this.audioCtx.currentTime);
        comp.knee.setValueAtTime(6, this.audioCtx.currentTime);
        comp.ratio.setValueAtTime(4, this.audioCtx.currentTime);
        comp.attack.setValueAtTime(0.005, this.audioCtx.currentTime);
        comp.release.setValueAtTime(0.15, this.audioCtx.currentTime);
        comp.connect(this.audioCtx.destination);

        // Analyser for debug/audiodebug telemetry
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.connect(comp);

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(0.8, this.audioCtx.currentTime);
        this.masterGain.connect(this.analyser);

        // Cab interior acoustic muffler filter (2200 Hz in Deck POV, 18000 Hz outside)
        this.envFilter = this.audioCtx.createBiquadFilter();
        this.envFilter.type = 'lowpass';
        this.envFilter.frequency.setValueAtTime(18000, this.audioCtx.currentTime);
        this.envFilter.connect(this.masterGain);

        this._buildSharedBuffers();
        this._setupDieselEngine();
        this._setupTrackRhythm();
        this._setupRainAmbience();
        this._setupBridgeAndSqueal();

        this.isInitialized = true;
    }

    unlock() {
        this.init();
        if (this.audioCtx && this.audioCtx.state !== 'running' && !document.hidden && !this.isMuted) {
            this.audioCtx.resume();
        }
        if (this.isEngineRunning && this.audioCtx && this.engineGain) {
            this.engineGain.gain.setTargetAtTime(0.22, this.audioCtx.currentTime, 0.2);
        }
    }

    _buildSharedBuffers() {
        const sr = this.audioCtx.sampleRate;
        // 1. White noise buffer
        this.noiseBuffer = this.audioCtx.createBuffer(1, sr * 2, sr);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        // 2. Diesel cylinder firing pulse buffer (N2: authentic diesel thumps for mobile speakers)
        const pulseLen = Math.floor(sr * 0.5);
        this.enginePulseBuffer = this.audioCtx.createBuffer(1, pulseLen, sr);
        const pd = this.enginePulseBuffer.getChannelData(0);
        const pulses = [0.0, 0.125, 0.25, 0.375];
        pulses.forEach(hitTime => {
            const st = Math.floor(hitTime * sr);
            const dur = Math.floor(sr * 0.05);
            let lpv = 0;
            for (let k = 0; k < dur && st + k < pulseLen; k++) {
                const env = Math.exp(-k / (sr * 0.012));
                const n = Math.random() * 2 - 1;
                lpv += (n - lpv) * 0.3;
                const thump = (lpv * 0.6 + Math.sin(2 * Math.PI * 110 * k / sr) * 0.4) * env;
                pd[st + k] += thump * 0.45;
            }
        });
    }

    _setupDieselEngine() {
        const t = this.audioCtx.currentTime;

        // Two primary low-frequency oscillators
        this.engineOsc1 = this.audioCtx.createOscillator();
        this.engineOsc1.type = 'sawtooth';
        this.engineOsc1.frequency.setValueAtTime(GAME_CONFIG.audio.idleRpmFreq, t);

        this.engineOsc2 = this.audioCtx.createOscillator();
        this.engineOsc2.type = 'triangle';
        this.engineOsc2.frequency.setValueAtTime(GAME_CONFIG.audio.idleRpmFreq * 1.5, t);

        // Lowpass filter with Q = 0.8 (removes sharp whistling resonance on phones)
        this.engineFilter = this.audioCtx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.setValueAtTime(180, t);
        this.engineFilter.Q.setValueAtTime(0.8, t);

        // Loop cylinder firing pulse buffer (N2)
        this.enginePulseSource = this.audioCtx.createBufferSource();
        this.enginePulseSource.buffer = this.enginePulseBuffer;
        this.enginePulseSource.loop = true;
        this.enginePulseGain = this.audioCtx.createGain();
        this.enginePulseGain.gain.setValueAtTime(0.35, t);
        this.enginePulseSource.connect(this.enginePulseGain);

        // LFO tremolo modulation (N1: wired to dedicated chugGain, never to engineGain.gain!)
        this.lfo = this.audioCtx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.setValueAtTime(7, t);

        this.chugGain = this.audioCtx.createGain();          // chug tremolo VCA
        this.chugGain.gain.setValueAtTime(0.85, t);          // base level
        this.lfoGain = this.audioCtx.createGain();
        this.lfoGain.gain.setValueAtTime(0.15, t);           // +/-15% chug depth
        this.lfo.connect(this.lfoGain);
        this.lfoGain.connect(this.chugGain.gain);            // modulates chugGain only

        // Pure envelope gain: engineGain stays 0.0 when stopped -> TRUE SILENCE (-100 dBFS)
        this.engineGain = this.audioCtx.createGain();
        this.engineGain.gain.setValueAtTime(0.0, t);

        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);
        this.enginePulseGain.connect(this.engineFilter);

        this.engineFilter.connect(this.chugGain);
        this.chugGain.connect(this.engineGain);
        this.engineGain.connect(this.envFilter || this.masterGain);

        this.engineOsc1.start();
        this.engineOsc2.start();
        this.enginePulseSource.start();
        this.lfo.start();
    }

    _setupTrackRhythm() {
        const sr = this.audioCtx.sampleRate;
        const len = Math.floor(sr * 1.2);
        const buf = this.audioCtx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        const hits = [0.0, 0.14, 0.60, 0.74];

        hits.forEach((hitTime, idx) => {
            const st = Math.floor(hitTime * sr);
            const dur = Math.floor(sr * 0.08);
            let lpv = 0;
            for (let k = 0; k < dur && st + k < len; k++) {
                const env = Math.exp(-k / (sr * 0.016));
                const n = Math.random() * 2 - 1;
                lpv += (n - lpv) * 0.25;
                d[st + k] += (lpv * 0.7 + Math.sin(2 * Math.PI * 90 * k / sr) * 0.4) * env * (idx % 2 ? 0.75 : 1.0);
            }
        });

        this.wheelSource = this.audioCtx.createBufferSource();
        this.wheelSource.buffer = buf;
        this.wheelSource.loop = true;

        const hp = this.audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(75, this.audioCtx.currentTime);

        this.wheelGain = this.audioCtx.createGain();
        this.wheelGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);

        this.wheelSource.connect(hp);
        hp.connect(this.wheelGain);
        this.wheelGain.connect(this.envFilter || this.masterGain);
        this.wheelSource.start();
    }

    _setupRainAmbience() {
        const src = this.audioCtx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1100, this.audioCtx.currentTime);

        this.rainGain = this.audioCtx.createGain();
        this.rainGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);

        src.connect(filter);
        filter.connect(this.rainGain);
        this.rainGain.connect(this.envFilter || this.masterGain);
        src.start();
    }

    _setupBridgeAndSqueal() {
        const t = this.audioCtx.currentTime;
        // 1. Bridge metallic rumble (lowpass noise)
        const bSrc = this.audioCtx.createBufferSource();
        bSrc.buffer = this.noiseBuffer;
        bSrc.loop = true;
        const bFilt = this.audioCtx.createBiquadFilter();
        bFilt.type = 'bandpass';
        bFilt.frequency.setValueAtTime(135, t);
        bFilt.Q.setValueAtTime(1.8, t);
        this.bridgeGain = this.audioCtx.createGain();
        this.bridgeGain.gain.setValueAtTime(0.0, t);
        bSrc.connect(bFilt);
        bFilt.connect(this.bridgeGain);
        this.bridgeGain.connect(this.envFilter || this.masterGain);
        bSrc.start();

        // 2. Brake squeal (high-Q bandpass noise)
        const sSrc = this.audioCtx.createBufferSource();
        sSrc.buffer = this.noiseBuffer;
        sSrc.loop = true;
        const sFilt = this.audioCtx.createBiquadFilter();
        sFilt.type = 'bandpass';
        sFilt.frequency.setValueAtTime(2450, t);
        sFilt.Q.setValueAtTime(12.0, t);
        this.squealGain = this.audioCtx.createGain();
        this.squealGain.gain.setValueAtTime(0.0, t);
        sSrc.connect(sFilt);
        sFilt.connect(this.squealGain);
        this.squealGain.connect(this.envFilter || this.masterGain);
        sSrc.start();
    }

    setCabInteriorMode(isCab) {
        if (!this.isInitialized || !this.audioCtx || !this.envFilter) return;
        this.envFilter.frequency.setTargetAtTime(isCab ? 2200 : 18000, this.audioCtx.currentTime, 0.15);
    }

    setBridgeResonance(onBridge, speedRatio = 0.5) {
        if (!this.isInitialized || !this.audioCtx || !this.bridgeGain) return;
        const target = (onBridge && speedRatio > 0.05) ? Math.min(0.24, 0.08 + speedRatio * 0.16) : 0.0;
        this.bridgeGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.12);
    }

    setBrakeSqueal(active) {
        if (!this.isInitialized || !this.audioCtx || !this.squealGain) return;
        this.squealGain.gain.setTargetAtTime(active ? 0.035 : 0.0, this.audioCtx.currentTime, 0.08);
    }

    playCrossingBell() {
        if (!this.isInitialized || !this.audioCtx || this.audioCtx.state !== 'running') return;
        const now = performance.now();
        if (now - this._lastBellT < 450) return;
        this._lastBellT = now;

        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1568, t); // G6 metallic bell
        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.28);
        osc.connect(g);
        g.connect(this.envFilter || this.masterGain);
        osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
        osc.start(t);
        osc.stop(t + 0.30);
    }

    playGuardWhistle() {
        if (!this.isInitialized || !this.audioCtx || this.audioCtx.state !== 'running') return;
        const t = this.audioCtx.currentTime;
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(2650, t);
        osc2.frequency.setValueAtTime(2820, t);
        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.09, t + 0.03);
        g.gain.setValueAtTime(0.09, t + 0.35);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.55);
        osc1.connect(g);
        osc2.connect(g);
        g.connect(this.masterGain);
        osc1.onended = () => { try { osc1.disconnect(); osc2.disconnect(); g.disconnect(); } catch (e) {} };
        osc1.start(t); osc2.start(t);
        osc1.stop(t + 0.58); osc2.stop(t + 0.58);
    }

    playStationBell() {
        if (!this.isInitialized || !this.audioCtx || this.audioCtx.state !== 'running') return;
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.65);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
        osc.start(t);
        osc.stop(t + 0.68);
    }

    toggleMute() {
        this.init();
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.audioCtx) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0.0 : 0.8, this.audioCtx.currentTime, 0.08);
        }
        return this.isMuted;
    }

    startEngine() {
        this.init();
        if (!this.audioCtx) return;
        this.isEngineRunning = true;
        this.engineGain.gain.setTargetAtTime(0.22, this.audioCtx.currentTime, 0.25);
    }

    stopEngine() {
        if (!this.isInitialized || !this.audioCtx) return;
        this.isEngineRunning = false;
        this.playAirHiss();
        this.engineGain.gain.setTargetAtTime(0.0, this.audioCtx.currentTime, 0.5);
        this.wheelGain.gain.setTargetAtTime(0.0, this.audioCtx.currentTime, 0.3);
    }

    // Throttled parameter automation at ~15Hz, skipping redundant events (N4)
    updateRPM(speedRatio, isRunning) {
        if (!this.isInitialized || !this.audioCtx || this.audioCtx.state !== 'running') return;
        const now = performance.now();
        if (now - (this._lastRpmT || 0) < 66) return;
        if (Math.abs(speedRatio - (this._lastRatio ?? -1)) < 0.004 && isRunning === this._lastRun) return;
        this._lastRpmT = now;
        this._lastRatio = speedRatio;
        this._lastRun = isRunning;

        const t = this.audioCtx.currentTime;
        const active = isRunning || speedRatio > 0.01;

        const baseFreq = GAME_CONFIG.audio.idleRpmFreq + (GAME_CONFIG.audio.maxRpmFreq - GAME_CONFIG.audio.idleRpmFreq) * speedRatio;
        this.engineOsc1.frequency.setTargetAtTime(baseFreq, t, 0.15);
        this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, t, 0.15);
        if (this.enginePulseSource) {
            this.enginePulseSource.playbackRate.setTargetAtTime(0.8 + speedRatio * 1.0, t, 0.15);
        }
        this.engineFilter.frequency.setTargetAtTime(170 + speedRatio * 340, t, 0.15);
        this.lfo.frequency.setTargetAtTime(6 + speedRatio * 14, t, 0.15);
        this.engineGain.gain.setTargetAtTime(active ? (0.14 + speedRatio * 0.18) : 0.0, t, 0.2);

        this.wheelSource.playbackRate.setTargetAtTime(Math.max(0.1, 0.45 + speedRatio * 1.15), t, 0.1);
        this.wheelGain.gain.setTargetAtTime(speedRatio > 0.02 ? Math.min(0.55, speedRatio * 0.65) : 0.0, t, 0.12);
    }

    startHorn() {
        this.init();
        if (!this.audioCtx || this.hornGain) return;
        const now = this.audioCtx.currentTime;

        this.hornGain = this.audioCtx.createGain();
        this.hornGain.gain.setValueAtTime(0.0, now);
        this.hornGain.gain.linearRampToValueAtTime(0.26, now + 0.05);

        const lp = this.audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1650, now);
        lp.connect(this.hornGain);
        this.hornGain.connect(this.masterGain);

        const freqs = GAME_CONFIG.audio.hornFrequencies || [311.13, 370.00, 466.16];
        this.hornOscs = freqs.map(f => {
            const osc = this.audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, now);
            osc.connect(lp);
            osc.start(now);
            return osc;
        });
    }

    stopHorn() {
        if (!this.audioCtx || !this.hornGain) return;
        const now = this.audioCtx.currentTime;
        const g = this.hornGain;
        const oscs = this.hornOscs;
        this.hornGain = null;
        this.hornOscs = [];

        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        setTimeout(() => {
            oscs.forEach(o => { try { o.stop(); } catch (e) {} });
        }, 250);
    }

    playHorn() {
        this.startHorn();
        setTimeout(() => this.stopHorn(), 850);
    }

    playAirHiss() {
        if (!this.isInitialized || !this.audioCtx) return;
        const t = this.audioCtx.currentTime;
        const s = this.audioCtx.createBufferSource();
        s.buffer = this.noiseBuffer;

        const f = this.audioCtx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.setValueAtTime(2800, t);

        const g = this.audioCtx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);

        s.connect(f);
        f.connect(g);
        g.connect(this.masterGain);

        // Disconnect nodes on sound end to prevent memory leakage (N4)
        s.onended = () => {
            try {
                s.disconnect();
                f.disconnect();
                g.disconnect();
            } catch (e) {}
        };

        s.start(t);
        s.stop(t + 1.15);
    }

    setRainSound(enable) {
        this.init();
        if (!this.audioCtx || !this.rainGain) return;
        this.isRaining = enable;
        const target = enable ? (GAME_CONFIG.audio.rainNoiseDensity || 0.22) : 0.0;
        this.rainGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.35);
    }

    // RMS level in dBFS for ?audiodebug=1 telemetry (Section 2.4)
    getAudioDb() {
        if (!this.analyser || !this.audioCtx || this.audioCtx.state !== 'running') return -100;
        if (!this._analyserData) this._analyserData = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(this._analyserData);
        let sum = 0;
        for (let i = 0; i < this._analyserData.length; i++) {
            sum += this._analyserData[i] * this._analyserData[i];
        }
        const rms = Math.sqrt(sum / this._analyserData.length);
        if (rms < 1e-5) return -100;
        return Math.max(-100, Math.round(20 * Math.log10(rms)));
    }
}
