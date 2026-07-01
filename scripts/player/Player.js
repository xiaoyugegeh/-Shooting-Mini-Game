/**
 * Player.js - 玩家角色
 * 第三人称可操控角色，包含移动、跳跃、碰撞检测
 */
import * as THREE from 'three';

export class Player {
    constructor(scene, colliders) {
        this.scene = scene;
        this.colliders = colliders;

        // 角色物理参数
        this.position = new THREE.Vector3(0, 0, 10);
        this.velocity = new THREE.Vector3();
        this.rotation = 0;  // 水平朝向(弧度)

        // 移动参数（降低速度提升操作舒适度）
        this.moveSpeed = 5;          // 基础最大移动速度（原8）
        this.speedMultiplier = 1.0;  // 外部速度倍率（由武器配置影响）
        this.acceleration = 40;      // 加速度（原60，配合低速）
        this.friction = 10;          // 摩擦力
        this.jumpForce = 7;          // 跳跃力（原8）
        this.gravity = 25;           // 重力

        // 角色尺寸 (AABB)
        this.radius = 0.5;           // 水平半径
        this.height = 1.8;           // 角色高度
        this.eyeHeight = 1.6;        // 视角高度

        // 状态
        this.isOnGround = true;
        this.health = 100;
        this.maxHealth = 100;

        // 角色模型组
        this.model = new THREE.Group();
        this._buildModel();

        // 移动统计 (用于教程)
        this.totalDistance = 0;
        this._lastPosition = this.position.clone();

        // 临时向量复用（避免每帧GC）
        this._tmpForward = new THREE.Vector3();
        this._tmpRight = new THREE.Vector3();
        this._tmpTarget = new THREE.Vector3();
        this._tmpDiff = new THREE.Vector3();
    }

    /**
     * 初始化
     */
    init() {
        this.scene.add(this.model);
        this.model.position.copy(this.position);
    }

