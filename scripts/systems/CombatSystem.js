/**
 * CombatSystem.js - 战斗系统管理器
 * 管理怪兽模式下的战斗逻辑：波次生成、玩家死亡、胜利判定
 */
import * as THREE from 'three';
import { Monster } from '../ai/Monster.js';

export class CombatSystem {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.player = game.player;
        this.cameraController = game.cameraController;
        this.effects = game.visualEffects;
        this.audio = game.audio;
        // 怪兽模式专用HUD（延迟获取，避免初始化顺序问题）
        this._hud = game.monsterHUD;

        // 怪兽列表
        this.monsters = [];

        // 波次系统（多重关卡，越往后怪物越厉害）
        this.currentWave = 0;
        this.maxWaves = 7;
        // 每波怪物数量递增
        this.monstersPerWave = [3, 4, 5, 6, 7, 8, 10];
        // 波次怪兽属性配置（血量/速度/伤害随波次递增）
        this.waveConfigs = [
            { health: 60,  speed: 2.0, damage: 10 },   // 第1波：入门
            { health: 80,  speed: 2.5, damage: 15 },   // 第2波：简单
            { health: 100, speed: 3.0, damage: 20 },   // 第3波：普通
            { health: 130, speed: 3.2, damage: 25 },   // 第4波：困难
            { health: 160, speed: 3.5, damage: 30 },   // 第5波：专家
            { health: 200, speed: 3.8, damage: 35 },   // 第6波：噩梦
            { health: 260, speed: 4.2, damage: 45 }    // 第7波：地狱（Boss波）
        ];
        this.waveStartTime = 0;
        this.waveInterval = 3; // 波次间隔时间
        this.isWaveBreak = false;
        this.waveBreakTime = 0;

        // 战斗统计
        this.stats = {
            monstersKilled: 0,
            totalMonsters: 0,
            damageDealt: 0,
            damageTaken: 0,
            waveCompleted: 0,
            shotsFired: 0,
            hits: 0,                // 命中次数（含非致命，用于命中率计算）
            startTime: 0,
            timeElapsed: 0
        };

        // 状态
        this.isActive = false;
        this.isGameOver = false;
        this.isVictory = false;

