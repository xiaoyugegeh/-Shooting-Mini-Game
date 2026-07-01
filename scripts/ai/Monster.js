/**
 * Monster.js - 敌对怪兽AI
 * 状态机驱动：巡逻 → 追逐 → 攻击 → 死亡
 * 参考tps-controls的物理移动与chasergit/gear的战斗反馈
 */
import * as THREE from 'three';

// AI状态枚举
export const MonsterState = {
    IDLE: 'idle',
    PATROL: 'patrol',
    CHASE: 'chase',
    ATTACK: 'attack',
    STAGGER: 'stagger',
    DEAD: 'dead'
};

// 怪兽共享资源（所有实例复用，避免每只怪兽都创建独立geometry/material）
// 性能优化：10只怪兽从80个geometry+60个材质 降至 0个geometry+20个材质
const SHARED = {
    geometries: null,
    materials: null
};

function initSharedResources() {
    if (SHARED.geometries) return;
    SHARED.geometries = {
        torso: new THREE.BoxGeometry(1.0, 1.2, 0.6),
        head: new THREE.BoxGeometry(0.6, 0.5, 0.6),
        eye: new THREE.SphereGeometry(0.08, 6, 6),
        horn: new THREE.ConeGeometry(0.08, 0.4, 4),
        arm: new THREE.BoxGeometry(0.25, 0.9, 0.25),
        claw: new THREE.ConeGeometry(0.06, 0.25, 4),
        leg: new THREE.BoxGeometry(0.3, 0.7, 0.3),
        core: new THREE.SphereGeometry(0.15, 6, 6)
    };
    // 共享材质（不需要单独修改的部件）
    // 使用MeshLambertMaterial替代MeshStandardMaterial（性能更好，无PBR计算）
    SHARED.materials = {
        eye: new THREE.MeshLambertMaterial({
            color: 0xff3300,
            emissive: 0xff3300,
            emissiveIntensity: 2.0
        }),
        horn: new THREE.MeshLambertMaterial({
            color: 0x2a1a0a
        }),
        claw: new THREE.MeshLambertMaterial({
            color: 0xeeeeee
        }),
        core: new THREE.MeshLambertMaterial({
            color: 0xff4655,
            emissive: 0xff4655,
            emissiveIntensity: 1.5
        })
    };
}

export class Monster {
    constructor(scene, position, options = {}) {
        this.scene = scene;
        this.spawnPosition = position.clone();

        // 属性配置
        this.id = options.id || 0;
        this.maxHealth = options.health || 60;
        this.health = this.maxHealth;
        this.damage = options.damage || 15;
        this.moveSpeed = options.speed || 3.5;
        this.attackRange = options.attackRange || 2.0;
        this.detectRange = options.detectRange || 20;
        this.attackCooldown = options.attackCooldown || 1.5;

        // AI状态
        this.state = MonsterState.IDLE;
        this.stateTimer = 0;
        this.lastAttackTime = 0;
        this.patrolTarget = null;
        this.patrolRadius = 8;

        // 物理
        this.position = position.clone();
        this.velocity = new THREE.Vector3();
        this.rotation = 0;
        this.radius = 0.6;
        this.height = 1.8;

        // 状态标记
        this.isAlive = true;
        this.hitFlashTime = 0;
        this.deathTime = 0;
        this.attackAnimTime = 0;
        this.isAttacking = false;
        this.isTelegraphing = false;  // 攻击预警标记
        this.telegraphTime = 0;

        // 回调
        this.onAttack = options.onAttack || (() => {});
        this.onHit = options.onHit || (() => {});
        this.onDeath = options.onDeath || (() => {});

        // 模型
        this.model = new THREE.Group();
        this._buildModel();

        // 碰撞盒引用
        this.colliders = options.colliders || [];

        // 游戏引用（用于暂停/结束状态检查）
        this.game = options.game || null;

        // 临时向量复用（避免每帧GC）
        this._tmpDir = new THREE.Vector3();

        // AI降频：远距离怪兽降低更新频率（性能优化）
        this._aiUpdateInterval = 1;  // AI更新间隔（帧数），1=每帧更新
        this._aiFrameCount = 0;
    }

    /**
     * 初始化
     */
    init() {
        this.scene.add(this.model);
        this.model.position.copy(this.position);
        this._chooseNewPatrolTarget();
        // 生成时的粒子爆发特效（红色烟雾扩散）
        this._playSpawnEffect();
    }

