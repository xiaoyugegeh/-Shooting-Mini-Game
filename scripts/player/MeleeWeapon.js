/**
 * MeleeWeapon.js - 近战武器系统
 * 实现玩家近战攻击：挥砍、范围检测、伤害判定
 * 参考tps-controls的射击系统改造为近战逻辑
 */
import * as THREE from 'three';

export class MeleeWeapon {
    constructor(scene, player, cameraController) {
        this.scene = scene;
        this.player = player;
        this.cameraController = cameraController;

        // 攻击参数
        this.damage = 35;            // 每次攻击伤害
        this.attackRange = 3.0;      // 攻击范围
        this.attackCooldown = 0.5;   // 攻击冷却时间
        this.lastAttackTime = 0;     // 上次攻击时间

        // 攻击动画状态
        this.isAttacking = false;
        this.attackAnimTime = 0;
        this.attackAnimDuration = 0.4;

        // 命中回调
        this.onHit = null;           // 命中怪兽回调
        this.onAttack = null;        // 攻击发起回调

        // 射线检测器
        this.raycaster = new THREE.Raycaster();

        // 攻击轨迹特效回调
        this.onSlashEffect = null;
    }

    /**
     * 执行近战攻击
     * @param {Array} monsters - 怪兽列表
     * @returns {Object} 攻击结果
     */
    attack(monsters) {
        const now = performance.now() / 1000;

        if (now - this.lastAttackTime < this.attackCooldown) {
            return { attacked: false };
        }

        if (this.isAttacking) {
            return { attacked: false };
        }

        this.lastAttackTime = now;
        this.isAttacking = true;
        this.attackAnimTime = 0;

        // 攻击发起回调
        if (this.onAttack) this.onAttack();

        // 计算攻击方向（相机朝向）
        const camera = this.cameraController.camera;
        const origin = new THREE.Vector3();
        camera.getWorldPosition(origin);
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        // 攻击起点（角色前方）
        const playerPos = this.player.position;
        const attackOrigin = new THREE.Vector3(
            playerPos.x,
            playerPos.y + 1.2,
            playerPos.z
        );

        // 触发挥砍特效
        if (this.onSlashEffect) {
            this.onSlashEffect(attackOrigin, direction);
        }

        // 设置射线
        this.raycaster.set(attackOrigin, direction);
        this.raycaster.far = this.attackRange;

        // 检测命中怪兽
        let hit = false;
        let killedMonster = null;

        for (const monster of monsters) {
            if (!monster.isAlive) continue;

            const result = monster.checkMeleeHit(this.raycaster, this.attackRange);
            if (result) {
                hit = true;
                const isKill = monster.takeDamage(this.damage);
                killedMonster = isKill ? monster : null;

                if (this.onHit) {
                    this.onHit(monster, this.damage, isKill, result.point);
                }
                break; // 只命中一个目标
            }
        }

        return { attacked: true, hit, killedMonster };
    }

    /**
     * 更新近战武器
     */
    update(delta) {
        if (this.isAttacking) {
            this.attackAnimTime += delta;
            if (this.attackAnimTime >= this.attackAnimDuration) {
                this.isAttacking = false;
                this._resetAnimation();
            } else {
                this._updateAttackAnimation();
            }
        }
    }

    /**
     * 更新攻击动画
     */
    _updateAttackAnimation() {
        const t = this.attackAnimTime / this.attackAnimDuration;
        const swing = Math.sin(t * Math.PI);

        // 右臂挥砍动画
        if (this.player.rightArm) {
            this.player.rightArm.rotation.x = -swing * 1.8;
            this.player.rightArm.rotation.z = swing * 0.5;
        }
        // 左臂平衡
        if (this.player.leftArm) {
            this.player.leftArm.rotation.x = swing * 0.3;
        }
    }

    /**
     * 重置动画
     */
    _resetAnimation() {
        if (this.player.rightArm) {
            this.player.rightArm.rotation.x = 0;
            this.player.rightArm.rotation.z = 0;
        }
        if (this.player.leftArm) {
            this.player.leftArm.rotation.x = 0;
        }
    }

    /**
     * 获取攻击冷却进度
     */
    getCooldownProgress() {
        const now = performance.now() / 1000;
        const elapsed = now - this.lastAttackTime;
        return Math.min(1, elapsed / this.attackCooldown);
    }

    /**
     * 是否可以攻击
     */
    canAttack() {
        const now = performance.now() / 1000;
        return (now - this.lastAttackTime >= this.attackCooldown) && !this.isAttacking;
    }

    /**
     * 重置
     */
    reset() {
        this.isAttacking = false;
        this.attackAnimTime = 0;
        this.lastAttackTime = 0;
        this._resetAnimation();
    }
}
