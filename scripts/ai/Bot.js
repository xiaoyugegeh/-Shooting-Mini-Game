/**
 * Bot.js - 人机AI对手
 * 基于 Monster 的AI框架，但使用枪械射击玩家
 * 拥有：移动、射击、爆头判定、受击、死亡逻辑
 * AI行为：保持中距离、侧移规避、瞄准射击
 */
import * as THREE from 'three';

// Bot 状态枚举
export const BotState = {
    IDLE: 'idle',
    PATROL: 'patrol',
    ENGAGE: 'engage',     // 交战：保持距离射击
    ADVANCE: 'advance',   // 推进：靠近玩家
    RETREAT: 'retreat',   // 后撤：拉开距离
    STAGGER: 'stagger',
    DEAD: 'dead'
};

// 共享资源（多Bot复用，性能优化）
const SHARED = { geometries: null, materials: null };

function initSharedResources() {
    if (SHARED.geometries) return;
    SHARED.geometries = {
        torso: new THREE.BoxGeometry(0.7, 0.9, 0.4),
        head: new THREE.BoxGeometry(0.4, 0.4, 0.4),
        helmet: new THREE.BoxGeometry(0.45, 0.2, 0.45),
        arm: new THREE.BoxGeometry(0.2, 0.8, 0.2),
        leg: new THREE.BoxGeometry(0.25, 0.7, 0.25),
        weaponBody: new THREE.BoxGeometry(0.1, 0.15, 0.6),
        weaponBarrel: new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6),
        muzzle: new THREE.SphereGeometry(0.06, 6, 4)
    };
    SHARED.materials = {
        helmet: new THREE.MeshLambertMaterial({ color: 0x1a2530 }),
        limb: new THREE.MeshLambertMaterial({ color: 0x2a3a4a })
    };
}