        // 碰撞盒引用
        this.colliders = game.colliders;
    }

    /**
     * 启动战斗系统
     */
    start() {
        this.isActive = true;
        this.isGameOver = false;
        this.isVictory = false;
        this.currentWave = 0;
        this.stats = {
            monstersKilled: 0,
            totalMonsters: 0,
            damageDealt: 0,
            damageTaken: 0,
            waveCompleted: 0,
            shotsFired: 0,
            hits: 0,                // 命中次数（含非致命，用于命中率计算）
            startTime: performance.now() / 1000,
            timeElapsed: 0
        };
        this.monsters = [];
        this._startNextWave();
    }

    /**
     * 获取怪兽模式HUD（延迟解析，避免初始化顺序依赖）
     */
    get hud() {
        return this._hud || (this._hud = this.game.monsterHUD);
    }

    /**
     * 停止战斗系统
     */
    stop() {
        this.isActive = false;
        // 清理所有怪兽（释放GPU资源）
        this.monsters.forEach(m => m.dispose());
        this.monsters = [];
    }

    /**
     * 开始下一波
     */
    _startNextWave() {
        this.currentWave++;
        if (this.currentWave > this.maxWaves) {
            this._victory();
            return;
        }

        const count = this.monstersPerWave[this.currentWave - 1];
        this._spawnWave(count);

        // 波次过渡动画（通过UIRouter）
        if (this.game.uiRouter) {
            this.game.uiRouter.showWaveTransition(this.currentWave, this.maxWaves);
        }

        // 波次通知（根据波次难度显示不同提示）
        const waveNames = ['', '入门', '简单', '普通', '困难', '专家', '噩梦', '地狱'];
        const waveName = waveNames[this.currentWave] || '挑战';
        if (this.currentWave === this.maxWaves) {
            this.hud.showNotification('最终波 · 地狱', `${count} 只怪兽来袭！生存到底！`);
        } else if (this.currentWave >= 5) {
            this.hud.showNotification(`第 ${this.currentWave} 波 · ${waveName}`, `${count} 只怪兽来袭！`);
        } else {
            this.hud.showNotification(`第 ${this.currentWave} 波 · ${waveName}`, `${count} 只怪兽来袭！`);
        }
    }

    /**
     * 生成一波怪兽
     */
    _spawnWave(count) {
        for (let i = 0; i < count; i++) {
            this._spawnMonster(i);
        }
    }

    /**
     * 生成单只怪兽（玩家背后或侧方，避开视野和墙壁）
     */
    _spawnMonster(index) {
        const pos = this._getSpawnPosition();
        const config = this.waveConfigs[this.currentWave - 1];

        const monster = new Monster(this.scene, pos, {
            id: this.monsters.length + index,
            health: config.health,
            damage: config.damage,
            speed: config.speed,
            colliders: this.colliders,
            game: this.game,  // 传入game引用，用于暂停/结束状态检查
            onAttack: (damage, monster) => this._onMonsterAttack(damage, monster),
            onHit: (damage, monster) => this._onMonsterHit(damage, monster),
            onDeath: (monster) => this._onMonsterDeath(monster)
        });
        monster.init();
        this.monsters.push(monster);
        this.stats.totalMonsters++;
    }

    /**
     * 获取生成位置（玩家周围20-30米，背后或侧方，避开墙壁）
     */
    _getSpawnPosition() {
        // 获取玩家水平朝向与右方（复用相机控制器API）
        const forward = this.cameraController.getForwardVector();
        const right = this.cameraController.getRightVector();

        let pos = new THREE.Vector3();
        for (let attempt = 0; attempt < 10; attempt++) {
            // 在玩家背后或侧方生成（避开前方视野）
            // back分量恒为负（向后），保证生成点在玩家背后半球
            const back = -(0.3 + Math.random() * 0.7);  // -0.3 ~ -1.0
            const side = (Math.random() - 0.5) * 2.0;    // -1.0 ~ 1.0
            const distance = 20 + Math.random() * 10;    // 20-30米

            pos.copy(this.player.position);
            pos.addScaledVector(forward, back * distance);
            pos.addScaledVector(right, side * distance);
            pos.y = 0;

            // 边界约束
            pos.x = Math.max(-40, Math.min(40, pos.x));
            pos.z = Math.max(-40, Math.min(40, pos.z));

            // 避免生成在墙内
            if (!this._isPositionBlocked(pos)) {
                return pos;
            }
        }
        // 兜底：使用最后计算的位置
        return pos;
    }

    /**
     * 检查位置是否被墙壁占据
     */
    _isPositionBlocked(pos) {
        const r = 1.0; // 检查半径
        for (const collider of this.colliders) {
            if (collider.min.y > 2 || collider.max.y < 0) continue;
            if (pos.x + r > collider.min.x && pos.x - r < collider.max.x &&
                pos.z + r > collider.min.z && pos.z - r < collider.max.z) {
                return true;
            }
        }
        return false;
    }

    /**
     * 更新战斗系统
     */
    update(delta) {
        if (!this.isActive || this.isGameOver) return;

        // 更新统计
        this.stats.timeElapsed = (performance.now() / 1000) - this.stats.startTime;

        // 更新所有怪兽
        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const monster = this.monsters[i];
            monster.update(delta, this.player);

            // 清理已死亡且动画完成的怪兽（释放GPU资源）
            if (!monster.isAlive && !monster.model.visible) {
                monster.dispose();
                this.monsters.splice(i, 1);
            }
        }

        // 优先检查玩家死亡（避免"死亡同帧胜利"的竞态）
        if (this.player.health <= 0 && !this.isGameOver) {
            this._gameOver();
            return;
        }

        // 检查波次完成（用计数器替代filter()避免GC压力）
        if (!this.isWaveBreak) {
            let aliveCount = 0;
            for (let i = 0; i < this.monsters.length; i++) {
                if (this.monsters[i].isAlive) { aliveCount++; break; }  // 只要有1只活着就足够
            }
            if (aliveCount === 0 && this.currentWave <= this.maxWaves) {
                this.isWaveBreak = true;
                this.waveBreakTime = 0;
                this.stats.waveCompleted++;
                this.hud.showNotification(
                    `第 ${this.currentWave} 波清除完成`,
                    '准备迎接下一波...'
                );
            }
        } else {
            // 波次间隔
            this.waveBreakTime += delta;
            if (this.waveBreakTime >= this.waveInterval) {
                this.isWaveBreak = false;
                this._startNextWave();
            }
        }
    }

    /**
     * 怪兽攻击玩家回调
     */
    _onMonsterAttack(damage, monster) {
        this.player.takeDamage(damage);
        this.stats.damageTaken += damage;

        // 受伤特效
        this.effects.createPlayerHurtEffect(this.player.position);
        this.audio.playHit(false);

        // 屏幕震动效果 + 受击方向指示（传入攻击者位置和玩家朝向）
        this.hud.showDamageScreen(
            monster.position,
            this.player.position,
            this.cameraController.yaw
        );

        // 显示伤害数字
        this.hud.showDamageNumber(damage, false);
    }

    /**
     * 怪兽被击中回调
     */
    _onMonsterHit(damage, monster) {
        this.stats.damageDealt += damage;
        // 命中标记和伤害数字由Game._handleMonsterShoot统一显示，避免重复
    }

    /**
     * 怪兽死亡回调
     */
    _onMonsterDeath(monster) {
        this.stats.monstersKilled++;

        // 击杀回血：玩家恢复血量（越往后波次回血越多，鼓励战斗）
        const healAmount = 15 + this.currentWave * 5;  // 第1波20血，第7波50血
        const oldHealth = this.player.health;
        this.player.health = Math.min(this.player.maxHealth, this.player.health + healAmount);
        const actualHeal = Math.round(this.player.health - oldHealth);

        // 显示回血提示
        if (actualHeal > 0 && this.hud) {
            this.hud.showNotification('击杀回血', `+${actualHeal} HP`);
            // 恢复血条颜色为正常
            if (this.hud.elements && this.hud.elements.healthBar) {
                this.hud.elements.healthBar.style.background = 'linear-gradient(90deg, #BD3944, #FF4655)';
            }
        }

        // 死亡特效和音效由Game._handleMonsterShoot统一处理，避免重复
    }

    /**
     * 游戏失败
     */
    _gameOver() {
        this.isGameOver = true;
        this.isActive = false;
        this.game.input.exitPointerLock();
        setTimeout(() => {
            this.game.showMonsterModeResult(false, this.stats);
        }, 1500);
    }

    /**
     * 游戏胜利
     */
    _victory() {
        this.isVictory = true;
        this.isGameOver = true;
        this.isActive = false;
        this.game.input.exitPointerLock();
        this.hud.showNotification('全部波次清除！', '战斗胜利！');
        setTimeout(() => {
            this.game.showMonsterModeResult(true, this.stats);
        }, 2000);
    }

    /**
     * 获取当前波次信息（用计数器替代filter避免GC）
     */
    getWaveInfo() {
        let aliveCount = 0;
        for (let i = 0; i < this.monsters.length; i++) {
            if (this.monsters[i].isAlive) aliveCount++;
        }
        return {
            current: this.currentWave,
            max: this.maxWaves,
            aliveCount: aliveCount,
            totalCount: this.monstersPerWave[this.currentWave - 1] || 0,
            isBreak: this.isWaveBreak,
            breakTime: this.waveBreakTime,
            breakInterval: this.waveInterval
        };
    }

    /**
     * 获取所有活着的怪兽（用循环替代filter避免GC）
     */
    getAliveMonsters() {
        const result = [];
        for (let i = 0; i < this.monsters.length; i++) {
            if (this.monsters[i].isAlive) result.push(this.monsters[i]);
        }
        return result;
    }

    /**
     * 重置战斗系统
     */
    reset() {
        this.stop();
        this.isGameOver = false;
        this.isVictory = false;
        this.isWaveBreak = false;
    }
}
