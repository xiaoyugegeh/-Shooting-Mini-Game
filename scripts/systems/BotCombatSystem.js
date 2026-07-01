/**
 * BotCombatSystem.js - 人机对决战斗系统
 * 管理Bot生成、AI更新、玩家受击、胜负判定、击杀统计
 */
import * as THREE from 'three';
import { Bot } from '../ai/Bot.js';

export class BotCombatSystem {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.player = game.player;
        this.cameraController = game.cameraController;
        this.effects = game.visualEffects;
        this.audio = game.audio;
        this._hud = null;  // 延迟解析（通过getter访问）
        this.colliders = game.colliders;

        this.bots = [];
        this.totalBots = 3;          // 1v3
        this.isActive = false;
        this.isGameOver = false;
        this.isVictory = false;

        // 战斗统计
        this.stats = {
            kills: 0,
            shotsFired: 0,
            hits: 0,
            damageDealt: 0,
            damageTaken: 0,
            startTime: 0,
            timeElapsed: 0
        };

        // 射线检测器（用于Bot射击玩家）
        this._botRaycaster = new THREE.Raycaster();
        // 玩家命中盒（球体）
        this._playerHeadSphere = new THREE.Sphere(new THREE.Vector3(), 0.4);
        this._playerBodySphere = new THREE.Sphere(new THREE.Vector3(), 0.6);
        // 复用对象（避免每次检测创建新Box3/Vector3导致GC）
        this._envBox = new THREE.Box3();
        this._envHitPoint = new THREE.Vector3();
        this._headHitPoint = new THREE.Vector3();
        this._bodyHitPoint = new THREE.Vector3();
    }

    get hud() {
        return this._hud || (this._hud = this.game.botHUD);
    }

    /**
     * 启动人机对决
     */
    start() {
        this.isActive = true;
        this.isGameOver = false;
        this.isVictory = false;
        this.stats = {
            kills: 0, shotsFired: 0, hits: 0,
            damageDealt: 0, damageTaken: 0,
            startTime: performance.now() / 1000,
            timeElapsed: 0
        };
        // 清理旧Bot
        this.bots.forEach(b => b.dispose());
        this.bots = [];
        // 生成新Bot
        this._spawnBots();
    }

    /**
     * 生成3个Bot（降低难度：减少血量/伤害，增加射击间隔和散布）
     */
    _spawnBots() {
        // 难度递增但整体降低：3个Bot分别简单/普通/困难
        const configs = [
            { health: 60,  damage: 4,  speed: 2.6, fireRate: 0.7,  spread: 0.09, name: 'BOT-NOVICE' },
            { health: 80,  damage: 5,  speed: 3.0, fireRate: 0.55, spread: 0.07, name: 'BOT-AGENT'  },
            { health: 100, damage: 7,  speed: 3.4, fireRate: 0.45, spread: 0.05, name: 'BOT-ELITE'  }
        ];
        for (let i = 0; i < this.totalBots; i++) {
            const pos = this._getSpawnPosition(i);
            const bot = new Bot(this.scene, pos, {
                id: i,
                ...configs[i],
                colliders: this.colliders,
                game: this.game,
                onShoot: (bot, origin, dir, dmg) => this._onBotShoot(bot, origin, dir, dmg),
                onHit: (dmg, bot, isHead) => this._onBotHit(dmg, bot, isHead),
                onDeath: (bot) => this._onBotDeath(bot)
            });
            this.bots.push(bot);
        }
    }

    /**
     * 获取Bot生成位置（散布在玩家周围）
     */
    _getSpawnPosition(index) {
        const angle = (index / this.totalBots) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 20 + Math.random() * 8;
        const x = this.player.position.x + Math.cos(angle) * dist;
        const z = this.player.position.z + Math.sin(angle) * dist;
        // 边界约束
        const bound = 40;
        return new THREE.Vector3(
            Math.max(-bound, Math.min(bound, x)),
            0,
            Math.max(-bound, Math.min(bound, z))
        );
    }

    /**
     * Bot射击回调：射线检测玩家命中
     */
    _onBotShoot(bot, origin, direction, damage) {
        // 设置射线
        this._botRaycaster.set(origin, direction);
        this._botRaycaster.far = bot.weaponRange;

        // 更新玩家命中盒位置
        this._playerHeadSphere.center.set(
            this.player.position.x,
            this.player.position.y + 1.65,  // 头部高度
            this.player.position.z
        );
        this._playerBodySphere.center.set(
            this.player.position.x,
            this.player.position.y + 1.0,   // 胸部高度
            this.player.position.z
        );

        // 检测命中玩家（复用Vector3避免GC）
        const headHit = this._botRaycaster.ray.intersectSphere(this._playerHeadSphere, this._headHitPoint);
        const bodyHit = headHit ? null : this._botRaycaster.ray.intersectSphere(this._playerBodySphere, this._bodyHitPoint);

        // 同时检测环境遮挡（避免穿墙射击）
        const envHit = this._checkEnvironmentHit(origin, direction, bot.weaponRange);

        let hitPlayer = false;
        let headshot = false;
        let hitDistance = bot.weaponRange;

        if (headHit) {
            const dist = origin.distanceTo(headHit);
            if (!envHit || dist <= envHit.distance) {
                hitPlayer = true;
                headshot = true;
                hitDistance = dist;
            }
        } else if (bodyHit) {
            const dist = origin.distanceTo(bodyHit);
            if (!envHit || dist <= envHit.distance) {
                hitPlayer = true;
                hitDistance = dist;
            }
        }

        // 创建Bot弹道特效
        this._createBotTracer(origin, direction, hitDistance);

        if (hitPlayer) {
            // 爆头伤害加倍
            const finalDamage = headshot ? damage * 2 : damage;
            this.player.takeDamage(finalDamage);
            this.stats.damageTaken += finalDamage;
            // 受击特效
            if (this.effects) this.effects.createPlayerHurtEffect(this.player.position);
            if (this.audio) this.audio.playHit(false);
            // HUD反馈
            if (this.hud) {
                this.hud.showDamageScreen(bot.position, this.player.position, this.cameraController.yaw);
                this.hud.showDamageNumber(finalDamage, false, headshot);
            }
            // 检查玩家死亡
            if (this.player.health <= 0) {
                this._gameOver();
            }
        }
    }

    /**
     * 检测环境遮挡（复用Box3/Vector3避免GC）
     */
    _checkEnvironmentHit(origin, direction, range) {
        for (const collider of this.colliders) {
            // 复用this._envBox避免每次创建新Box3
            this._envBox.min.set(collider.min.x, collider.min.y, collider.min.z);
            this._envBox.max.set(collider.max.x, collider.max.y, collider.max.z);
            const hit = this._botRaycaster.ray.intersectBox(this._envBox, this._envHitPoint);
            if (hit) {
                const dist = origin.distanceTo(this._envHitPoint);
                if (dist <= range) {
                    return { distance: dist, point: this._envHitPoint };
                }
            }
        }
        return null;
    }

    /**
     * 创建Bot弹道特效
     */
    _createBotTracer(origin, direction, distance) {
        if (!this.effects) return;
        // 复用VisualEffects的弹道接口（如果有）
        if (this.effects.createTracer) {
            this.effects.createTracer(origin, direction, distance, 0xff4655);
        }
    }

    /**
     * Bot受击回调
     */
    _onBotHit(damage, bot, isHead) {
        this.stats.damageDealt += damage;
    }

    /**
     * Bot死亡回调
     */
    _onBotDeath(bot) {
        this.stats.kills++;
        // 死亡特效
        if (this.effects) this.effects.createDeathExplosion(bot.position);
        if (this.audio) this.audio.playHit(true);
        // 击杀提示（使用当前武器名）
        if (this.game.uiRouter) {
            let weaponName = 'PHANTOM';
            try {
                const current = this.game.weaponSelect && this.game.weaponSelect.getCurrentWeapon();
                if (current && current.name) weaponName = current.name;
            } catch (e) { /* 使用默认值 */ }
            this.game.uiRouter.addKillFeed('玩家', weaponName, bot.name);
        }
        // 检查胜利
        const aliveBots = this.bots.filter(b => b.isAlive).length;
        if (aliveBots === 0) {
            this._victory();
        }
    }

    /**
     * 玩家胜利
     */
    _victory() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.isVictory = true;
        this.stats.timeElapsed = performance.now() / 1000 - this.stats.startTime;
        // 2秒后显示结算
        setTimeout(() => {
            if (this.game.showBotModeResult) {
                this.game.showBotModeResult(true, this.stats);
            }
        }, 2000);
    }

    /**
     * 玩家失败
     */
    _gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.isVictory = false;
        this.stats.timeElapsed = performance.now() / 1000 - this.stats.startTime;
        // 1.5秒后显示结算
        setTimeout(() => {
            if (this.game.showBotModeResult) {
                this.game.showBotModeResult(false, this.stats);
            }
        }, 1500);
    }

    /**
     * 主更新
     */
    update(delta) {
        if (!this.isActive || this.isGameOver) return;

        // 更新所有Bot
        for (let i = 0; i < this.bots.length; i++) {
            this.bots[i].update(delta, this.player);
        }

        // 清理已死亡且model.visible=false的Bot（释放GPU资源）
        // 注意：不直接从数组移除，保留用于结算统计
    }

    /**
     * 获取存活Bot数量
     */
    getAliveBots() {
        let count = 0;
        for (let i = 0; i < this.bots.length; i++) {
            if (this.bots[i].isAlive) count++;
        }
        return count;
    }

    /**
     * 获取Bot列表（用于小地图显示）
     */
    getBots() {
        return this.bots;
    }

    stop() {
        this.isActive = false;
        this.bots.forEach(b => b.dispose());
        this.bots = [];
    }

    reset() {
        this.stop();
        this.isGameOver = false;
        this.isVictory = false;
    }
}