    /**
     * 构建怪兽模型 - 低多边形凶猛造型（使用共享资源优化性能）
     */
    _buildModel() {
        // 确保共享资源已初始化
        initSharedResources();
        const G = SHARED.geometries;
        const M = SHARED.materials;

        // 每只怪兽独立的body/dark材质（用于命中闪烁，需单独修改）
        // 使用MeshLambertMaterial替代MeshStandardMaterial（性能更好）
        const bodyMat = new THREE.MeshLambertMaterial({
            color: 0x4a1a1a
        });
        this.bodyMaterial = bodyMat;

        const darkMat = new THREE.MeshLambertMaterial({
            color: 0x1a0a0a
        });
        this.darkMaterial = darkMat;

        // 身体（躯干）
        const torso = new THREE.Mesh(G.torso, bodyMat);
        torso.position.y = 1.1;
        torso.castShadow = true;
        this.model.add(torso);
        this.torso = torso;

        // 头部
        const head = new THREE.Mesh(G.head, bodyMat);
        head.position.y = 1.95;
        head.castShadow = true;
        this.model.add(head);
        this.head = head;

        // 眼睛（发光，共享材质）
        const leftEye = new THREE.Mesh(G.eye, M.eye);
        leftEye.position.set(-0.15, 2.0, 0.3);
        leftEye.castShadow = false;
        this.model.add(leftEye);
        this.leftEye = leftEye;

        const rightEye = new THREE.Mesh(G.eye, M.eye);
        rightEye.position.set(0.15, 2.0, 0.3);
        rightEye.castShadow = false;
        this.model.add(rightEye);
        this.rightEye = rightEye;

        // 尖角（共享材质和几何体）
        const leftHorn = new THREE.Mesh(G.horn, M.horn);
        leftHorn.position.set(-0.2, 2.3, 0);
        leftHorn.rotation.z = -0.2;
        leftHorn.castShadow = false;
        this.model.add(leftHorn);

        const rightHorn = new THREE.Mesh(G.horn, M.horn);
        rightHorn.position.set(0.2, 2.3, 0);
        rightHorn.rotation.z = 0.2;
        rightHorn.castShadow = false;
        this.model.add(rightHorn);

        // 手臂
        const leftArm = new THREE.Mesh(G.arm, darkMat);
        leftArm.position.set(-0.65, 1.1, 0);
        leftArm.castShadow = true;
        this.model.add(leftArm);
        this.leftArm = leftArm;

        const rightArm = new THREE.Mesh(G.arm, darkMat);
        rightArm.position.set(0.65, 1.1, 0);
        rightArm.castShadow = true;
        this.model.add(rightArm);
        this.rightArm = rightArm;

        // 爪子（共享材质和几何体）
        const leftClaw = new THREE.Mesh(G.claw, M.claw);
        leftClaw.position.set(-0.65, 0.55, 0.15);
        leftClaw.rotation.x = Math.PI;
        leftClaw.castShadow = false;
        this.model.add(leftClaw);

        const rightClaw = new THREE.Mesh(G.claw, M.claw);
        rightClaw.position.set(0.65, 0.55, 0.15);
        rightClaw.rotation.x = Math.PI;
        rightClaw.castShadow = false;
        this.model.add(rightClaw);

        // 腿部
        const leftLeg = new THREE.Mesh(G.leg, darkMat);
        leftLeg.position.set(-0.25, 0.35, 0);
        leftLeg.castShadow = true;
        this.model.add(leftLeg);
        this.leftLeg = leftLeg;

        const rightLeg = new THREE.Mesh(G.leg, darkMat);
        rightLeg.position.set(0.25, 0.35, 0);
        rightLeg.castShadow = true;
        this.model.add(rightLeg);
        this.rightLeg = rightLeg;

        // 胸口红色核心（共享材质）
        const core = new THREE.Mesh(G.core, M.core);
        core.position.set(0, 1.3, 0.31);
        core.castShadow = false;
        this.model.add(core);
        this.core = core;

        // 独立材质引用（用于命中闪烁，只释放这些）
        this.allMaterials = [bodyMat, darkMat];
    }

