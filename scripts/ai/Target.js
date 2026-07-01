/**
 * Target.js - AI靶标
 * 战术训练靶标，支持命中检测、血量、击毁特效、重生
 */
import * as THREE from 'three';

export class Target {
    constructor(scene, position, options = {}) {
        this.scene = scene;
        this.initialPosition = position.clone();
        this.options = options;

        // 属性
        this.id = options.id || 0;
        this.maxHealth = options.health || 100;
        this.health = this.maxHealth;
        this.isAlive = true;
        this.isDynamic = options.isDynamic || false;

        // 回调
        this.onHit = options.onHit || (() => {});
        this.onDestroyed = options.onDestroyed || (() => {});

        // 模型组
        this.model = new THREE.Group();
        this.hitboxes = [];  // 命中盒列表 {mesh, box, multiplier}

        // 动画状态
        this.hitFlashTime = 0;
        this.destructionTime = 0;
        this.isDestroying = false;
        this.respawnTimer = 0;

        // 移动参数 (动态靶标)
        this.moveSpeed = 2;
        this.moveRange = 4;
        this.moveDirection = 1;
        this.moveAxis = 'x';

        // 材质引用 (用于命中闪烁)
        this.materials = [];
    }

    /**
     * 初始化靶标
     */
    init() {
        this._buildModel();
        this.model.position.copy(this.initialPosition);
        this.scene.add(this.model);
    }

