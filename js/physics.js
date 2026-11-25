// physics.js - Zero-Allocation Multi-Car Train Kinematics using Pre-Baked O(1) Track Lookup
class TrainPhysics {
    constructor(trackSystem) {
        this.trackSystem = trackSystem;
        this.trackSpline = trackSystem.spline;
        this.trackLength = trackSystem.totalLength;

        // Kinematic states
        this.proCabMode = GAME_CONFIG.train.proCabDefault !== false;
        this.speed = 0.0;                  // Speed magnitude in m/s
        this.signedSpeed = 0.0;            // Signed velocity (+forward / -reverse) in m/s
        this.targetSpeed = 0.0;            // Simple-mode target speed in m/s
        this.throttleFraction = 0.85;      // Simple-mode throttle setting (0.0 to 1.0)
        this.notch = 5;                    // Pro Cab throttle notch (0..8)
        this.reverser = 1;                 // Pro Cab reverser: 1=FWD, 0=NEU, -1=REV
        this.brakeFraction = 0.0;          // Pro Cab air brake (0.0=Released .. 1.0=Full)
        this.isRunning = true;             // Active driving state
        this.isRaining = false;            // Synced from WeatherManager
        this.progress = 0.02;              // Normalized track parameter u in [0, 1)
        this.wheelRotation = 0.0;          // Wheel rotation in radians

        // Locomotive Kinematics (Car 0)
        this.currentPosition = new THREE.Vector3();
        this.currentTangent = new THREE.Vector3();
        this.frontBogiePos = new THREE.Vector3();
        this.rearBogiePos = new THREE.Vector3();
        this.frontBogieTan = new THREE.Vector3();
        this.rearBogieTan = new THREE.Vector3();

        // 5 Trailing Carriages Kinematics (Cars 1 to 5)
        this.carriageCount = GAME_CONFIG.train.carriageCount || 5;
        this.carriageSpacing = GAME_CONFIG.train.carriageSpacing || 12.3;
        this.carriagesData = [];

        for (let i = 0; i < this.carriageCount; i++) {
            this.carriagesData.push({
                position: new THREE.Vector3(),
                tangent: new THREE.Vector3(),
                frontBogiePos: new THREE.Vector3(),
                rearBogiePos: new THREE.Vector3(),
                frontTangent: new THREE.Vector3(),
                rearTangent: new THREE.Vector3(),
                wheelRotation: 0.0,
                progress: 0.02
            });
        }

        // Compute initial positions once at boot
        this._syncAllCarPositions();
    }

    setRunning(isRunning) {
        this.isRunning = isRunning;
        if (this.proCabMode) {
            if (!isRunning) {
                this.notch = 0;
                this.brakeFraction = 0.85;
            } else {
                this.brakeFraction = 0.0;
                if (this.notch === 0) this.notch = 4;
                if (this.reverser === 0) this.reverser = 1;
            }
        } else {
            this.targetSpeed = isRunning ? (GAME_CONFIG.train.maxSpeed * this.throttleFraction) : 0.0;
        }
    }

    setProCabMode(enabled) {
        this.proCabMode = !!enabled;
        if (this.proCabMode) {
            this.notch = this.isRunning ? Math.max(1, Math.round(this.throttleFraction * 8)) : 0;
            this.brakeFraction = this.isRunning ? 0.0 : 0.6;
        } else {
            this.throttleFraction = this.notch / 8.0;
            this.isRunning = this.notch > 0 && this.brakeFraction < 0.5;
            this.targetSpeed = this.isRunning ? (GAME_CONFIG.train.maxSpeed * this.throttleFraction) : 0.0;
        }
    }

    setNotch(n) {
        this.notch = Math.max(0, Math.min(8, Math.round(n)));
        this.throttleFraction = this.notch / 8.0;
        this.isRunning = (this.reverser !== 0 && this.notch > 0 && this.brakeFraction < 0.85);
    }

    setReverser(dir) {
        const clamped = dir > 0 ? 1 : (dir < 0 ? -1 : 0);
        // Only allow shifting reverser when nearly stationary
        if (this.speed > 0.4 && clamped !== this.reverser) return false;
        this.reverser = clamped;
        this.isRunning = (this.reverser !== 0 && this.notch > 0 && this.brakeFraction < 0.85);
        return true;
    }

