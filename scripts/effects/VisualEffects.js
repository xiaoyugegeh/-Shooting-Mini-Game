/**
 * VisualEffects.js - 战斗视觉特效系统
 * 包含攻击挥砍、命中血液、死亡爆炸、屏幕震动等特效
 * 参考chasergit/gear的粒子效果与血液特效
 */
import * as THREE from 'three';

export class VisualEffects {
    constructor(scene) {
        this.scene = scene;
        this.effects = [];  // 活跃特效列表
        this.particles = []; // 粒子系统列表
        // 最大同时存在的特效数量（防止特效堆积拖累性能）
        this._maxEffects = 20;

        // 共享材质
        this._bloodMaterial = new THREE.MeshBasicMaterial({
            color: 0xcc1122,
            transparent: true,
            opacity: 1
        });
        this._sparkMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa33,
            transparent: true,
            opacity: 1
        });
        this._slashMaterial = new THREE.MeshBasicMaterial({
            color: 0xece8e1,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        this._explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4655,
            transparent: true,
            opacity: 1
        });
        // 共享几何体（性能优化：避免每个粒子都创建新几何体）
        this._bloodGeometry = new THREE.SphereGeometry(0.08, 4, 2);
        this._sparkGeometry = new THREE.SphereGeometry(0.04, 4, 2);
        // 弹道对象池（避免Bot射击频繁创建几何体/材质导致GC卡顿）
        this._tracerGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);
        this._tracerPool = [];
        this._tracerPoolSize = 10;
        this._initTracerPool();
    }

    /**
     * 初始化弹道对象池
     */
    _initTracerPool() {
        for (let i = 0; i < this._tracerPoolSize; i++) {
            const material = new THREE.LineBasicMaterial({
                color: 0xff4655,
                transparent: true,
                opacity: 0.8
            });
            const line = new THREE.Line(this._tracerGeometry, material);
            line.visible = false;
            line.frustumCulled = false;
            this.scene.add(line);
            this._tracerPool.push({ mesh: line, material: material, active: false, life: 0, maxLife: 0.08 });
        }
    }

    /**
     * 从对象池获取弹道
     */
    _acquireTracer() {
        for (const t of this._tracerPool) {
            if (!t.active) return t;
        }
        // 池满时复用最旧的
        let oldest = this._tracerPool[0];
        for (const t of this._tracerPool) {
            if (t.life < oldest.life) oldest = t;
        }
        return oldest;
    }

    /**
     * 检查是否已达特效数量上限
     * @returns {boolean} 达到上限返回true
     */
    _isEffectLimitReached() {
        return (this.effects.length + this.particles.length) >= this._maxEffects;
    }

    /**
     * 更新所有特效
     */
    update(delta) {
        // 更新特效
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.life -= delta;
            effect.update(delta);

            if (effect.life <= 0) {
                effect.dispose();
                this.effects.splice(i, 1);
            }
        }

        // 更新粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.life -= delta;
            particle.update(delta);

            if (particle.life <= 0) {
                particle.dispose();
                this.particles.splice(i, 1);
            }
        }
    }

    /**
     * 创建近战挥砍特效
     */
    createSlashEffect(position, direction) {
        if (this._isEffectLimitReached()) return;
        const group = new THREE.Group();

        // 主挥砍弧线
        const slashGeo = new THREE.RingGeometry(0.8, 1.2, 16, 1, 0, Math.PI * 0.6);
        const slash = new THREE.Mesh(slashGeo, this._slashMaterial.clone());
        slash.rotation.x = -Math.PI / 2;
        group.add(slash);

        // 内层亮光
        const innerGeo = new THREE.RingGeometry(0.6, 0.9, 16, 1, 0, Math.PI * 0.6);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.rotation.x = -Math.PI / 2;
        group.add(inner);

        // 定位与朝向
        group.position.copy(position);
        group.position.y += 1.0;
        group.lookAt(position.clone().add(direction));

        this.scene.add(group);

        const effect = {
            life: 0.3,
            maxLife: 0.3,
            group: group,
            materials: [slash.material, inner.material],
            update: (delta) => {
                const t = 1 - (effect.life / effect.maxLife);
                group.scale.setScalar(1 + t * 0.5);
                slash.material.opacity = (1 - t) * 0.8;
                inner.material.opacity = (1 - t) * 1.0;
            },
            dispose: () => {
                this.scene.remove(group);
                slashGeo.dispose();
                innerGeo.dispose();
                slash.material.dispose();
                inner.material.dispose();
            }
        };
        this.effects.push(effect);
    }

    /**
     * 创建血液飞溅特效（使用共享几何体，性能优化）
     */
    createBloodSplatter(position, direction) {
        if (this._isEffectLimitReached()) return;
        const particleCount = 6;  // 减少粒子数量(原8)
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            // 使用共享几何体和材质（通过scale和color实现差异）
            const mat = this._bloodMaterial.clone();
            mat.color.setHSL(0, 1, 0.3 + Math.random() * 0.2);
            const particle = new THREE.Mesh(this._bloodGeometry, mat);
            // 随机大小通过scale实现
            const scale = 0.7 + Math.random() * 0.6;
            particle.scale.setScalar(scale);
            particle.position.copy(position);

            // 随机散射方向
            const spread = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            );
            const velocity = direction.clone().multiplyScalar(3).add(spread);

            this.scene.add(particle);
            particles.push({ mesh: particle, velocity, mat });
        }

        const particleSystem = {
            life: 0.6,
            maxLife: 0.6,
            particles: particles,
            update: (delta) => {
                particles.forEach(p => {
                    p.mesh.position.x += p.velocity.x * delta;
                    p.mesh.position.y += p.velocity.y * delta;
                    p.mesh.position.z += p.velocity.z * delta;
                    p.velocity.y -= 15 * delta; // 重力
                    p.velocity.multiplyScalar(0.95); // 阻力
                    const t = 1 - (particleSystem.life / particleSystem.maxLife);
                    p.mat.opacity = 1 - t;
                });
            },
            dispose: () => {
                particles.forEach(p => {
                    this.scene.remove(p.mesh);
                    p.mat.dispose();  // 只释放克隆的材质，几何体共享不释放
                });
            }
        };
        this.particles.push(particleSystem);
    }

    /**
     * 创建火花特效（武器命中，使用共享几何体）
     */
    createSparkBurst(position) {
        if (this._isEffectLimitReached()) return;
        const particleCount = 4;  // 减少粒子数量(原5)
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const mat = this._sparkMaterial.clone();
            const particle = new THREE.Mesh(this._sparkGeometry, mat);
            particle.position.copy(position);

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                Math.random() * 4,
                (Math.random() - 0.5) * 6
            );

            this.scene.add(particle);
            particles.push({ mesh: particle, velocity, mat });
        }

        const particleSystem = {
            life: 0.3,
            maxLife: 0.3,
            particles: particles,
            update: (delta) => {
                particles.forEach(p => {
                    p.mesh.position.x += p.velocity.x * delta;
                    p.mesh.position.y += p.velocity.y * delta;
                    p.mesh.position.z += p.velocity.z * delta;
                    p.velocity.y -= 10 * delta;
                    const t = 1 - (particleSystem.life / particleSystem.maxLife);
                    p.mat.opacity = 1 - t;
                });
            },
            dispose: () => {
                particles.forEach(p => {
                    this.scene.remove(p.mesh);
                    p.mat.dispose();
                });
            }
        };
        this.particles.push(particleSystem);
    }

    /**
     * 创建死亡爆炸特效
     */
    createDeathExplosion(position) {
        if (this._isEffectLimitReached()) return;
        const group = new THREE.Group();

        // 中心爆炸球
        const coreGeo = new THREE.SphereGeometry(0.5, 12, 8);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xff4655,
            transparent: true,
            opacity: 1
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        group.add(core);

        // 外层光晕
        const haloGeo = new THREE.SphereGeometry(0.8, 12, 8);
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0xff8844,
            transparent: true,
            opacity: 0.5
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        group.add(halo);

        group.position.copy(position);
        group.position.y += 1.0;
        this.scene.add(group);

        const effect = {
            life: 0.6,
            maxLife: 0.6,
            group: group,
            update: (delta) => {
                const t = 1 - (effect.life / effect.maxLife);
                group.scale.setScalar(1 + t * 3);
                coreMat.opacity = (1 - t);
                haloMat.opacity = (1 - t) * 0.5;
            },
            dispose: () => {
                this.scene.remove(group);
                coreGeo.dispose();
                haloGeo.dispose();
                coreMat.dispose();
                haloMat.dispose();
            }
        };
        this.effects.push(effect);

        // 同时生成粒子飞溅
        this.createBloodSplatter(
            new THREE.Vector3(position.x, position.y + 1, position.z),
            new THREE.Vector3(0, 1, 0)
        );

        // 生成多个火花
        for (let i = 0; i < 3; i++) {
            this.createSparkBurst(new THREE.Vector3(
                position.x + (Math.random() - 0.5) * 1.5,
                position.y + 1 + Math.random(),
                position.z + (Math.random() - 0.5) * 1.5
            ));
        }
    }

    /**
     * 创建怪兽攻击特效（爪击轨迹）
     */
    createClawTrail(position, direction) {
        if (this._isEffectLimitReached()) return;
        const group = new THREE.Group();

        // 三道爪痕
        for (let i = 0; i < 3; i++) {
            const geo = new THREE.PlaneGeometry(0.1, 1.5);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xff3300,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const claw = new THREE.Mesh(geo, mat);
            claw.position.x = (i - 1) * 0.2;
            group.add(claw);
        }

        group.position.copy(position);
        group.position.y += 1.0;
        group.lookAt(position.clone().add(direction));

        this.scene.add(group);

        const effect = {
            life: 0.2,
            maxLife: 0.2,
            group: group,
            update: (delta) => {
                const t = 1 - (effect.life / effect.maxLife);
                group.scale.setScalar(1 + t);
                group.children.forEach(claw => {
                    claw.material.opacity = (1 - t) * 0.8;
                });
            },
            dispose: () => {
                this.scene.remove(group);
                group.children.forEach(claw => {
                    claw.geometry.dispose();
                    claw.material.dispose();
                });
            }
        };
        this.effects.push(effect);
    }

    /**
     * 创建玩家受伤特效（屏幕边缘红光）
     * 注：实际屏幕特效在HUD中处理，这里创建3D空间特效
     */
    createPlayerHurtEffect(position) {
        if (this._isEffectLimitReached()) return;
        // 受击粒子
        const particleCount = 6;
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const geo = new THREE.SphereGeometry(0.05, 4, 2);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xff4655,
                transparent: true,
                opacity: 0.8
            });
            const particle = new THREE.Mesh(geo, mat);
            particle.position.copy(position);
            particle.position.y += 1.5;

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                Math.random() * 2,
                (Math.random() - 0.5) * 3
            );

            this.scene.add(particle);
            particles.push({ mesh: particle, velocity, geo, mat });
        }

        const particleSystem = {
            life: 0.4,
            maxLife: 0.4,
            particles: particles,
            update: (delta) => {
                particles.forEach(p => {
                    p.mesh.position.x += p.velocity.x * delta;
                    p.mesh.position.y += p.velocity.y * delta;
                    p.mesh.position.z += p.velocity.z * delta;
                    p.velocity.y -= 8 * delta;
                    const t = 1 - (particleSystem.life / particleSystem.maxLife);
                    p.mat.opacity = (1 - t) * 0.8;
                });
            },
            dispose: () => {
                particles.forEach(p => {
                    this.scene.remove(p.mesh);
                    p.geo.dispose();
                    p.mat.dispose();
                });
            }
        };
        this.particles.push(particleSystem);
    }

    /**
     * 创建弹道轨迹特效（用于Bot射击）- 使用对象池避免GC
     * @param {THREE.Vector3} origin 起点
     * @param {THREE.Vector3} direction 方向（已归一化）
     * @param {number} distance 距离
     * @param {number} color 颜色（hex）
     */
    createTracer(origin, direction, distance, color = 0xff4655) {
        const tracer = this._acquireTracer();
        const { mesh, material } = tracer;
        // 设置颜色
        material.color.setHex(color);
        material.opacity = 0.8;
        // 定位：将单位长度线段放到origin并朝向direction
        mesh.position.copy(origin);
        // 朝向方向（-Z轴对齐direction）
        mesh.lookAt(origin.x + direction.x, origin.y + direction.y, origin.z + direction.z);
        // 缩放Z轴到距离长度
        mesh.scale.set(1, 1, distance);
        mesh.visible = true;
        // 激活
        tracer.active = true;
        tracer.life = 0.08;
        tracer.maxLife = 0.08;
        // 注册到effects以获得每帧更新
        const effect = {
            life: tracer.life,
            maxLife: tracer.maxLife,
            update: (delta) => {
                effect.life -= delta;
                const t = 1 - Math.max(0, effect.life / effect.maxLife);
                material.opacity = (1 - t) * 0.8;
                if (effect.life <= 0) {
                    mesh.visible = false;
                    tracer.active = false;
                }
            },
            dispose: () => {
                mesh.visible = false;
                tracer.active = false;
            }
        };
        this.effects.push(effect);
    }

    /**
     * 清理所有特效
     */
    clear() {
        this.effects.forEach(e => e.dispose());
        this.particles.forEach(p => p.dispose());
        this.effects = [];
        this.particles = [];
    }
}