    /**
     * 构建靶标模型 - 战术训练人形
     */
    _buildModel() {
        // 材质 - 红白配色训练靶
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xff4655,
            roughness: 0.6,
            metalness: 0.2,
            emissive: 0xff4655,
            emissiveIntensity: 0.1
        });
        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xece8e1,
            roughness: 0.7,
            metalness: 0.1
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x2a323a,
            roughness: 0.5,
            metalness: 0.7
        });

        this.materials.push(bodyMat, whiteMat, darkMat);
        this.bodyMaterial = bodyMat;

        // 底座
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.8, 0.3, 8),
            darkMat
        );
        base.position.y = 0.15;
        base.castShadow = true;
        base.receiveShadow = true;
        this.model.add(base);

        // 支柱
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6),
            darkMat
        );
        pole.position.y = 0.55;
        pole.castShadow = true;
        this.model.add(pole);

        // 靶标身体 (人形剪影)
        // 头部
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.4, 0.3),
            whiteMat
        );
        head.position.y = 1.9;
        head.castShadow = true;
        this.model.add(head);
        this.head = head;

        // 头部红色环 (靶心)
        const headRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.15, 0.04, 8, 16),
            bodyMat
        );
        headRing.position.y = 1.9;
        headRing.position.z = 0.16;
        this.model.add(headRing);

        // 躯干
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 1.0, 0.3),
            bodyMat
        );
        torso.position.y = 1.1;
        torso.castShadow = true;
        this.model.add(torso);
        this.torso = torso;

        // 躯干白色靶心
        const center = new THREE.Mesh(
            new THREE.CircleGeometry(0.15, 16),
            whiteMat
        );
        center.position.set(0, 1.1, 0.16);
        this.model.add(center);

        // 肩部
        const leftShoulder = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.3, 0.25),
            whiteMat
        );
        leftShoulder.position.set(-0.45, 1.5, 0);
        leftShoulder.castShadow = true;
        this.model.add(leftShoulder);

        const rightShoulder = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.3, 0.25),
            whiteMat
        );
        rightShoulder.position.set(0.45, 1.5, 0);
        rightShoulder.castShadow = true;
        this.model.add(rightShoulder);

        // 设置命中盒 (AABB)
        // 头部命中盒 (爆头2倍伤害)
        this.hitboxes.push({
            mesh: head,
            box: new THREE.Box3(
                new THREE.Vector3(-0.2, 1.7, -0.15),
                new THREE.Vector3(0.2, 2.1, 0.15)
            ),
            multiplier: 2.0,
            isHead: true
        });

        // 躯干命中盒
        this.hitboxes.push({
            mesh: torso,
            box: new THREE.Box3(
                new THREE.Vector3(-0.35, 0.6, -0.15),
                new THREE.Vector3(0.35, 1.6, 0.15)
            ),
            multiplier: 1.0,
            isHead: false
        });

        // 血量条 (3D空间中显示)
        this._buildHealthBar();
    }

    /**
     * 构建3D血量条
     */
    _buildHealthBar() {
        this.healthBarGroup = new THREE.Group();

        // 背景
        const bgGeo = new THREE.PlaneGeometry(1.2, 0.12);
        const bgMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.6
        });
        const bg = new THREE.Mesh(bgGeo, bgMat);
        this.healthBarGroup.add(bg);

        // 前景
        const fgGeo = new THREE.PlaneGeometry(1.15, 0.08);
        const fgMat = new THREE.MeshBasicMaterial({
            color: 0xff4655,
            transparent: true,
            opacity: 0.9
        });
        this.healthBarFill = new THREE.Mesh(fgGeo, fgMat);
        this.healthBarFill.position.z = 0.01;
        this.healthBarGroup.add(this.healthBarFill);

        // 位置 - 头顶
        this.healthBarGroup.position.y = 2.4;
        this.healthBarGroup.visible = false;
        this.model.add(this.healthBarGroup);
    }

    /**
     * 检查命中
     * @param {THREE.Raycaster} raycaster
     * @returns {Object|null} 命中结果 {distance, target, hitbox}
     */
    checkHit(raycaster) {
        if (!this.isAlive) return null;

        let closestHit = null;
        let closestDistance = Infinity;

        for (const hitbox of this.hitboxes) {
            // 将命中盒转换到世界坐标
            const worldBox = hitbox.box.clone();
            worldBox.translate(this.model.position);

            // 射线与AABB相交检测
            const intersection = raycaster.ray.intersectBox(worldBox, new THREE.Vector3());
            if (intersection) {
                const distance = raycaster.ray.origin.distanceTo(intersection);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestHit = {
                        distance,
                        target: this,
                        hitbox,
                        point: intersection
                    };
                }
            }
        }

        return closestHit;
    }

    /**
     * 受到伤害
     */
    takeDamage(amount) {
        if (!this.isAlive) return;

        this.health -= amount;
        this.hitFlashTime = 0.1;
        this.healthBarGroup.visible = true;

        const isKill = this.health <= 0;
        this.onHit(amount, isKill);

        if (isKill) {
            this._destroy();
        }
    }

    /**
     * 击毁靶标
     */
    _destroy() {
        this.isAlive = false;
        this.isDestroying = true;
        this.destructionTime = 0;
        this.onDestroyed();

        // 隐藏血量条
        this.healthBarGroup.visible = false;
    }

    /**
     * 重生
     */
    respawn() {
        this.isAlive = true;
        this.health = this.maxHealth;
        this.isDestroying = false;
        this.model.visible = true;
        this.model.position.copy(this.initialPosition);

        // 重置模型旋转（避免销毁动画的躺倒姿态残留）
        this.model.rotation.set(0, 0, 0);

        // 重置材质
        this.materials.forEach(mat => {
            mat.opacity = 1;
            mat.transparent = false;
            mat.emissiveIntensity = mat === this.bodyMaterial ? 0.1 : 0;
        });

        // 重置模型缩放
        this.model.scale.setScalar(1);
    }

    /**
     * 更新靶标
     */
    update(delta) {
        // 命中闪烁效果
        if (this.hitFlashTime > 0) {
            this.hitFlashTime -= delta;
            const flash = Math.max(0, this.hitFlashTime / 0.1);
            this.bodyMaterial.emissiveIntensity = 0.1 + flash * 0.8;
        } else if (this.isAlive) {
            this.bodyMaterial.emissiveIntensity = 0.1;
        }

        // 击毁动画
        if (this.isDestroying) {
            this.destructionTime += delta;
            const t = this.destructionTime / 0.5; // 0.5秒动画

            if (t >= 1) {
                this.model.visible = false;
                this.isDestroying = false;
            } else {
                // 倒下 + 淡出
                this.model.rotation.x = t * Math.PI / 2;
                this.model.scale.y = 1 - t * 0.3;
                this.materials.forEach(mat => {
                    mat.transparent = true;
                    mat.opacity = 1 - t;
                });
            }
        }

        // 动态靶标移动
        if (this.isDynamic && this.isAlive) {
            this._updateMovement(delta);
        }

        // 更新血量条
        if (this.isAlive && this.healthBarGroup.visible) {
            const ratio = this.health / this.maxHealth;
            this.healthBarFill.scale.x = Math.max(0.01, ratio);
            this.healthBarFill.position.x = -(1 - ratio) * 0.575;

            // 血量颜色
            if (ratio > 0.5) {
                this.healthBarFill.material.color.setHex(0xff4655);
            } else if (ratio > 0.25) {
                this.healthBarFill.material.color.setHex(0xf8d147);
            } else {
                this.healthBarFill.material.color.setHex(0xff0000);
            }
        }
    }

    /**
     * 动态移动
     */
    _updateMovement(delta) {
        const pos = this.model.position;
        const initial = this.initialPosition;

        if (this.moveAxis === 'x') {
            pos.x += this.moveDirection * this.moveSpeed * delta;
            if (Math.abs(pos.x - initial.x) > this.moveRange) {
                this.moveDirection *= -1;
            }
        } else {
            pos.z += this.moveDirection * this.moveSpeed * delta;
            if (Math.abs(pos.z - initial.z) > this.moveRange) {
                this.moveDirection *= -1;
            }
        }
    }

    /**
     * 重置靶标
     */
    reset() {
        this.respawn();
        this.model.rotation.x = 0;
        this.model.scale.setScalar(1);
    }
}