    setBrake(fraction) {
        this.brakeFraction = Math.max(0.0, Math.min(1.0, fraction));
        if (this.proCabMode) {
            this.isRunning = (this.reverser !== 0 && this.notch > 0 && this.brakeFraction < 0.85);
        }
    }

    setThrottleFraction(fraction) {
        this.throttleFraction = Math.max(0.0, Math.min(1.0, fraction));
        if (this.proCabMode) {
            this.setNotch(Math.round(this.throttleFraction * 8));
        } else if (this.isRunning) {
            this.targetSpeed = GAME_CONFIG.train.maxSpeed * this.throttleFraction;
        }
    }

    setTargetSpeed(targetSpeed) {
        this.targetSpeed = Math.max(0.0, Math.min(GAME_CONFIG.train.maxSpeed, targetSpeed));
    }

    restoreProgress(u) {
        if (!Number.isFinite(u)) return;
        this.progress = ((u % 1.0) + 1.0) % 1.0;
        this._syncAllCarPositions();
    }

    update(dt) {
        const delta = Math.min(dt, 0.1);

        if (this.proCabMode) {
            const speedRatio = this.getSpeedRatio();
            const maxSpd = GAME_CONFIG.train.maxSpeed * (this.reverser === -1 ? 0.45 : 1.0);
            const targetSpd = (this.reverser !== 0 && this.notch > 0 && this.brakeFraction < 0.85)
                ? this.reverser * maxSpd * (this.notch / 8.0)
                : 0.0;

            // Tractive effort
            if (this.reverser !== 0 && this.notch > 0 && this.brakeFraction < 0.85) {
                const effort = (this.notch / 8.0) * GAME_CONFIG.train.acceleration * (1.2 - 0.35 * speedRatio);
                if (this.reverser > 0 && this.signedSpeed < targetSpd) {
                    this.signedSpeed = Math.min(targetSpd, this.signedSpeed + effort * delta);
                } else if (this.reverser < 0 && this.signedSpeed > targetSpd) {
                    this.signedSpeed = Math.max(targetSpd, this.signedSpeed - effort * delta);
                }
            }

            // Grade resistance (climbing slows slightly, descending accelerates slightly)
            if (this.speed > 0.05 || (this.notch === 0 && this.brakeFraction < 0.1)) {
                this.signedSpeed -= this.currentTangent.y * 3.5 * delta;
            }

            // Rolling & aerodynamic drag + Air Brake
            const drag = GAME_CONFIG.train.friction + 0.0016 * this.speed * this.speed;
            const brakeDecel = this.brakeFraction * GAME_CONFIG.train.deceleration;
            const totalOppose = (this.notch === 0 || this.reverser === 0 || this.brakeFraction > 0.02 || Math.abs(this.signedSpeed) > Math.abs(targetSpd))
                ? (drag + brakeDecel)
                : 0.0;

            if (totalOppose > 0 && Math.abs(this.signedSpeed) > 0.0) {
                const sign = this.signedSpeed >= 0 ? 1 : -1;
                const nextMag = Math.max(0.0, Math.abs(this.signedSpeed) - totalOppose * delta);
                this.signedSpeed = sign * nextMag;
            }

            if (Math.abs(this.signedSpeed) < 0.02 && (this.notch === 0 || this.reverser === 0 || this.brakeFraction > 0.1)) {
                this.signedSpeed = 0.0;
            }
            this.speed = Math.abs(this.signedSpeed);
            this.isRunning = (this.reverser !== 0 && this.notch > 0 && this.brakeFraction < 0.85);
        } else {
            // Simple Mode acceleration / braking dynamics
            if (this.speed < this.targetSpeed) {
                this.speed += GAME_CONFIG.train.acceleration * delta;
                if (this.speed > this.targetSpeed) this.speed = this.targetSpeed;
            } else if (this.speed > this.targetSpeed) {
                const decelRate = !this.isRunning
                    ? GAME_CONFIG.train.deceleration
                    : (this.targetSpeed === 0.0 ? GAME_CONFIG.train.friction : GAME_CONFIG.train.friction * 2.5);
                this.speed -= decelRate * delta;
                if (this.speed < this.targetSpeed) this.speed = this.targetSpeed;
            }
            this.signedSpeed = this.speed;
        }

        // Skip spline updates completely if stationary (saves CPU!)
        if (this.speed <= 0.0001) {
            this.speed = 0.0;
            this.signedSpeed = 0.0;
            return false; // Indicates no movement occurred
        }

        const distanceDelta = this.signedSpeed * delta;
        this.wheelRotation += distanceDelta / GAME_CONFIG.train.wheelRadius;

        const deltaU = distanceDelta / this.trackLength;
        this.progress = (((this.progress + deltaU) % 1.0) + 1.0) % 1.0;

        this._syncAllCarPositions();
        return true;
    }