    /**
     * 更新怪兽AI
     */
    update(delta, player) {
        // 生成特效更新（独立于存活状态，确保1秒后消失）
        this._updateSpawnEffect(delta);

        if (!this.isAlive) {
            this._updateDeath(delta);
            return;
        }

        // 命中闪烁恢复
        if (this.hitFlashTime > 0) {
            this.hitFlashTime -= delta;
            const flash = Math.max(0, this.hitFlashTime / 0.15);
            this.bodyMaterial.emissive.setRGB(flash, 0, 0);
            this.bodyMaterial.emissiveIntensity = flash * 2;
        }

        // 攻击动画
        if (this.isAttacking) {
            this._updateAttackAnimation(delta);
        }

        // 使用平方距离避免sqrt（性能优化）
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const distSq = dx * dx + dz * dz;
        const distanceToPlayer = Math.sqrt(distSq);

        // AI降频：远距离怪兽降低状态机更新频率（性能优化）
        // 近距离(<=15米)每帧更新，中距离(15-30米)每2帧，远距离(>30米)每3帧
        if (distanceToPlayer <= 15) {
            this._aiUpdateInterval = 1;
        } else if (distanceToPlayer <= 30) {
            this._aiUpdateInterval = 2;
        } else {
            this._aiUpdateInterval = 3;
        }

        this._aiFrameCount++;
        const shouldUpdateAI = this._aiFrameCount >= this._aiUpdateInterval;
        if (shouldUpdateAI) {
            this._aiFrameCount = 0;
            // 状态机
            this.stateTimer += delta * this._aiUpdateInterval;  // 补偿降频的时间步进
            switch (this.state) {
                case MonsterState.IDLE:
                    this._updateIdle(delta * this._aiUpdateInterval, distanceToPlayer);
                    break;
                case MonsterState.PATROL:
                    this._updatePatrol(delta * this._aiUpdateInterval, distanceToPlayer);
                    break;
                case MonsterState.CHASE:
                    this._updateChase(delta * this._aiUpdateInterval, player, distanceToPlayer, dx, dz);
                    break;
                case MonsterState.ATTACK:
                    this._updateAttack(delta * this._aiUpdateInterval, player, distanceToPlayer, dx, dz);
                    break;
                case MonsterState.STAGGER:
                    this._updateStagger(delta * this._aiUpdateInterval);
                    break;
            }
        }

        // 应用物理（每帧执行，保证移动平滑）
        this._applyMovement(delta);
        this._updateModel();
    }

    /**
     * 待机状态
     */
    _updateIdle(delta, distanceToPlayer) {
        if (distanceToPlayer < this.detectRange) {
            this._setState(MonsterState.CHASE);
            return;
        }
        if (this.stateTimer > 2) {
            this._chooseNewPatrolTarget();
            this._setState(MonsterState.PATROL);
        }
    }

    /**
     * 巡逻状态
     */
    _updatePatrol(delta, distanceToPlayer) {
        if (distanceToPlayer < this.detectRange) {
            this._setState(MonsterState.CHASE);
            return;
        }

        if (this.patrolTarget) {
            // 复用临时向量
            const dir = this._tmpDir;
            dir.set(
                this.patrolTarget.x - this.position.x,
                0,
                this.patrolTarget.z - this.position.z
            );
            const distance = Math.sqrt(dir.x * dir.x + dir.z * dir.z);

            if (distance < 1) {
                this._setState(MonsterState.IDLE);
            } else {
                const inv = 1 / distance;
                this.velocity.x = dir.x * inv * this.moveSpeed * 0.5;
                this.velocity.z = dir.z * inv * this.moveSpeed * 0.5;
                this.rotation = Math.atan2(dir.x, dir.z);
            }
        }
    }