    /**
     * 构建角色模型 - 低多边形战术人形
     */
    _buildModel() {
        // 材质
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x2a3a4a, roughness: 0.7, metalness: 0.3
        });
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0xff4655, roughness: 0.5, metalness: 0.3,
            emissive: 0xff4655, emissiveIntensity: 0.2
        });
        const headMat = new THREE.MeshStandardMaterial({
            color: 0xece8e1, roughness: 0.6, metalness: 0.1
        });
        const limbMat = new THREE.MeshStandardMaterial({
            color: 0x1a2530, roughness: 0.8, metalness: 0.2
        });

        // 身体 (躯干)
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.9, 0.4),
            bodyMat
        );
        torso.position.y = 1.1;
        torso.castShadow = true;
        this.model.add(torso);

        // 胸前红色标识
        const chestMark = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.15, 0.02),
            accentMat
        );
        chestMark.position.set(0, 1.3, 0.21);
        this.model.add(chestMark);

        // 头部
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.4, 0.4),
            headMat
        );
        head.position.y = 1.75;
        head.castShadow = true;
        this.model.add(head);

        // 头盔
        const helmet = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.2, 0.45),
            bodyMat
        );
        helmet.position.y = 1.92;
        helmet.castShadow = true;
        this.model.add(helmet);

        // 头盔红色条
        const helmetStripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.46, 0.05, 0.15),
            accentMat
        );
        helmetStripe.position.set(0, 1.95, 0.15);
        this.model.add(helmetStripe);

        // 左臂
        const leftArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.8, 0.2),
            limbMat
        );
        leftArm.position.set(-0.45, 1.1, 0);
        leftArm.castShadow = true;
        this.model.add(leftArm);
        this.leftArm = leftArm;

        // 右臂
        const rightArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.8, 0.2),
            limbMat
        );
        rightArm.position.set(0.45, 1.1, 0);
        rightArm.castShadow = true;
        this.model.add(rightArm);
        this.rightArm = rightArm;

        // 左腿
        const leftLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.7, 0.25),
            limbMat
        );
        leftLeg.position.set(-0.18, 0.35, 0);
        leftLeg.castShadow = true;
        this.model.add(leftLeg);
        this.leftLeg = leftLeg;

        // 右腿
        const rightLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.7, 0.25),
            limbMat
        );
        rightLeg.position.set(0.18, 0.35, 0);
        rightLeg.castShadow = true;
        this.model.add(rightLeg);
        this.rightLeg = rightLeg;

        // 武器 (步枪模型)
        const weaponGroup = new THREE.Group();
        // 枪身
        const gunBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.2, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.8 })
        );
        gunBody.position.set(0, 0, 0.2);
        weaponGroup.add(gunBody);
        // 枪管
        const gunBarrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.9 })
        );
        gunBarrel.rotation.x = Math.PI / 2;
        gunBarrel.position.set(0, 0.02, 0.7);
        weaponGroup.add(gunBarrel);
        // 弹匣
        const magazine = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.3, 0.15),
            new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.7 })
        );
        magazine.position.set(0, -0.2, 0.1);
        weaponGroup.add(magazine);
        // 握把
        const grip = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.2, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 })
        );
        grip.position.set(0, -0.15, -0.1);
        weaponGroup.add(grip);

        // 武器位置 - 右手前方
        weaponGroup.position.set(0.45, 1.1, 0.3);
        this.model.add(weaponGroup);
        this.weaponModel = weaponGroup;

        // 背包
        const backpack = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.6, 0.2),
            bodyMat
        );
        backpack.position.set(0, 1.1, -0.25);
        backpack.castShadow = true;
        this.model.add(backpack);

        // 背包红色条
        const backpackStripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.52, 0.08, 0.22),
            accentMat
        );
        backpackStripe.position.set(0, 1.3, -0.25);
        this.model.add(backpackStripe);
    }

    /**
     * 更新角色
     */
    update(delta, input, cameraController) {
        this._handleMovement(delta, input, cameraController);
        this._handleJump(input);
        this._applyGravity(delta);
        this._applyVelocity(delta);
        this._handleCollisions();
        this._updateModel(delta);
        this._updateStats(delta);
    }

    /**
     * 处理移动输入
     */
    _handleMovement(delta, input, cameraController) {
        const moveVector = input.getMovementVector();
        if (moveVector.x === 0 && moveVector.y === 0) {
            // 没有输入时应用摩擦力
            this.velocity.x *= Math.max(0, 1 - this.friction * delta);
            this.velocity.z *= Math.max(0, 1 - this.friction * delta);
            return;
        }

        // 基于相机朝向计算移动方向（复用临时向量）
        const cameraYaw = cameraController.yaw;
        const sinY = Math.sin(cameraYaw);
        const cosY = Math.cos(cameraYaw);
        // forward = (-sin, 0, -cos)  角色前方
        // right   = ( cos, 0, -sin)  角色右方
        const forward = this._tmpForward.set(-sinY, 0, -cosY);
        const right = this._tmpRight.set(cosY, 0, -sinY);

        // 计算目标速度（复用临时向量，应用武器速度倍率）
        const effectiveSpeed = this.moveSpeed * this.speedMultiplier;
        const targetVelocity = this._tmpTarget.set(0, 0, 0);
        targetVelocity.addScaledVector(forward, moveVector.y * effectiveSpeed);
        targetVelocity.addScaledVector(right, moveVector.x * effectiveSpeed);

        // 平滑加速到目标速度
        const diff = this._tmpDiff.set(
            targetVelocity.x - this.velocity.x,
            0,
            targetVelocity.z - this.velocity.z
        );
        const accel = this.acceleration * delta;
        const diffLen = Math.sqrt(diff.x * diff.x + diff.z * diff.z);
        if (diffLen > accel) {
            const scale = accel / diffLen;
            diff.x *= scale;
            diff.z *= scale;
        }
        this.velocity.x += diff.x;
        this.velocity.z += diff.z;

        // 限制最大速度（应用武器速度倍率）
        const horizontalSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (horizontalSpeed > effectiveSpeed) {
            const scale = effectiveSpeed / horizontalSpeed;
            this.velocity.x *= scale;
            this.velocity.z *= scale;
        }

        // 角色朝向跟随相机水平方向
        this.rotation = cameraYaw;
    }

    /**
     * 处理跳跃
     */
    _handleJump(input) {
        if (input.isKeyDown('Space') && this.isOnGround) {
            this.velocity.y = this.jumpForce;
            this.isOnGround = false;
        }
    }

    /**
     * 应用重力
     */
    _applyGravity(delta) {
        if (!this.isOnGround) {
            this.velocity.y -= this.gravity * delta;
        }
    }

    /**
     * 应用速度到位置
     */
    _applyVelocity(delta) {
        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;
        this.position.z += this.velocity.z * delta;

        // 地面检测
        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = 0;
            this.isOnGround = true;
        }

        // 边界约束
        const bound = 48;
        this.position.x = Math.max(-bound, Math.min(bound, this.position.x));
        this.position.z = Math.max(-bound, Math.min(bound, this.position.z));
    }

    /**
     * 处理碰撞检测 (AABB) - 使用标量计算避免每帧创建Vector3
     */
    _handleCollisions() {
        // 使用标量值（避免每帧new THREE.Vector3产生GC压力）
        const pMinX = this.position.x - this.radius;
        const pMaxX = this.position.x + this.radius;
        const pMinY = this.position.y;
        const pMaxY = this.position.y + this.height;
        const pMinZ = this.position.z - this.radius;
        const pMaxZ = this.position.z + this.radius;

        for (const collider of this.colliders) {
            // 跳过过高的碰撞体（玩家可以从下方穿过）
            if (collider.min.y > pMaxY) continue;
            if (collider.max.y < pMinY) continue;

            // AABB重叠检测（标量比较）
            if (pMaxX > collider.min.x && pMinX < collider.max.x &&
                pMaxY > collider.min.y && pMinY < collider.max.y &&
                pMaxZ > collider.min.z && pMinZ < collider.max.z) {

                // 计算各轴穿透深度
                const overlapX = Math.min(pMaxX - collider.min.x, collider.max.x - pMinX);
                const overlapZ = Math.min(pMaxZ - collider.min.z, collider.max.z - pMinZ);

                // 选择最小穿透轴进行修正
                if (overlapX < overlapZ) {
                    // X轴修正
                    if (this.position.x < (collider.min.x + collider.max.x) / 2) {
                        this.position.x = collider.min.x - this.radius;
                    } else {
                        this.position.x = collider.max.x + this.radius;
                    }
                    this.velocity.x = 0;
                } else {
                    // Z轴修正
                    if (this.position.z < (collider.min.z + collider.max.z) / 2) {
                        this.position.z = collider.min.z - this.radius;
                    } else {
                        this.position.z = collider.max.z + this.radius;
                    }
                    this.velocity.z = 0;
                }
            }
        }
    }

    /**
     * 更新角色模型
     */
    _updateModel(delta) {
        this.model.position.copy(this.position);
        // 模型默认面朝+Z（胸前标识在+Z侧），需旋转180°面朝-Z（与forward一致）
        this.model.rotation.y = this.rotation + Math.PI;

        // 行走动画 - 四肢摆动
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (speed > 0.5 && this.isOnGround) {
            const t = performance.now() * 0.01;
            const swing = Math.sin(t) * 0.3 * Math.min(speed / this.moveSpeed, 1);
            if (this.leftLeg) this.leftLeg.rotation.x = swing;
            if (this.rightLeg) this.rightLeg.rotation.x = -swing;
            if (this.leftArm) this.leftArm.rotation.x = -swing * 0.5;
        } else {
            // 回到默认姿态
            if (this.leftLeg) this.leftLeg.rotation.x *= 0.8;
            if (this.rightLeg) this.rightLeg.rotation.x *= 0.8;
            if (this.leftArm) this.leftArm.rotation.x *= 0.8;
        }
    }

    /**
     * 更新统计数据
     */
    _updateStats(delta) {
        const distance = this.position.distanceTo(this._lastPosition);
        this.totalDistance += distance;
        this._lastPosition.copy(this.position);
    }

    /**
     * 获取视角位置 (眼睛高度)
     */
    getEyePosition() {
        return new THREE.Vector3(
            this.position.x,
            this.position.y + this.eyeHeight,
            this.position.z
        );
    }

    /**
     * 获取角色中心位置
     */
    getCenterPosition() {
        return new THREE.Vector3(
            this.position.x,
            this.position.y + this.height / 2,
            this.position.z
        );
    }

    /**
     * 受到伤害
     */
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
    }

    /**
     * 重置玩家状态
     */
    reset() {
        this.position.set(0, 0, 10);
        this.velocity.set(0, 0, 0);
        this.rotation = 0;
        this.health = this.maxHealth;
        this.isOnGround = true;
        this.totalDistance = 0;
        this._lastPosition.copy(this.position);
        this.model.position.copy(this.position);
    }
}