    _syncAllCarPositions() {
        // 1. Locomotive
        this._updateCarKinematics(
            this.progress,
            GAME_CONFIG.train.bogieDistance,
            this.currentPosition,
            this.currentTangent,
            this.frontBogiePos,
            this.rearBogiePos,
            this.frontBogieTan,
            this.rearBogieTan
        );

        // 2. Trailing Passenger Carriages
        const bogieDist = GAME_CONFIG.train.carriageBogieDist || GAME_CONFIG.train.bogieDistance;
        for (let i = 0; i < this.carriageCount; i++) {
            const carOffsetMeters = (i + 1) * this.carriageSpacing;
            let carProgress = (this.progress - (carOffsetMeters / this.trackLength)) % 1.0;
            if (carProgress < 0) carProgress += 1.0;

            const car = this.carriagesData[i];
            car.progress = carProgress;
            car.wheelRotation = this.wheelRotation;

            this._updateCarKinematics(
                carProgress,
                bogieDist,
                car.position,
                car.tangent,
                car.frontBogiePos,
                car.rearBogiePos,
                car.frontTangent,
                car.rearTangent
            );
        }
    }

    _updateCarKinematics(uCenter, bogieDist, outCenterPos, outTangent, outFrontBogie, outRearBogie, outFrontTan, outRearTan) {
        const halfBogieU = (bogieDist * 0.5) / this.trackLength;

        let uFront = (uCenter + halfBogieU) % 1.0;
        let uRear = (uCenter - halfBogieU) % 1.0;
        if (uFront < 0) uFront += 1.0;
        if (uRear < 0) uRear += 1.0;

        this.trackSystem.samplePoint(uFront, outFrontBogie);
        this.trackSystem.samplePoint(uRear, outRearBogie);
        this.trackSystem.sampleTangent(uFront, outFrontTan);
        this.trackSystem.sampleTangent(uRear, outRearTan);

        outCenterPos.x = (outFrontBogie.x + outRearBogie.x) * 0.5;
        outCenterPos.y = (outFrontBogie.y + outRearBogie.y) * 0.5;
        outCenterPos.z = (outFrontBogie.z + outRearBogie.z) * 0.5;

        const dx = outFrontBogie.x - outRearBogie.x;
        const dy = outFrontBogie.y - outRearBogie.y;
        const dz = outFrontBogie.z - outRearBogie.z;
        const len = Math.hypot(dx, dy, dz) || 1.0;
        outTangent.x = dx / len;
        outTangent.y = dy / len;
        outTangent.z = dz / len;
    }

    getKmh() {
        return Math.round(this.speed * 3.6);
    }

    getSpeedRatio() {
        return Math.min(1.0, this.speed / GAME_CONFIG.train.maxSpeed);
    }

    getBrakePressureBar() {
        if (!this.proCabMode) return this.isRunning ? 5.0 : 0.0;
        return Math.max(0.0, 5.0 * (1.0 - this.brakeFraction));
    }

    getTractiveEffortRatio() {
        if (!this.proCabMode) return this.getSpeedRatio();
        if (this.reverser === 0 || this.brakeFraction >= 0.85) return 0.0;
        return this.notch / 8.0;
    }
}