    /**
     * 追逐状态
     */
    _updateChase(delta, player, distanceToPlayer, dx, dz) {
        if (distanceToPlayer > this.detectRange * 1.5) {
            this._setState(MonsterState.PATROL);
            return;
        }

        if (distanceToPlayer < this.attackRange) {
            this._setState(MonsterState.ATTACK);
            return;
        }

        // 朝玩家移动（复用临时向量，避免clone）
        const dir = this._tmpDir;
        dir.set(dx, 0, dz);
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.001) {
            const inv = 1 / len;
            let moveX = dir.x * inv;
            let moveZ = dir.z * inv;

            // 墙壁规避：前方被阻挡时侧移绕行
            if (this._checkForwardBlocked(moveX, moveZ)) {
                // 旋转45度绕行（向右侧移）
                const cos45 = 0.7071;
                const sin45 = 0.7071;
                const sideX = moveX * cos45 + moveZ * sin45;
                const sideZ = moveZ * cos45 - moveX * sin45;
                moveX = sideX;
                moveZ = sideZ;
            }

            this.velocity.x = moveX * this.moveSpeed;
            this.velocity.z = moveZ * this.moveSpeed;
            // 仍朝向玩家（不随侧移转向）
            this.rotation = Math.atan2(dx, dz);
        }
    }

    /**
     * 检测前方是否被墙阻挡
     */
    _checkForwardBlocked(dirX, dirZ) {
        const checkDist = 1.5;
        const checkX = this.position.x + dirX * checkDist;
        const checkZ = this.position.z + dirZ * checkDist;
        const r = this.radius;

        for (const collider of this.colliders) {
            if (collider.min.y > this.position.y + this.height) continue;
            if (collider.max.y < this.position.y) continue;
            if (checkX + r > collider.min.x && checkX - r < collider.max.x &&
                checkZ + r > collider.min.z && checkZ - r < collider.max.z) {
                return true;
            }
        }
        return false;
    }

    /**
     * 攻击状态
     */
    _updateAttack(delta, player, distanceToPlayer, dx, dz) {
        const now = performance.now() / 1000;

        if (distanceToPlayer > this.attackRange * 1.2) {
            this._setState(MonsterState.CHASE);
            return;
        }

        // 朝向玩家
        this.rotation = Math.atan2(dx, dz);

        // 停止移动
        this.velocity.x *= 0.5;
        this.velocity.z *= 0.5;

        // 攻击冷却
        if (now - this.lastAttackTime > this.attackCooldown && !this.isAttacking) {
            this._performAttack(player);
        }
    }

    /**
     * 执行攻击
     */
    _performAttack(player) {
        this.isAttacking = true;
        this.attackAnimTime = 0;
        this.lastAttackTime = performance.now() / 1000;

        // 攻击预警（0.3秒红色闪烁）
        this._telegraphAttack();

        // 攻击判定（在预警结束后触发）
        setTimeout(() => {
            if (!this.isAlive) return;
            // 游戏暂停或结束时跳过攻击判定（setTimeout不受暂停影响，需显式检查）
            if (this.game && (this.game.state.phase !== 'playing' || (this.game.combatSystem && this.game.combatSystem.isGameOver))) return;
            // 使用2D距离判定（与进入攻击状态的判定一致，避免跳跃躲避）
            const dx = player.position.x - this.position.x;
            const dz = player.position.z - this.position.z;
            const distance2D = Math.sqrt(dx * dx + dz * dz);
            if (distance2D < this.attackRange * 1.3) {
                this.onAttack(this.damage, this);
            }
        }, 300);
    }

    /**
     * 攻击预警效果（身体闪烁红色，emissive增强）
     */
    _telegraphAttack() {
        this.isTelegraphing = true;
        this.telegraphTime = 0;
        this.bodyMaterial.emissive.setRGB(1, 0, 0);
        this.bodyMaterial.emissiveIntensity = 3;
    }

    /**
     * 更新攻击动画
     */
    _updateAttackAnimation(delta) {
        this.attackAnimTime += delta;
        const duration = 0.5;
        const t = this.attackAnimTime / duration;

        // 预警阶段（前0.3秒）红色闪烁
        if (this.isTelegraphing) {
            this.telegraphTime += delta;
            const flash = Math.sin(this.telegraphTime * 30) * 0.5 + 0.5;
            this.bodyMaterial.emissiveIntensity = 2 + flash * 2;
            if (this.telegraphTime >= 0.3) {
                this.isTelegraphing = false;
                // 恢复颜色
                this.bodyMaterial.emissive.setRGB(0, 0, 0);
                this.bodyMaterial.emissiveIntensity = 0;
            }
        }

        if (t >= 1) {
            this.isAttacking = false;
            this.rightArm.rotation.x = 0;
            this.leftArm.rotation.x = 0;
            // 确保预警颜色恢复
            this.bodyMaterial.emissive.setRGB(0, 0, 0);
            this.bodyMaterial.emissiveIntensity = 0;
            return;
        }

        // 挥爪动画
        const swing = Math.sin(t * Math.PI) * 1.2;
        this.rightArm.rotation.x = -swing;
        this.leftArm.rotation.x = -swing * 0.7;
    }

    /**
     * 硬直状态
     */
    _updateStagger(delta) {
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
        if (this.stateTimer > 0.3) {
            this._setState(MonsterState.CHASE);
        }
    }

    /**
     * 应用移动
     */
    _applyMovement(delta) {
        this.position.x += this.velocity.x * delta;
        this.position.z += this.velocity.z * delta;

        // 摩擦
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;

        // 边界约束
        const bound = 45;
        this.position.x = Math.max(-bound, Math.min(bound, this.position.x));
        this.position.z = Math.max(-bound, Math.min(bound, this.position.z));

        // 简单碰撞检测（与建筑）
        this._handleCollisions();
    }

    /**
     * 碰撞处理（优化：避免每帧创建Vector3，直接用标量计算）
     */
    _handleCollisions() {
        const px = this.position.x;
        const pz = this.position.z;
        const r = this.radius;

        for (const collider of this.colliders) {
            if (collider.min.y > this.position.y + this.height) continue;
            if (collider.max.y < this.position.y) continue;

            // AABB重叠检测（直接标量比较，不创建对象）
            const minX = px - r;
            const maxX = px + r;
            const minZ = pz - r;
            const maxZ = pz + r;

            if (maxX > collider.min.x && minX < collider.max.x &&
                maxZ > collider.min.z && minZ < collider.max.z) {
                const overlapX = Math.min(maxX - collider.min.x, collider.max.x - minX);
                const overlapZ = Math.min(maxZ - collider.min.z, collider.max.z - minZ);

                if (overlapX < overlapZ) {
                    if (px < (collider.min.x + collider.max.x) * 0.5) {
                        this.position.x = collider.min.x - r;
                    } else {
                        this.position.x = collider.max.x + r;
                    }
                } else {
                    if (pz < (collider.min.z + collider.max.z) * 0.5) {
                        this.position.z = collider.min.z - r;
                    } else {
                        this.position.z = collider.max.z + r;
                    }
                }
            }
        }
    }

    /**
     * 更新模型
     */
    _updateModel() {
        this.model.position.copy(this.position);
        this.model.rotation.y = this.rotation;

        // 行走动画
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (speed > 0.5 && !this.isAttacking) {
            const t = performance.now() * 0.008;
            const swing = Math.sin(t) * 0.4;
            this.leftLeg.rotation.x = swing;
            this.rightLeg.rotation.x = -swing;
            this.leftArm.rotation.x = -swing * 0.5;
            this.rightArm.rotation.x = swing * 0.5;
        } else if (!this.isAttacking) {
            this.leftLeg.rotation.x *= 0.8;
            this.rightLeg.rotation.x *= 0.8;
        }

        // 核心脉动（使用共享材质，所有怪兽同步脉动，只需修改一次）
        const pulse = Math.sin(performance.now() * 0.005) * 0.3 + 1.2;
        SHARED.materials.core.emissiveIntensity = pulse;
    }

    /**
     * 生成特效（红色烟雾粒子爆发，持续1秒）
     */
    _playSpawnEffect() {
        const particleCount = 15;  // 减少粒子数量(原30)提升性能
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0.5;
            positions[i * 3 + 2] = 0;
            // 随机扩散方向（水平环形 + 向上）
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 2;
            velocities.push(new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * 2,
                Math.sin(angle) * speed
            ));
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0xff3300,
            size: 0.3,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const particles = new THREE.Points(geometry, material);
        particles.position.copy(this.position);
        this.scene.add(particles);

        this._spawnEffect = {
            particles,
            velocities,
            time: 0,
            duration: 1.0
        };
    }

    /**
     * 更新生成特效（粒子扩散 + 淡出）
     */
    _updateSpawnEffect(delta) {
        if (!this._spawnEffect) return;
        const effect = this._spawnEffect;
        effect.time += delta;
        const t = effect.time / effect.duration;

        if (t >= 1) {
            // 效果结束，清理资源
            this.scene.remove(effect.particles);
            effect.particles.geometry.dispose();
            effect.particles.material.dispose();
            this._spawnEffect = null;
            return;
        }

        // 更新粒子位置
        const positions = effect.particles.geometry.attributes.position.array;
        for (let i = 0; i < effect.velocities.length; i++) {
            const v = effect.velocities[i];
            positions[i * 3] += v.x * delta;
            positions[i * 3 + 1] += v.y * delta;
            positions[i * 3 + 2] += v.z * delta;
            v.y -= 2 * delta; // 重力下落
        }
        effect.particles.geometry.attributes.position.needsUpdate = true;
        // 逐渐淡出
        effect.particles.material.opacity = 0.8 * (1 - t);
    }

    /**
     * 更新死亡动画
     */
    _updateDeath(delta) {
        this.deathTime += delta;
        const t = Math.min(this.deathTime / 1.0, 1);

        if (this.deathTime >= 1.5) {
            this.model.visible = false;
            return;
        }

        // 倒地动画（向前倒90度）
        this.model.rotation.x = t * Math.PI / 2;
        this.model.position.y = this.position.y - t * 0.5;

        // 颜色变暗（保留30%亮度）
        const darken = 1 - t * 0.7;
        this.allMaterials.forEach((mat, i) => {
            if (this._originalColors && this._originalColors[i]) {
                const orig = this._originalColors[i];
                mat.color.setRGB(orig.r * darken, orig.g * darken, orig.b * darken);
            }
            mat.transparent = true;
            // 最后0.5秒淡出
            mat.opacity = this.deathTime > 1.0
                ? Math.max(0, 1 - (this.deathTime - 1.0) * 2)
                : 1;
        });
    }

    /**
     * 受到伤害
     */
    takeDamage(amount) {
        if (!this.isAlive) return false;

        this.health -= amount;
        this.hitFlashTime = 0.15;
        this.onHit(amount, this);

        if (this.health <= 0) {
            this._die();
            return true; // 击杀
        }

        // 进入硬直
        if (this.state !== MonsterState.ATTACK) {
            this._setState(MonsterState.STAGGER);
        }
        return false;
    }

    /**
     * 死亡
     */
    _die() {
        this.isAlive = false;
        this.state = MonsterState.DEAD;
        this.deathTime = 0;
        // 保存原始颜色用于死亡变暗后恢复
        this._originalColors = this.allMaterials.map(mat => mat.color.clone());
        this.onDeath(this);
    }

    /**
     * 检查近战命中
     * @param {THREE.Raycaster} raycaster
     * @param {number} range
     */
    checkMeleeHit(raycaster, range) {
        if (!this.isAlive) return null;

        // 简化的命中盒（以怪兽为中心的球体）
        const center = this.position.clone();
        center.y += this.height / 2;

        const ray = raycaster.ray;
        const closestPoint = ray.closestPointToPoint(center, new THREE.Vector3());
        const distance = closestPoint.distanceTo(center);

        if (distance < this.radius + 0.3) {
            const rayDistance = ray.origin.distanceTo(closestPoint);
            if (rayDistance < range) {
                return {
                    distance: rayDistance,
                    point: closestPoint,
                    target: this
                };
            }
        }
        return null;
    }

    /**
     * 设置状态
     */
    _setState(newState) {
        this.state = newState;
        this.stateTimer = 0;
    }

    /**
     * 选择新巡逻目标
     */
    _chooseNewPatrolTarget() {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * this.patrolRadius;
        this.patrolTarget = this.spawnPosition.clone().add(
            new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
        );
    }

    /**
     * 重置怪兽
     */
    reset() {
        this.isAlive = true;
        this.health = this.maxHealth;
        this.state = MonsterState.IDLE;
        this.position.copy(this.spawnPosition);
        this.velocity.set(0, 0, 0);
        this.model.visible = true;
        this.model.rotation.set(0, 0, 0);
        this.model.position.copy(this.position);
        // 恢复颜色和透明度
        this.allMaterials.forEach((mat, i) => {
            if (this._originalColors && this._originalColors[i]) {
                mat.color.copy(this._originalColors[i]);
            }
            mat.opacity = 1;
            mat.transparent = false;
        });
        this.hitFlashTime = 0;
        this.isAttacking = false;
        this.isTelegraphing = false;
        this._chooseNewPatrolTarget();
    }

    /**
     * 销毁怪兽 - 释放GPU资源（防止内存泄漏导致卡死）
     */
    dispose() {
        // 标记为已死亡，阻止setTimeout回调造成伤害
        this.isAlive = false;
        this.state = MonsterState.DEAD;

        this.scene.remove(this.model);
        // 清理生成特效资源
        if (this._spawnEffect) {
            this.scene.remove(this._spawnEffect.particles);
            this._spawnEffect.particles.geometry.dispose();
            this._spawnEffect.particles.material.dispose();
            this._spawnEffect = null;
        }
        // 遍历模型所有子网格，只释放独立材质（共享材质/几何体不释放）
        this.model.traverse(child => {
            if (child.isMesh) {
                // 共享几何体不释放（SHARED.geometries中的）
                // 只释放独立创建的材质（bodyMat, darkMat）
                if (child.material && this.allMaterials.includes(child.material)) {
                    child.material.dispose();
                }
            }
        });
    }
}
