/**
 * Weapon.js - 武器系统
 * 实现射击、弹药管理、换弹、后坐力、弹道可视化
 * 支持开镜(ADS)、散布、半自动/全自动、爆头倍率等武器特性
 * 性能优化：弹道轨迹对象池、弹孔数量限制、共享材质
 */
import * as THREE from 'three';

export class Weapon {
    constructor(scene, player, cameraController) {
        this.scene = scene;
        this.player = player;
        this.cameraController = cameraController;

        // 弹药参数
        this.magazineSize = 30;
        this.ammoInMagazine = 30;
        this.reserveAmmo = 999;  // 备弹无限(训练模式)
        this._defaultReserveAmmo = 999;  // 默认备弹（reset时恢复）

        // 射击参数
        this.fireRate = 0.1;          // 射击间隔(秒)
        this.lastShotTime = 0;        // 上次射击时间
        this.damage = 25;             // 每发伤害
        this.range = 100;             // 射程

        // 换弹参数
        this.isReloading = false;
        this.reloadTime = 2.0;        // 换弹时间
        this.reloadStartTime = 0;

        // 后坐力
        this.recoilOffset = new THREE.Vector3();
        this.recoilRecovery = 8;      // 后坐力恢复速度
        this.recoilAmount = 0.02;     // 后坐力强度

        // 武器特性参数（由_applyWeapon设置）
        this.automatic = true;           // 是否全自动
        this.adsZoom = 1.25;             // 开镜倍率
        this.moveSpeedMultiplier = 1.0;  // 移动速度倍率
        this.headshotMultiplier = 1.8;   // 爆头倍率
        this.baseSpread = 0.005;         // 基础散布（弧度）
        this.moveSpreadPenalty = 0.02;   // 移动时额外散布
        this.adsSpreadBonus = 0.004;     // 开镜时散布降低值

        // 开镜(ADS)状态
        this.isAiming = false;           // 是否正在开镜
        this._adsProgress = 0;           // 开镜过渡进度(0-1)
        this._adsSpeed = 12;             // 开镜过渡速度
        this._baseFov = 90;              // 基础FOV（由CameraController设置）
        this._baseSensitivity = 0.0022;  // 基础灵敏度（由_applySettings设置）

        // 弹道效果列表
        this.tracers = [];
        this.muzzleFlashes = [];
        // 弹孔特效列表
        this.bulletImpacts = [];
        // 弹孔最大数量（性能优化：限制累积）
        this._maxBulletImpacts = 15;

        // 对象池：弹道轨迹（避免每次射击创建新几何体/材质）
        this._tracerPool = [];
        this._tracerPoolSize = 8;  // 池大小
        // 共享材质（弹道轨迹）
        this.tracerMaterial = new THREE.LineBasicMaterial({
            color: 0xffee88,
            transparent: true,
            opacity: 0.6
        });
        // 共享几何体（弹道轨迹，单位长度，通过scale调整）
        this._tracerGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);