export class Bot {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} position 初始位置
     * @param {object} options 配置
     */
    constructor(scene, position, options = {}) {
        initSharedResources();
        this.scene = scene;
        this.id = options.id || 0;
        this.name = options.name || `BOT-${this.id + 1}`;

        // 血量
        this.maxHealth = options.health || 100;
        this.health = this.maxHealth;

        // 武器配置（射击参数）
        this.damage = options.damage || 8;          // 单发伤害（AI需要较低伤害保持平衡）
        this.fireRate = options.fireRate || 0.25;   // 射击间隔
        this.weaponRange = options.range || 60;
        this.spread = options.spread || 0.04;       // AI散布（保证可被躲避）
        this.lastShotTime = 0;

        // 移动
        this.speed = options.speed || 3.5;
        this.position = position.clone();
        this.velocity = new THREE.Vector3();
        this.rotation = 0;
        this.radius = 0.5;
        this.height = 1.8;

        // AI 状态
        this.state = BotState.IDLE;
        this.stateTimer = 0;
        this.isAlive = true;
        this.state = BotState.PATROL;
        this.patrolTarget = null;
        this.patrolRadius = 12;
        this.spawnPosition = position.clone();
        this.detectRange = options.detectRange || 35;
        this.preferredDistance = options.preferredDistance || 15;  // 保持中距离
        this.strafeDir = 1;        // 侧移方向（1/-1）
        this.strafeTimer = 0;
        this.reactionTime = options.reactionTime || 0.4;  // 反应时间

        // 受击状态
        this.hitFlashTime = 0;
        this.deathTime = 0;

        // 回调
        this.onShoot = options.onShoot || null;     // (bot, origin, direction, damage) => {}
        this.onHit = options.onHit || null;         // (damage, bot, isHead) => {}
        this.onDeath = options.onDeath || null;     // (bot) => {}

        // 环境
        this.colliders = options.colliders || [];
        this.game = options.game;

        // 临时向量
        this._tmpDir = new THREE.Vector3();
        this._tmpForward = new THREE.Vector3();
        // 复用对象（避免checkHit每帧创建新Sphere/Vector3导致GC）
        this._checkHeadSphere = new THREE.Sphere(new THREE.Vector3(), 0.35);
        this._checkBodySphere = new THREE.Sphere(new THREE.Vector3(), 0.5);
        this._checkHitPoint = new THREE.Vector3();
        // 枪口闪光计时器（避免setTimeout累积）
        this._muzzleFlashTime = 0;
        // 射击临时向量复用
        this._shootTarget = new THREE.Vector3();
        this._shootDir = new THREE.Vector3();

        // 模型
        this.model = new THREE.Group();
        this._buildModel();
        this.model.position.copy(this.position);
        scene.add(this.model);

        // 命中盒（用于玩家射击判定）
        // 头部命中盒（爆头）
        this.headHitbox = { center: new THREE.Vector3(), radius: 0.35, isHead: true };
        // 身体命中盒
        this.bodyHitbox = { center: new THREE.Vector3(), radius: 0.5, isHead: false };

        // 枪口位置（用于发射射线）
        this.muzzlePosition = new THREE.Vector3();

        // AI降频
        this._aiFrameCount = 0;
        this._aiUpdateInterval = 1;
    }

    /**
     * 构建人形模型（参考Player.js风格，但使用Lambert材质提升性能）
     */
    _buildModel() {
        const G = SHARED.geometries;
        const M = SHARED.materials;

        // 独立材质（用于受击闪烁和队伍颜色识别）
        this.bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x5a1a1a });  // 敌方红色
        this.accentMaterial = new THREE.MeshLambertMaterial({
            color: 0xff4655, emissive: 0xff4655, emissiveIntensity: 0.3
        });
        this.headMaterial = new THREE.MeshLambertMaterial({ color: 0xece8e1 });
        this.allMaterials = [this.bodyMaterial, this.accentMaterial, this.headMaterial];

        // 躯干
        const torso = new THREE.Mesh(G.torso, this.bodyMaterial);
        torso.position.set(0, 1.1, 0);
        this.model.add(torso);

        // 胸前标识（红色，敌方标识）
        const mark = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.15, 0.02),
            this.accentMaterial
        );
        mark.position.set(0, 1.3, 0.21);
        this.model.add(mark);

        // 头部
        const head = new THREE.Mesh(G.head, this.headMaterial);
        head.position.set(0, 1.75, 0);
        this.model.add(head);
        this.head = head;

        // 头盔
        const helmet = new THREE.Mesh(G.helmet, M.helmet);
        helmet.position.set(0, 1.92, 0);
        this.model.add(helmet);

        // 头盔红色条
        const helmetStripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.04, 0.05),
            this.accentMaterial
        );
        helmetStripe.position.set(0, 1.95, 0.22);
        this.model.add(helmetStripe);

        // 四肢
        const leftArm = new THREE.Mesh(G.arm, this.bodyMaterial);
        leftArm.position.set(-0.45, 1.1, 0);
        this.model.add(leftArm);
        this.leftArm = leftArm;

        const rightArm = new THREE.Mesh(G.arm, this.bodyMaterial);
        rightArm.position.set(0.45, 1.1, 0);
        this.model.add(rightArm);
        this.rightArm = rightArm;

        const leftLeg = new THREE.Mesh(G.leg, M.limb);
        leftLeg.position.set(-0.18, 0.35, 0);
        this.model.add(leftLeg);
        this.leftLeg = leftLeg;

        const rightLeg = new THREE.Mesh(G.leg, M.limb);
        rightLeg.position.set(0.18, 0.35, 0);
        this.model.add(rightLeg);
        this.rightLeg = rightLeg;

        // 武器模型（挂在右手前）
        this.weaponGroup = new THREE.Group();
        const weaponBody = new THREE.Mesh(G.weaponBody, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
        this.weaponGroup.add(weaponBody);
        const barrel = new THREE.Mesh(G.weaponBarrel, new THREE.MeshLambertMaterial({ color: 0x333333 }));
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.4);
        this.weaponGroup.add(barrel);
        // 枪口
        const muzzle = new THREE.Mesh(G.muzzle, new THREE.MeshBasicMaterial({ color: 0xffaa44 }));
        muzzle.position.set(0, 0, -0.6);
        muzzle.visible = false;
        this.weaponGroup.add(muzzle);
        this.muzzleFlash = muzzle;

        this.weaponGroup.position.set(0.55, 1.2, 0.3);
        this.model.add(this.weaponGroup);

        // 背包
        const backpack = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.6, 0.2),
            this.bodyMaterial
        );
        backpack.position.set(0, 1.1, -0.25);
        this.model.add(backpack);
    }

    /**
     * 主更新
     * @param {number} delta
     * @param {Player} player
     */
    update(delta, player) {
        if (!this.isAlive) {
            this._updateDeath(delta);
            return;
        }

        // 枪口闪光衰减（替代setTimeout）
        if (this._muzzleFlashTime > 0) {
            this._muzzleFlashTime -= delta;
            if (this._muzzleFlashTime <= 0 && this.muzzleFlash) {
                this.muzzleFlash.visible = false;
            }
        }

        // 受击闪烁恢复
        if (this.hitFlashTime > 0) {
            this.hitFlashTime -= delta;
            const intensity = Math.max(0, this.hitFlashTime / 0.15) * 1.5;
            this.bodyMaterial.emissive.setHex(0xffffff);
            this.bodyMaterial.emissiveIntensity = intensity;
            if (this.hitFlashTime <= 0) {
                this.bodyMaterial.emissive.setHex(0x000000);
            }
        }

        // 计算到玩家2D距离
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const distance2D = Math.sqrt(dx * dx + dz * dz);

        // AI降频：远距离每2帧更新状态机
        this._aiFrameCount++;
        if (distance2D > 25) {
            this._aiUpdateInterval = 2;
        } else {
            this._aiUpdateInterval = 1;
        }
        const shouldUpdateAI = (this._aiFrameCount % this._aiUpdateInterval === 0);

        // 状态机
        if (shouldUpdateAI) {
            this.stateTimer += delta * this._aiUpdateInterval;
            switch (this.state) {
                case BotState.IDLE:
                    this._updateIdle(delta, distance2D);
                    break;
                case BotState.PATROL:
                    this._updatePatrol(delta, distance2D);
                    break;
                case BotState.ENGAGE:
                    this._updateEngage(delta, player, distance2D, dx, dz);
                    break;
                case BotState.ADVANCE:
                    this._updateAdvance(delta, player, distance2D, dx, dz);
                    break;
                case BotState.RETREAT:
                    this._updateRetreat(delta, player, distance2D, dx, dz);
                    break;
                case BotState.STAGGER:
                    this._updateStagger(delta);
                    break;
            }
        }

        // 移动和模型更新每帧执行（保证平滑）
        this._applyMovement(delta);
        this._updateModel(delta);
        this._updateHitboxes();
    }

    _updateIdle(delta, distanceToPlayer) {
        if (distanceToPlayer < this.detectRange) {
            this._setState(BotState.ENGAGE);
        } else if (this.stateTimer > 2) {
            this._chooseNewPatrolTarget();
            this._setState(BotState.PATROL);
        }
    }

    _updatePatrol(delta, distanceToPlayer) {
        if (distanceToPlayer < this.detectRange) {
            this._setState(BotState.ENGAGE);
            return;
        }
        // 朝巡逻点移动（半速）
        if (this.patrolTarget) {
            const tdx = this.patrolTarget.x - this.position.x;
            const tdz = this.patrolTarget.z - this.position.z;
            const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
            if (tdist < 1) {
                this._setState(BotState.IDLE);
            } else {
                this._tmpDir.set(tdx, 0, tdz).normalize();
                this.velocity.x += this._tmpDir.x * this.speed * 0.5 * delta * 10;
                this.velocity.z += this._tmpDir.z * this.speed * 0.5 * delta * 10;
                this.rotation = Math.atan2(tdx, tdz);
            }
        }
    }

    /**
     * 交战状态：保持中距离，侧移规避，射击玩家
     */
    _updateEngage(delta, player, distanceToPlayer, dx, dz) {
        // 朝向玩家
        this.rotation = Math.atan2(dx, dz);

        // 距离过远 → 推进
        if (distanceToPlayer > this.preferredDistance + 5) {
            this._setState(BotState.ADVANCE);
            return;
        }
        // 距离过近 → 后撤
        if (distanceToPlayer < this.preferredDistance - 5) {
            this._setState(BotState.RETREAT);
            return;
        }

        // 侧移规避（每隔1.5-3秒切换方向）
        this.strafeTimer -= delta;
        if (this.strafeTimer <= 0) {
            this.strafeDir = Math.random() > 0.5 ? 1 : -1;
            this.strafeTimer = 1.5 + Math.random() * 1.5;
        }
        // 侧移方向（垂直于玩家方向）
        const forwardX = Math.sin(this.rotation);
        const forwardZ = Math.cos(this.rotation);
        const rightX = forwardZ;   // 右方 = forward 旋转90度
        const rightZ = -forwardX;
        this.velocity.x += rightX * this.speed * 0.7 * this.strafeDir * delta * 10;
        this.velocity.z += rightZ * this.speed * 0.7 * this.strafeDir * delta * 10;

        // 射击逻辑（受反应时间限制）
        const now = performance.now() / 1000;
        if (now - this.lastShotTime > this.fireRate && distanceToPlayer < this.weaponRange) {
            // 视线检测：前方无遮挡才能射击
            if (!this._isForwardBlocked(dx, dz, distanceToPlayer)) {
                this._shootAtPlayer(player);
                this.lastShotTime = now;
            }
        }
    }

    /**
     * 推进：朝玩家移动
     */
    _updateAdvance(delta, player, distanceToPlayer, dx, dz) {
        this.rotation = Math.atan2(dx, dz);
        if (distanceToPlayer < this.preferredDistance) {
            this._setState(BotState.ENGAGE);
            return;
        }
        // 朝玩家移动（满速）
        this._tmpDir.set(dx, 0, dz).normalize();
        this.velocity.x += this._tmpDir.x * this.speed * delta * 10;
        this.velocity.z += this._tmpDir.z * this.speed * delta * 10;
        // 推进中也射击
        const now = performance.now() / 1000;
        if (now - this.lastShotTime > this.fireRate * 1.5 && distanceToPlayer < this.weaponRange) {
            this._shootAtPlayer(player);
            this.lastShotTime = now;
        }
    }

    /**
     * 后撤：远离玩家
     */
    _updateRetreat(delta, player, distanceToPlayer, dx, dz) {
        this.rotation = Math.atan2(dx, dz);
        if (distanceToPlayer > this.preferredDistance) {
            this._setState(BotState.ENGAGE);
            return;
        }
        // 远离玩家
        this._tmpDir.set(-dx, 0, -dz).normalize();
        this.velocity.x += this._tmpDir.x * this.speed * 0.8 * delta * 10;
        this.velocity.z += this._tmpDir.z * this.speed * 0.8 * delta * 10;
        // 后撤时也射击（精度降低）
        const now = performance.now() / 1000;
        if (now - this.lastShotTime > this.fireRate * 1.8 && distanceToPlayer < this.weaponRange) {
            this._shootAtPlayer(player);
            this.lastShotTime = now;
        }
    }

    _updateStagger(delta) {
        // 减速
        this.velocity.multiplyScalar(0.85);
        if (this.stateTimer > 0.2) {
            this._setState(BotState.ENGAGE);
        }
    }

    /**
     * 向玩家射击（应用散布，调用onShoot回调让战斗系统处理伤害判定）
     */
    _shootAtPlayer(player) {
        // 枪口位置
        this.muzzlePosition.set(
            this.position.x + Math.sin(this.rotation) * 0.5,
            this.position.y + 1.4,
            this.position.z + Math.cos(this.rotation) * 0.5
        );
        // 朝玩家方向（瞄准胸部高度）- 复用临时向量
        this._shootTarget.set(
            player.position.x,
            player.position.y + 1.0,  // 瞄准胸部
            player.position.z
        );
        this._shootDir.subVectors(this._shootTarget, this.muzzlePosition).normalize();
        // 应用散布（AI不完美瞄准）
        this._shootDir.x += (Math.random() - 0.5) * this.spread * 2;
        this._shootDir.y += (Math.random() - 0.5) * this.spread;
        this._shootDir.z += (Math.random() - 0.5) * this.spread * 2;
        this._shootDir.normalize();

        // 枪口闪光（使用计时器替代setTimeout，避免定时器累积）
        if (this.muzzleFlash) {
            this.muzzleFlash.visible = true;
            this._muzzleFlashTime = 0.05;
        }

        // 调用回调（战斗系统处理射线检测和玩家伤害）- clone避免后续修改影响
        if (this.onShoot) {
            this.onShoot(this, this.muzzlePosition.clone(), this._shootDir.clone(), this.damage);
        }
    }

    /**
     * 检测前方是否被墙壁阻挡（简化版：检查colliders）
     */
    _isForwardBlocked(dx, dz, distance) {
        if (!this.colliders || this.colliders.length === 0) return false;
        const dirX = dx / distance;
        const dirZ = dz / distance;
        const checkDist = 2.0;
        const checkX = this.position.x + dirX * checkDist;
        const checkZ = this.position.z + dirZ * checkDist;
        for (let i = 0; i < this.colliders.length; i++) {
            const c = this.colliders[i];
            if (checkX > c.min.x - this.radius && checkX < c.max.x + this.radius &&
                checkZ > c.min.z - this.radius && checkZ < c.max.z + this.radius) {
                return true;
            }
        }
        return false;
    }

    _applyMovement(delta) {
        // 应用速度
        this.position.x += this.velocity.x * delta;
        this.position.z += this.velocity.z * delta;
        // 摩擦
        this.velocity.multiplyScalar(0.88);
        // 边界约束
        const bound = 45;
        this.position.x = Math.max(-bound, Math.min(bound, this.position.x));
        this.position.z = Math.max(-bound, Math.min(bound, this.position.z));
        // 碰撞处理
        this._handleCollisions();
    }

    _handleCollisions() {
        const r = this.radius;
        const px = this.position.x;
        const pz = this.position.z;
        for (let i = 0; i < this.colliders.length; i++) {
            const c = this.colliders[i];
            if (px + r > c.min.x && px - r < c.max.x &&
                pz + r > c.min.z && pz - r < c.max.z) {
                // 计算各轴穿透深度
                const overlapX = Math.min(px + r - c.min.x, c.max.x - (px - r));
                const overlapZ = Math.min(pz + r - c.min.z, c.max.z - (pz - r));
                // 选最小穿透轴修正
                if (overlapX < overlapZ) {
                    if (px < (c.min.x + c.max.x) / 2) {
                        this.position.x = c.min.x - r;
                    } else {
                        this.position.x = c.max.x + r;
                    }
                    this.velocity.x = 0;
                } else {
                    if (pz < (c.min.z + c.max.z) / 2) {
                        this.position.z = c.min.z - r;
                    } else {
                        this.position.z = c.max.z + r;
                    }
                    this.velocity.z = 0;
                }
            }
        }
    }

    _updateModel(delta) {
        this.model.position.copy(this.position);
        this.model.rotation.y = this.rotation + Math.PI;  // 模型默认面朝+Z需旋转180°
        // 行走动画（四肢摆动）
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (speed > 0.5) {
            const swing = Math.sin(performance.now() * 0.01) * 0.3;
            if (this.leftLeg) this.leftLeg.rotation.x = swing;
            if (this.rightLeg) this.rightLeg.rotation.x = -swing;
            if (this.leftArm) this.leftArm.rotation.x = -swing * 0.5;
        }
    }

    /**
     * 更新命中盒位置（用于玩家射线检测）
     */
    _updateHitboxes() {
        // 头部命中盒（位置在头部附近）
        this.headHitbox.center.set(
            this.position.x,
            this.position.y + 1.75,
            this.position.z
        );
        // 身体命中盒
        this.bodyHitbox.center.set(
            this.position.x,
            this.position.y + 1.1,
            this.position.z
        );
    }

    /**
     * 检查玩家射线是否命中本Bot（球体射线相交）
     * @param {THREE.Raycaster} raycaster
     * @param {number} range
     * @returns {object|null} { distance, point, target, hitbox, isHead }
     */
    checkHit(raycaster, range) {
        if (!this.isAlive) return null;
        // 复用Sphere对象避免GC（仅更新center，radius在构造时已设置）
        this._checkHeadSphere.center.copy(this.headHitbox.center);
        const headHit = raycaster.ray.intersectSphere(this._checkHeadSphere, this._checkHitPoint);
        if (headHit) {
            const dist = raycaster.ray.origin.distanceTo(headHit);
            if (dist <= range) {
                return { distance: dist, point: headHit.clone(), target: this, hitbox: this.headHitbox, isHead: true };
            }
        }
        // 检查身体命中盒
        this._checkBodySphere.center.copy(this.bodyHitbox.center);
        const bodyHit = raycaster.ray.intersectSphere(this._checkBodySphere, this._checkHitPoint);
        if (bodyHit) {
            const dist = raycaster.ray.origin.distanceTo(bodyHit);
            if (dist <= range) {
                return { distance: dist, point: bodyHit.clone(), target: this, hitbox: this.bodyHitbox, isHead: false };
            }
        }
        return null;
    }

    /**
     * 受到伤害
     * @param {number} amount 伤害值
     * @param {boolean} isHeadshot 是否爆头
     * @returns {boolean} 是否被击杀
     */
    takeDamage(amount, isHeadshot = false) {
        if (!this.isAlive) return false;
        this.health -= amount;
        this.hitFlashTime = 0.15;
        if (this.onHit) this.onHit(amount, this, isHeadshot);
        if (this.health <= 0) {
            this._die();
            return true;
        }
        // 受击后进入硬直
        if (this.state !== BotState.ENGAGE) {
            this._setState(BotState.STAGGER);
        }
        return false;
    }

    _die() {
        this.isAlive = false;
        this.state = BotState.DEAD;
        this.deathTime = 0;
        if (this.onDeath) this.onDeath(this);
    }

    _updateDeath(delta) {
        this.deathTime += delta;
        // 倒地动画
        const t = Math.min(this.deathTime / 0.8, 1);
        this.model.rotation.x = t * Math.PI / 2;
        // 颜色变暗
        const dim = 1 - t * 0.7;
        this.bodyMaterial.color.multiplyScalar(0.99);
        // 1.5秒后隐藏模型
        if (this.deathTime > 1.5) {
            this.model.visible = false;
        }
    }

    _setState(newState) {
        this.state = newState;
        this.stateTimer = 0;
    }

    _chooseNewPatrolTarget() {
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * this.patrolRadius;
        this.patrolTarget = new THREE.Vector3(
            this.spawnPosition.x + Math.cos(angle) * dist,
            0,
            this.spawnPosition.z + Math.sin(angle) * dist
        );
    }

    reset() {
        this.isAlive = true;
        this.health = this.maxHealth;
        this.state = BotState.PATROL;
        this.position.copy(this.spawnPosition);
        this.velocity.set(0, 0, 0);
        this.model.visible = true;
        this.model.rotation.set(0, 0, 0);
        this.bodyMaterial.color.setHex(0x5a1a1a);
        this.bodyMaterial.emissive.setHex(0x000000);
        this._chooseNewPatrolTarget();
    }

    dispose() {
        this.isAlive = false;
        this.state = BotState.DEAD;
        // 释放独立材质（共享几何体/材质不释放）
        this.allMaterials.forEach(m => m.dispose());
        if (this.model.parent) this.model.parent.remove(this.model);
    }
}