        this.muzzleFlashMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa44,
            transparent: true,
            opacity: 1
        });

        // 共享材质：弹孔（黑色圆点）
        this._bulletHoleMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        // 共享几何体：弹孔
        this._bulletHoleGeometry = new THREE.CircleGeometry(0.05, 8);
        // 共享材质：火花
        this._sparkMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa44,
            transparent: true,
            opacity: 1
        });
        // 共享几何体：火花
        this._sparkGeometry = new THREE.SphereGeometry(0.015, 4, 3);

        // 复用对象（避免每帧创建）
        this._ray = new THREE.Ray();
        this._box = new THREE.Box3();
        this._hitPoint = new THREE.Vector3();
        this._tmpVec = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector3();

        // 初始化对象池
        this._initTracerPool();
    }

    /**
     * 初始化弹道轨迹对象池
     */
    _initTracerPool() {
        for (let i = 0; i < this._tracerPoolSize; i++) {
            const line = new THREE.Line(this._tracerGeometry, this.tracerMaterial);
            line.visible = false;
            line.frustumCulled = false;  // 避免每帧重新计算包围球
            this.scene.add(line);
            this._tracerPool.push({ mesh: line, active: false, life: 0, maxLife: 0.1 });
        }
    }

    /**
     * 从对象池获取弹道轨迹
     */
    _acquireTracer() {
        // 优先复用非活跃的
        for (const t of this._tracerPool) {
            if (!t.active) return t;
        }
        // 池满时复用最旧的（life最小的）
        let oldest = this._tracerPool[0];
        for (const t of this._tracerPool) {
            if (t.life < oldest.life) oldest = t;
        }
        return oldest;
    }

    /**
     * 初始化
     */
    init() {
        // 预创建枪口闪光
        this.muzzleFlash = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 6),
            this.muzzleFlashMaterial
        );
        this.muzzleFlash.visible = false;
        this.muzzleFlash.frustumCulled = false;
        this.scene.add(this.muzzleFlash);

        // 枪口闪光方向光（射击时闪烁照亮环境）
        this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 8, 2);
        this.scene.add(this.muzzleLight);
    }

    /**
     * 应用武器皮肤（修改弹道/枪口闪光/火花颜色）
     * @param {object} skin 皮肤配置 { tracerColor, muzzleColor, ... }
     */
    applySkin(skin) {
        if (!skin) return;
        if (this.tracerMaterial) this.tracerMaterial.color.setHex(skin.tracerColor);
        if (this.muzzleFlashMaterial) this.muzzleFlashMaterial.color.setHex(skin.muzzleColor);
        if (this.muzzleLight) this.muzzleLight.color.setHex(skin.muzzleColor);
        if (this._sparkMaterial) this._sparkMaterial.color.setHex(skin.muzzleColor);
    }

    /**
     * 更新武器
     */
    update(delta, input) {
        // 更新换弹
        if (this.isReloading) {
            const elapsed = (performance.now() - this.reloadStartTime) / 1000;
            if (elapsed >= this.reloadTime) {
                this._finishReload();
            }
        }

        // 更新后坐力恢复
        this.recoilOffset.multiplyScalar(Math.max(0, 1 - this.recoilRecovery * delta));

        // 更新开镜过渡
        this._updateAds(delta);

        // 更新弹道效果
        this._updateTracers(delta);
        this._updateMuzzleFlash(delta);
        // 更新弹孔特效
        this._updateBulletImpacts(delta);
    }

    /**
     * 更新开镜(ADS)过渡
     */
    _updateAds(delta) {
        const target = this.isAiming ? 1 : 0;
        // 平滑过渡
        const diff = target - this._adsProgress;
        this._adsProgress += diff * Math.min(1, this._adsSpeed * delta);
        if (Math.abs(diff) < 0.01) this._adsProgress = target;

        // 应用FOV变化
        const camera = this.cameraController.camera;
        if (camera) {
            const targetFov = this._baseFov / this.adsZoom;
            camera.fov = this._baseFov + (targetFov - this._baseFov) * this._adsProgress;
            camera.updateProjectionMatrix();
        }

        // 应用灵敏度变化（开镜时降低灵敏度）
        const sensMultiplier = 1 - (1 - 1 / this.adsZoom) * this._adsProgress;
        this.cameraController.sensitivity = this._baseSensitivity * sensMultiplier;
    }

    /**
     * 设置开镜状态
     */
    setAiming(aiming) {
        this.isAiming = aiming;
    }

    /**
     * 设置基础FOV（由Game._applySettings调用）
     */
    setBaseFov(fov) {
        this._baseFov = fov;
    }

    /**
     * 设置基础灵敏度（由Game._applySettings调用）
     */
    setBaseSensitivity(sens) {
        this._baseSensitivity = sens;
    }

    /**
     * 计算当前散布（考虑移动和开镜状态）
     * @returns {number} 散布角度（弧度）
     */
    getCurrentSpread() {
        let spread = this.baseSpread;
        // 移动时增加散布
        const speed = Math.sqrt(
            this.player.velocity.x ** 2 + this.player.velocity.z ** 2
        );
        if (speed > 0.5) {
            spread += this.moveSpreadPenalty;
        }
        // 开镜时降低散布
        if (this._adsProgress > 0.5) {
            spread = Math.max(0, spread - this.adsSpreadBonus);
        }
        return spread;
    }

    /**
     * 射击
     * @param {THREE.Scene} scene - 场景
     * @param {Array} targets - 靶标列表
     * @param {THREE.Raycaster} raycaster - 射线检测器
     * @returns {Object} 射击结果
     */
    shoot(scene, targets, raycaster) {
        const now = performance.now() / 1000;

        // 检查是否可以射击
        if (this.isReloading) {
            return { fired: false, empty: false };
        }

        if (now - this.lastShotTime < this.fireRate) {
            return { fired: false, empty: false };
        }

        if (this.ammoInMagazine <= 0) {
            return { fired: false, empty: true };
        }

        // 执行射击
        this.lastShotTime = now;
        this.ammoInMagazine--;

        // 计算射击方向 - 从相机中心向前，并应用散布
        const camera = this.cameraController.camera;
        const origin = this._tmpVec.set(0, 0, 0);
        camera.getWorldPosition(origin);

        const direction = this._tmpVec2.set(0, 0, 0);
        camera.getWorldDirection(direction);

        // 应用散布（随机偏移方向）
        const spread = this.getCurrentSpread();
        if (spread > 0) {
            direction.x += (Math.random() - 0.5) * spread * 2;
            direction.y += (Math.random() - 0.5) * spread * 2;
            direction.z += (Math.random() - 0.5) * spread * 2;
            direction.normalize();
        }

        // 添加后坐力 - 相机抖动
        this._applyRecoil();

        // 创建弹道轨迹
        this._createTracer(origin, direction);

        // 创建枪口闪光
        this._showMuzzleFlash();

        // 射线检测命中
        let hit = false;
        if (raycaster && targets.length > 0) {
            raycaster.set(origin, direction);
            raycaster.far = this.range;

            // 检测命中靶标
            let closestHit = null;
            let closestDistance = this.range;

            for (const target of targets) {
                if (!target.isAlive) continue;
                const result = target.checkHit(raycaster);
                if (result && result.distance < closestDistance) {
                    closestHit = result;
                    closestDistance = result.distance;
                }
            }

            if (closestHit) {
                hit = true;
                // 应用爆头倍率：命中头部时使用武器爆头倍率，否则1.0
                const isHead = closestHit.hitbox && closestHit.hitbox.isHead;
                const multiplier = isHead ? this.headshotMultiplier : 1.0;
                const finalDamage = this.damage * multiplier;
                closestHit.target.takeDamage(finalDamage);
            }
        }

        // 未命中靶标时，检测是否命中墙壁/环境
        if (!hit) {
            const envHit = this._checkEnvironmentHit(origin, direction);
            if (envHit) {
                this._createBulletImpact(envHit.point, envHit.normal);
            }
        }

        return { fired: true, hit, empty: false };
    }

    /**
     * 开始换弹
     */
    startReload() {
        if (this.isReloading) return false;
        if (this.ammoInMagazine >= this.magazineSize) return false;
        if (this.reserveAmmo <= 0) return false;

        this.isReloading = true;
        this.reloadStartTime = performance.now();
        return true;
    }

    /**
     * 完成换弹
     */
    _finishReload() {
        const needed = this.magazineSize - this.ammoInMagazine;
        const toReload = Math.min(needed, this.reserveAmmo);
        this.ammoInMagazine += toReload;
        this.reserveAmmo -= toReload;
        this.isReloading = false;
    }

    /**
     * 应用后坐力
     */
    _applyRecoil() {
        // 相机俯仰角上抬
        this.cameraController.pitch += this.recoilAmount;
        // 随机水平偏移
        this.cameraController.yaw += (Math.random() - 0.5) * this.recoilAmount * 0.5;
        // 触发屏幕震动
        this.cameraController.addShake(0.05);
        // 触发武器后坐力动画（viewmodel向后踢）
        this.cameraController.addRecoil();
    }

    /**
     * 创建弹道轨迹（使用对象池）
     */
    _createTracer(origin, direction) {
        // 计算终点
        const endPoint = origin.clone().addScaledVector(direction, this.range);

        // 从对象池获取
        const tracer = this._acquireTracer();
        const line = tracer.mesh;

        // 设置线段位置
        line.position.copy(origin);
        // 计算朝向和长度
        const dir = endPoint.clone().sub(origin);
        const length = dir.length();
        line.scale.set(1, 1, length);
        // 朝向终点
        line.lookAt(endPoint);

        line.visible = true;
        tracer.active = true;
        tracer.life = 0.1;
        tracer.maxLife = 0.1;
        // 重置材质透明度（共享材质，需在update中按个体调整）
        // 注意：由于共享材质，所有轨迹透明度一致，简化处理
    }

    /**
     * 显示枪口闪光
     */
    _showMuzzleFlash() {
        // 枪口位置 - 角色武器前方
        const playerPos = this.player.position;
        const yaw = this.cameraController.yaw;

        const muzzlePos = new THREE.Vector3(
            playerPos.x + Math.cos(yaw) * 0.6 - Math.sin(yaw) * 0.8,
            playerPos.y + 1.2,
            playerPos.z - Math.sin(yaw) * 0.6 - Math.cos(yaw) * 0.8
        );

        this.muzzleFlash.position.copy(muzzlePos);
        // 闪光更大（scale 1.5-2.5随机）
        this.muzzleFlash.scale.setScalar(1.5 + Math.random() * 1.0);
        this.muzzleFlash.visible = true;
        // 持续时间稍长（0.08秒）
        this.muzzleFlashLife = 0.08;

        // 方向光闪烁（PointLight 闪一下照亮环境）
        this.muzzleLight.position.copy(muzzlePos);
        this.muzzleLight.intensity = 3;
    }

    /**
     * 更新弹道轨迹（对象池版本）
     */
    _updateTracers(delta) {
        // 共享材质透明度统一管理
        let anyActive = false;
        for (const tracer of this._tracerPool) {
            if (!tracer.active) continue;
            anyActive = true;
            tracer.life -= delta;
            if (tracer.life <= 0) {
                tracer.mesh.visible = false;
                tracer.active = false;
            }
        }
        // 统一设置透明度（基于最活跃的轨迹）
        if (anyActive) {
            let maxAlpha = 0;
            for (const tracer of this._tracerPool) {
                if (tracer.active) {
                    const alpha = tracer.life / tracer.maxLife;
                    if (alpha > maxAlpha) maxAlpha = alpha;
                }
            }
            this.tracerMaterial.opacity = maxAlpha * 0.6;
        }
    }

    /**
     * 更新枪口闪光
     */
    _updateMuzzleFlash(delta) {
        if (this.muzzleFlash.visible) {
            this.muzzleFlashLife -= delta;
            if (this.muzzleFlashLife <= 0) {
                this.muzzleFlash.visible = false;
            }
        }
        // 枪口方向光衰减
        if (this.muzzleLight && this.muzzleLight.intensity > 0.01) {
            this.muzzleLight.intensity *= 0.8;
        } else if (this.muzzleLight) {
            this.muzzleLight.intensity = 0;
        }
    }

    /**
     * 获取换弹进度 (0-1)
     */
    getReloadProgress() {
        if (!this.isReloading) return 0;
        const elapsed = (performance.now() - this.reloadStartTime) / 1000;
        return Math.min(1, elapsed / this.reloadTime);
    }

    /**
     * 获取开镜进度 (0-1)
     */
    getAdsProgress() {
        return this._adsProgress;
    }

    /**
     * 检测环境命中（AABB射线相交）
     * @param {THREE.Vector3} origin - 射线起点
     * @param {THREE.Vector3} direction - 射线方向
     * @returns {Object|null} 命中结果 {point, normal, distance}
     */
    _checkEnvironmentHit(origin, direction) {
        // 从CameraController获取环境碰撞体列表
        const colliders = this.cameraController.colliders;
        if (!colliders || colliders.length === 0) return null;

        let closestHit = null;
        let closestDistance = this.range;

        this._ray.origin.copy(origin);
        this._ray.direction.copy(direction);

        for (const collider of colliders) {
            this._box.min.copy(collider.min);
            this._box.max.copy(collider.max);
            const intersection = this._ray.intersectBox(this._box, this._hitPoint);
            if (intersection) {
                const distance = origin.distanceTo(this._hitPoint);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestHit = {
                        point: this._hitPoint.clone(),
                        normal: this._getBoxNormal(this._box, this._hitPoint),
                        distance: distance
                    };
                }
            }
        }

        return closestHit;
    }

    /**
     * 计算AABB命中面法线（根据命中点在盒子上的相对位置）
     * @param {THREE.Box3} box - 包围盒
     * @param {THREE.Vector3} point - 命中点
     * @returns {THREE.Vector3} 法线方向（单位向量）
     */
    _getBoxNormal(box, point) {
        const center = box.getCenter(this._tmpVec);
        const d = this._tmpVec2.copy(point).sub(center);
        const size = box.getSize(this._tmpVec);
        // 归一化到各面（±1表示在该面上）
        const nx = d.x / (size.x / 2);
        const ny = d.y / (size.y / 2);
        const nz = d.z / (size.z / 2);
        const absX = Math.abs(nx);
        const absY = Math.abs(ny);
        const absZ = Math.abs(nz);
        // 最大分量所在面即为命中面
        if (absX > absY && absX > absZ) {
            return new THREE.Vector3(Math.sign(nx), 0, 0);
        } else if (absY > absZ) {
            return new THREE.Vector3(0, Math.sign(ny), 0);
        } else {
            return new THREE.Vector3(0, 0, Math.sign(nz));
        }
    }

    /**
     * 创建弹孔特效（使用共享材质/几何体，限制数量）
     * @param {THREE.Vector3} position - 命中位置
     * @param {THREE.Vector3} normal - 命中面法线
     */
    _createBulletImpact(position, normal) {
        // 达到上限时移除最旧的弹孔
        if (this.bulletImpacts.length >= this._maxBulletImpacts) {
            const oldest = this.bulletImpacts.shift();
            this._disposeBulletImpact(oldest);
        }

        // 弹孔 - 使用共享几何体和材质
        const hole = new THREE.Mesh(this._bulletHoleGeometry, this._bulletHoleMaterial);
        hole.position.copy(position);
        // 让圆面朝向法线方向（背离墙面）
        hole.lookAt(position.clone().sub(normal));
        // 沿法线偏移避免Z-fighting
        hole.position.addScaledVector(normal, 0.01);
        this.scene.add(hole);

        // 火花 - 使用共享几何体和材质（减少数量为3）
        const sparks = [];
        const sparkCount = 3;
        for (let i = 0; i < sparkCount; i++) {
            const spark = new THREE.Mesh(this._sparkGeometry, this._sparkMaterial);
            spark.position.copy(position);
            // 随机散射方向（沿法线反射 + 随机偏移）
            const spread = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            );
            const velocity = normal.clone().multiplyScalar(2).add(spread);
            this.scene.add(spark);
            sparks.push({ mesh: spark, velocity: velocity });
        }

        // 3秒后自动消失（缩短生命，减少累积）
        this.bulletImpacts.push({
            hole: hole,
            sparks: sparks,
            life: 3.0,
            maxLife: 3.0
        });
    }

    /**
     * 销毁单个弹孔特效
     */
    _disposeBulletImpact(impact) {
        this.scene.remove(impact.hole);
        // 共享几何体/材质，不dispose
        for (const spark of impact.sparks) {
            this.scene.remove(spark.mesh);
        }
    }

    /**
     * 更新弹孔特效（火花运动 + 淡出 + 移除）
     */
    _updateBulletImpacts(delta) {
        for (let i = this.bulletImpacts.length - 1; i >= 0; i--) {
            const impact = this.bulletImpacts[i];
            impact.life -= delta;

            // 更新火花运动（散射 + 重力）
            for (const spark of impact.sparks) {
                spark.mesh.position.addScaledVector(spark.velocity, delta);
                spark.velocity.y -= 9.8 * delta;  // 重力
            }

            if (impact.life <= 0) {
                this._disposeBulletImpact(impact);
                this.bulletImpacts.splice(i, 1);
            }

            // 火花在前0.3秒快速淡出（缩短）
            const sparkAlpha = Math.max(0, (impact.life - 2.7) / 0.3);
            // 注意：共享材质，火花透明度统一，这里不单独设置
        }
    }

    /**
     * 重置武器
     */
    reset() {
        this.ammoInMagazine = this.magazineSize;
        // 重置备弹（若未通过武器选择面板配置，保持默认值）
        if (this._defaultReserveAmmo !== undefined) {
            this.reserveAmmo = this._defaultReserveAmmo;
        }
        this.isReloading = false;
        this.lastShotTime = 0;
        this.recoilOffset.set(0, 0, 0);

        // 重置开镜状态
        this.isAiming = false;
        this._adsProgress = 0;

        // 清理弹道效果（对象池重置）
        for (const tracer of this._tracerPool) {
            tracer.mesh.visible = false;
            tracer.active = false;
            tracer.life = 0;
        }
        this.muzzleFlash.visible = false;

        // 清理弹孔特效
        this.bulletImpacts.forEach(impact => this._disposeBulletImpact(impact));
        this.bulletImpacts = [];
    }

    /**
     * 销毁武器（释放资源）
     */
    dispose() {
        // 清理对象池
        for (const tracer of this._tracerPool) {
            this.scene.remove(tracer.mesh);
        }
        this._tracerPool = [];
        // 释放共享几何体
        this._tracerGeometry.dispose();
        this._bulletHoleGeometry.dispose();
        this._sparkGeometry.dispose();
        // 释放共享材质
        this.tracerMaterial.dispose();
        this.muzzleFlashMaterial.dispose();
        this._bulletHoleMaterial.dispose();
        this._sparkMaterial.dispose();
        // 清理弹孔
        this.bulletImpacts.forEach(impact => this._disposeBulletImpact(impact));
        this.bulletImpacts = [];
    }
}
