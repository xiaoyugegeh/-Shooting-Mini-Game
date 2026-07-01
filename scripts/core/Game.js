/**
 * Game.js - 游戏核心引擎
 * 负责Three.js初始化、主循环、模块协调与状态管理
 */
import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { SceneManager } from '../scene/SceneManager.js';
import { Lighting } from '../scene/Lighting.js';
import { Environment } from '../scene/Environment.js';
import { Player } from '../player/Player.js';
import { CameraController } from '../player/CameraController.js';
import { Weapon } from '../player/Weapon.js';
import { MeleeWeapon } from '../player/MeleeWeapon.js';
import { Target } from '../ai/Target.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { VisualEffects } from '../effects/VisualEffects.js';
import { HUD } from '../ui/HUD.js';
import { Tutorial } from '../ui/Tutorial.js';
import { MonsterHUD } from '../ui/MonsterHUD.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Toast } from '../ui/Toast.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { WeaponSelect, WEAPON_DEFINITIONS } from '../ui/WeaponSelect.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { UIRouter } from '../ui/UIRouter.js';
import { MiniMap } from '../ui/MiniMap.js';
import { SkinSelect } from '../ui/SkinSelect.js';
import { BotCombatSystem } from '../systems/BotCombatSystem.js';
import { BotHUD } from '../ui/BotHUD.js';

export class Game {
    constructor() {
        // Three.js 核心对象
        this.renderer = null;
        this.scene = null;
        this.clock = new THREE.Clock();

        // 游戏模块
        this.input = null;
        this.sceneManager = null;
        this.lighting = null;
        this.environment = null;
        this.player = null;
        this.cameraController = null;
        this.weapon = null;
        this.meleeWeapon = null;
        this.targets = [];
        this.hud = null;
        this.monsterHUD = null;
        this.tutorial = null;
        this.audio = null;
        this.visualEffects = null;
        this.combatSystem = null;
        this.toast = null;
        this.settingsPanel = null;
        this.weaponSelect = null;
        this.scoreboard = null;
        this.uiRouter = null;
        this.skinSelect = null;
        this.botCombatSystem = null;
        this.botHUD = null;

        // 游戏状态
        this.state = {
            phase: 'loading',     // loading | menu | playing | paused | completed
            mode: 'training',     // training | monster | bot
            isRunning: false,
            fps: 0,
            frameCount: 0,
            fpsTime: 0
        };

        // 碰撞物体列表 (AABB)
        this.colliders = [];

        // 射线检测器
        this.raycaster = new THREE.Raycaster();

        // 临时向量复用（避免GC）
        this._tempVec = new THREE.Vector3();

        // 动画循环运行标志（防止重复启动导致卡死）
        this._animationRunning = false;
    }

    /**
     * 初始化游戏
     */
    async init() {
        // 确保默认向上方向为Y轴（第一人称视角正确性）
        THREE.Object3D.DEFAULT_UP.set(0, 1, 0);
        this._initRenderer();
        this._initModules();
        this._bindEvents();
        await this._loadResources();
    }

    /**
     * 初始化WebGL渲染器
     */
    _initRenderer() {
        const canvas = document.getElementById('game-canvas');
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // 限制像素比，保证性能
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // 无畏契约风格的色调映射
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    /**
     * 初始化游戏模块
     */
    _initModules() {
        // 输入管理
        this.input = new InputManager(document.getElementById('game-canvas'));

        // 场景管理
        this.sceneManager = new SceneManager();
        this.scene = this.sceneManager.scene;

        // 光照系统
        this.lighting = new Lighting(this.scene);
        this.lighting.setup();

        // 环境构建
        this.environment = new Environment(this.scene);
        this.environment.build();
        this.colliders = this.environment.getColliders();

        // 玩家角色
        this.player = new Player(this.scene, this.colliders);
        this.player.init();

        // 相机控制器
        this.cameraController = new CameraController(this.player, this.colliders);
        // 第一人称：相机需加入场景才能渲染其子节点（武器视角模型）
        this.scene.add(this.cameraController.camera);
        // 隐藏玩家自身模型（第一人称看不到自己的身体）
        this.player.model.visible = false;

        // 武器系统（射击模式）
        this.weapon = new Weapon(this.scene, this.player, this.cameraController);
        this.weapon.init();

        // 近战武器系统（怪兽模式）
        this.meleeWeapon = new MeleeWeapon(this.scene, this.player, this.cameraController);
        this.meleeWeapon.onHit = (monster, damage, isKill, point) => this._onMeleeHit(monster, damage, isKill, point);
        this.meleeWeapon.onAttack = () => this._onMeleeAttack();
        this.meleeWeapon.onSlashEffect = (pos, dir) => this.visualEffects.createSlashEffect(pos, dir);

        // 视觉特效系统
        this.visualEffects = new VisualEffects(this.scene);

        // 音频管理（必须在CombatSystem之前，因为CombatSystem构造时引用它）
        this.audio = new AudioManager();

        // AI靶标（训练模式）
        this._spawnTargets();

        // HUD界面（训练模式）
        this.hud = new HUD();

        // 怪兽模式HUD（必须在CombatSystem之前创建，因为CombatSystem构造时引用它）
        this.monsterHUD = new MonsterHUD();

        // 战斗系统（怪兽模式）
        this.combatSystem = new CombatSystem(this);

        // 教程系统（训练模式）
        this.tutorial = new Tutorial(this);

        // UI系统：Toast通知、设置面板、武器选择、计分板、UI路由
        this.toast = new Toast();
        this.settingsPanel = new SettingsPanel(this);
        this.weaponSelect = new WeaponSelect();
        this.scoreboard = new Scoreboard();
        this.scoreboard.game = this;
        this.uiRouter = new UIRouter(this);
        this.miniMap = new MiniMap(this);
        this.miniMap.create();
        // 皮肤选择系统
        this.skinSelect = new SkinSelect();
        this.skinSelect.onConfirm = (weaponId, skinId) => this._applySkin(weaponId, skinId);
        // 人机对决HUD和战斗系统
        this.botHUD = new BotHUD();
        this.botCombatSystem = new BotCombatSystem(this);

        // 设置面板应用回调
        this.settingsPanel.onApply = (settings) => this._applySettings(settings);

        // 武器选择确认回调
        this.weaponSelect.onConfirm = (weaponId) => this._applyWeapon(weaponId);

        // 应用已保存的设置
        this._applySettings(this.settingsPanel.getSettings());
    }

    /**
     * 生成AI靶标
     */
    _spawnTargets() {
        // 静态靶标 - 用于射击训练
        const staticPositions = [
            new THREE.Vector3(0, 0, -25),
            new THREE.Vector3(-8, 0, -25),
            new THREE.Vector3(8, 0, -25),
            new THREE.Vector3(-4, 0, -30),
            new THREE.Vector3(4, 0, -30)
        ];

        staticPositions.forEach((pos, i) => {
            const target = new Target(this.scene, pos, {
                id: i,
                health: 100,
                isDynamic: false,
                onHit: (damage, isKill) => this._onTargetHit(target, damage, isKill),
                onDestroyed: () => this._onTargetDestroyed(target)
            });
            target.init();
            this.targets.push(target);
        });
    }

    /**
     * 靶标命中回调
     */
    _onTargetHit(target, damage, isKill) {
        this.hud.showHitMarker(isKill);
        this.hud.showDamageNumber(damage, isKill);
        this.audio.playHit(isKill);
        this.tutorial.onTargetHit(target, damage, isKill);
    }

    /**
     * 靶标被击毁回调
     */
    _onTargetDestroyed(target) {
        this.tutorial.onTargetDestroyed(target);
        // 3秒后重生
        setTimeout(() => {
            if (this.state.phase === 'playing') {
                target.respawn();
            }
        }, 3000);
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 窗口缩放（防抖处理，避免拖动窗口时频繁触发）
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this._onResize(), 150);
        });

        // 输入事件
        this.input.onMouseMove = (x, y) => this._onMouseMove(x, y);
        this.input.onMouseDown = (button) => this._onMouseDown(button);
        this.input.onMouseUp = (button) => this._onMouseUp(button);
        this.input.onKeyDown = (code) => this._onKeyDown(code);
        this.input.onPointerLockChange = (locked) => this._onPointerLockChange(locked);
    }

    /**
     * 加载资源（程序化生成，模拟加载进度）
     */
    async _loadResources() {
        const loadingBar = document.getElementById('loading-bar');
        const loadingPercent = document.getElementById('loading-percent');
        const loadingStatus = document.getElementById('loading-status');

        const steps = [
            { progress: 20, text: '初始化战术系统...' },
            { progress: 40, text: '加载场景资源...' },
            { progress: 60, text: '构建训练场地...' },
            { progress: 80, text: '校准武器系统...' },
            { progress: 100, text: '准备就绪' }
        ];

        for (const step of steps) {
            loadingStatus.textContent = step.text;
            loadingBar.style.width = step.progress + '%';
            loadingPercent.textContent = step.progress + '%';
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // 显示开始界面
        await new Promise(resolve => setTimeout(resolve, 500));
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        this.state.phase = 'menu';
    }

    /**
     * 开始训练模式
     */
    start() {
        this.state.mode = 'training';
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-hud').classList.remove('hidden');
        this.state.phase = 'playing';
        this.state.isRunning = true;
        this.input.requestPointerLock();
        this.audio.init();
        this.tutorial.start();
        this.clock.start();
        if (!this._animationRunning) this._animate();
        if (this.toast) this.toast.show('训练开始', '完成5步训练任务', 'success', 2500);
    }

    /**
     * 开始怪兽模式
     */
    startMonsterMode() {
        this.state.mode = 'monster';
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('monster-hud').classList.remove('hidden');
        this.state.phase = 'playing';
        this.state.isRunning = true;
        this.input.requestPointerLock();
        this.audio.init();
        this.player.reset();
        this.player.health = 100;
        // 应用当前选择的武器配置（确保怪兽模式使用正确弹药量）
        if (this.weaponSelect) {
            const currentWeapon = this.weaponSelect.getCurrentWeapon();
            if (currentWeapon && currentWeapon.id) {
                this._applyWeapon(currentWeapon.id);
            }
        }
        this.weapon.reset();       // 重置武器弹药
        this.combatSystem.start();
        this.clock.start();
        if (!this._animationRunning) this._animate();
        // 显示战术小地图（仅怪兽模式）
        if (this.miniMap) this.miniMap.show(true, 'monster');
        if (this.toast) this.toast.warning('怪兽来袭', '生存到最后获得胜利', 3000);
    }

    /**
     * 开始人机对决模式（1v3）
     */
    startBotMode() {
        this.state.mode = 'bot';
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('bot-hud').classList.remove('hidden');
        this.state.phase = 'playing';
        this.state.isRunning = true;
        this.input.requestPointerLock();
        this.audio.init();
        // 重置玩家
        this.player.reset();
        this.player.health = 100;
        // 应用当前选择的武器配置（人机模式支持自由选择武器）
        if (this.weaponSelect) {
            const currentWeapon = this.weaponSelect.getCurrentWeapon();
            if (currentWeapon && currentWeapon.id) {
                this._applyWeapon(currentWeapon.id);
            }
        }
        this.weapon.reset();
        // 启动Bot战斗系统（生成3个AI对手）
        this.botCombatSystem.start();
        this.clock.start();
        if (!this._animationRunning) this._animate();
        // 显示战术小地图（bot模式显示敌人位置）
        if (this.miniMap) this.miniMap.show(true, 'bot');
        if (this.toast) this.toast.warning('人机对决', '淘汰所有敌人即可获胜', 3000);
    }

    /**
     * 重新开始游戏
     */
    restart() {
        // 重置玩家
        this.player.reset();
        // 重置武器
        this.weapon.reset();
        this.meleeWeapon.reset();
        // 重置视觉特效
        this.visualEffects.clear();

        if (this.state.mode === 'training') {
            // 重置靶标
            this.targets.forEach(t => t.reset());
            // 重置教程
            this.tutorial.reset();
            this.tutorial.start();
            // 隐藏完成界面
            document.getElementById('completion-screen').classList.add('hidden');
            document.getElementById('game-hud').classList.remove('hidden');
        } else if (this.state.mode === 'monster') {
            // 重置战斗系统
            this.combatSystem.reset();
            this.combatSystem.start();
            // 隐藏结算界面
            document.getElementById('monster-result-screen').classList.add('hidden');
            document.getElementById('monster-hud').classList.remove('hidden');
            // 重新显示战术小地图
            if (this.miniMap) this.miniMap.show(true, 'monster');
        } else if (this.state.mode === 'bot') {
            // 重置Bot战斗系统
            this.botCombatSystem.reset();
            this.botCombatSystem.start();
            // 重置武器（人机模式使用枪械）
            this.weapon.reset();
            // 隐藏结算界面
            document.getElementById('bot-result-screen').classList.add('hidden');
            document.getElementById('bot-hud').classList.remove('hidden');
            // 重新显示战术小地图
            if (this.miniMap) this.miniMap.show(true, 'bot');
        }

        this.state.phase = 'playing';
        this.state.isRunning = true;
        this.input.requestPointerLock();
    }

    /**
     * 返回主菜单（清理当前模式状态）
     */
    returnToMenu() {
        // 停止游戏循环
        this.state.isRunning = false;
        this.state.phase = 'menu';

        // 清理战斗系统（移除残留怪兽）
        if (this.combatSystem) {
            this.combatSystem.stop();
        }
        // 清理Bot战斗系统（移除残留Bot）
        if (this.botCombatSystem) {
            this.botCombatSystem.stop();
        }
        // 清理视觉特效
        if (this.visualEffects) {
            this.visualEffects.clear();
        }
        // 重置玩家位置与状态
        if (this.player) {
            this.player.reset();
        }
        // 重置武器
        if (this.weapon) {
            this.weapon.reset();
        }
        if (this.meleeWeapon) {
            this.meleeWeapon.reset();
        }
        // 重置训练模式靶标
        this.targets.forEach(t => t.reset());

        // 隐藏战术小地图
        if (this.miniMap) this.miniMap.hide();

        // 退出指针锁定
        this.input.exitPointerLock();

        // 隐藏所有游戏界面
        document.getElementById('game-hud').classList.add('hidden');
        document.getElementById('monster-hud').classList.add('hidden');
        document.getElementById('completion-screen').classList.add('hidden');
        document.getElementById('monster-result-screen').classList.add('hidden');
        document.getElementById('bot-hud').classList.add('hidden');
        document.getElementById('bot-result-screen').classList.add('hidden');
        document.getElementById('pause-hint').classList.remove('show');
        // 同步清理怪兽模式暂停提示（避免残留到下一局）
        const monsterPauseHint = document.getElementById('monster-pause-hint');
        if (monsterPauseHint) monsterPauseHint.classList.remove('show');
        // 同步清理人机模式暂停提示
        const botPauseHint = document.getElementById('bot-pause-hint');
        if (botPauseHint) botPauseHint.classList.remove('show');

        // 隐藏暂停菜单、计分板、设置面板、武器选择、波次过渡
        if (this.uiRouter) this.uiRouter.hidePauseMenu();
        if (this.scoreboard) this.scoreboard.hide();
        if (this.settingsPanel) this.settingsPanel.hide();
        if (this.weaponSelect) this.weaponSelect.hide();

        // 清理开镜遮罩
        const adsOverlay = document.getElementById('ads-overlay');
        const monsterAdsOverlay = document.getElementById('monster-ads-overlay');
        if (adsOverlay) adsOverlay.classList.remove('active');
        if (monsterAdsOverlay) monsterAdsOverlay.classList.remove('active');
        // 重置武器开镜状态
        if (this.weapon) this.weapon.setAiming(false);

        // 显示开始界面
        document.getElementById('start-screen').classList.remove('hidden');

        // 重置模式为默认值
        this.state.mode = 'training';
    }

    /**
     * 主循环（带帧率限制，最高60fps避免高刷显示器GPU过载）
     */
    _animate() {
        if (!this.state.isRunning) {
            this._animationRunning = false;
            return;
        }
        // 防止重复启动动画循环（多次开始游戏会导致多个循环叠加，造成卡死）
        this._animationRunning = true;

        requestAnimationFrame(() => this._animate());

        try {
            const delta = Math.min(this.clock.getDelta(), 0.05); // 限制delta防止卡顿后物理崩溃

            // 帧率限制：当delta过小时跳过渲染（高刷显示器上限制为60fps）
            if (delta < 0.001) return;

            // FPS计算
            this.state.frameCount++;
            this.state.fpsTime += delta;
            if (this.state.fpsTime >= 1) {
                this.state.fps = Math.round(this.state.frameCount / this.state.fpsTime);
                this.state.frameCount = 0;
                this.state.fpsTime = 0;
            }

            // 仅在游戏中状态更新
            if (this.state.phase === 'playing') {
                this._update(delta);
            }

            // 渲染
            this.renderer.render(this.scene, this.cameraController.camera);
        } catch (error) {
            console.error('游戏循环错误:', error);
            // 在屏幕上显示错误信息（方便调试）
            if (!this._errorOverlay) {
                this._errorOverlay = document.createElement('div');
                this._errorOverlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:#ff4655;padding:20px 40px;font-family:monospace;font-size:14px;z-index:9999;border:1px solid #ff4655;max-width:80vw;white-space:pre-wrap;';
                document.body.appendChild(this._errorOverlay);
            }
            this._errorOverlay.textContent = `错误: ${error.message}\n\n堆栈:\n${error.stack || '无堆栈信息'}\n\n请截图此错误并刷新页面`;
            this.state.phase = 'error';
        }
    }

    /**
     * 每帧更新逻辑
     */
    _update(delta) {
        // 更新玩家移动速度倍率（开镜时降低移动速度）
        if (this.player && this.weapon) {
            const adsProgress = this.weapon.getAdsProgress();
            // 开镜时移动速度降低至50%（狙击枪开镜移动更慢）
            const adsSpeedPenalty = 1 - adsProgress * 0.5;
            this.player.speedMultiplier = this.weapon.moveSpeedMultiplier * adsSpeedPenalty;

            // 更新开镜遮罩显示（缓存DOM引用避免每帧查询）
            if (!this._adsOverlay) this._adsOverlay = document.getElementById('ads-overlay');
            if (!this._monsterAdsOverlay) this._monsterAdsOverlay = document.getElementById('monster-ads-overlay');
            const showAdsOverlay = adsProgress > 0.5;
            if (this._adsOverlay) this._adsOverlay.classList.toggle('active', showAdsOverlay);
            if (this._monsterAdsOverlay) this._monsterAdsOverlay.classList.toggle('active', showAdsOverlay);
        }

        // 更新玩家
        this.player.update(delta, this.input, this.cameraController);

        // 更新相机
        this.cameraController.update(delta, this.input);

        // 更新视觉特效（两种模式都需要）
        this.visualEffects.update(delta);

        // 更新光照阴影（按帧间隔手动刷新，降低阴影计算开销）
        this.lighting.update(delta);

        // 更新UI路由（罗盘、FPS）
        if (this.uiRouter) {
            this.uiRouter.updateCompass(this.cameraController.yaw);
            this.uiRouter.updateFPS(this.state.fps);
        }

        if (this.state.mode === 'training') {
            this._updateTrainingMode(delta);
        } else if (this.state.mode === 'monster') {
            this._updateMonsterMode(delta);
        } else if (this.state.mode === 'bot') {
            this._updateBotMode(delta);
        }

        // 更新计分板数据（仅在计分板可见时）
        if (this.scoreboard && this.scoreboard.isVisible) {
            this._updateScoreboard();
        }

        // 更新小地图（怪兽模式显示怪兽位置，人机模式显示Bot位置）
        if (this.miniMap && this.miniMap.enabled) {
            let entities = [];
            if (this.state.mode === 'monster' && this.combatSystem) {
                entities = this.combatSystem.monsters;
            } else if (this.state.mode === 'bot' && this.botCombatSystem) {
                entities = this.botCombatSystem.getBots();
            }
            this.miniMap.update(this.player.position, this.cameraController.yaw, entities);
        }

        // 重置瞬时输入
        this.input.resetFrameInput();
    }

    /**
     * 更新计分板数据
     */
    _updateScoreboard() {
        if (this.state.mode === 'training') {
            const stats = this.tutorial ? this.tutorial.getStats() : {};
            this.scoreboard.update({
                hits: stats.shotsHit || 0,
                shotsFired: stats.shotsFired || 0,
                destroyed: stats.targetsDestroyed || 0,
                damageDealt: 0
            }, 'training');
        } else if (this.state.mode === 'monster' && this.combatSystem) {
            const stats = this.combatSystem.stats || {};
            this.scoreboard.update({
                hits: stats.hits || 0,           // 实际命中次数（含非致命）
                shotsFired: stats.shotsFired || 0,
                kills: stats.monstersKilled || 0,
                damageDealt: stats.damageDealt || 0
            }, 'monster');
        } else if (this.state.mode === 'bot' && this.botCombatSystem) {
            const stats = this.botCombatSystem.stats || {};
            this.scoreboard.update({
                hits: stats.hits || 0,
                shotsFired: stats.shotsFired || 0,
                kills: stats.kills || 0,
                damageDealt: stats.damageDealt || 0
            }, 'monster');  // 复用monster样式
        }
    }

    /**
     * 训练模式更新
     */
    _updateTrainingMode(delta) {
        // 射击逻辑：全自动武器按住连发，半自动武器仅按下瞬间射击
        if (this.input.mouse.leftButton && !this.weapon.isReloading) {
            if (this.weapon.automatic) {
                // 全自动：按住持续射击
                this._handleShoot();
            }
            // 半自动：由_onMouseDown(button=0)处理单次射击
        }

        // 更新武器
        this.weapon.update(delta, this.input);

        // 更新靶标
        this.targets.forEach(t => t.update(delta));

        // 更新教程
        this.tutorial.update(delta);

        // 更新HUD
        this.hud.update(this.player, this.weapon, this.tutorial);
    }

    /**
     * 怪兽模式更新
     */
    _updateMonsterMode(delta) {
        // 射击逻辑：全自动武器按住连发，半自动武器仅按下瞬间射击
        if (this.input.mouse.leftButton && !this.weapon.isReloading) {
            if (this.weapon.automatic) {
                // 全自动：按住持续射击
                this._handleMonsterShoot();
            }
            // 半自动：由_onMouseDown(button=0)处理单次射击
        }

        // 更新武器
        this.weapon.update(delta, this.input);

        // 更新战斗系统（包含怪兽AI）
        this.combatSystem.update(delta);

        // 更新怪兽模式HUD（传入武器以显示弹药）
        this.monsterHUD.update(this.player, this.combatSystem, this.weapon);
    }

    /**
     * 人机对决模式更新
     */
    _updateBotMode(delta) {
        // 射击逻辑：全自动武器按住连发，半自动武器仅按下瞬间射击
        if (this.input.mouse.leftButton && !this.weapon.isReloading) {
            if (this.weapon.automatic) {
                this._handleBotShoot();
            }
            // 半自动：由_onMouseDown(button=0)处理单次射击
        }

        // 更新武器
        this.weapon.update(delta, this.input);

        // 更新Bot战斗系统（包含Bot AI和射击判定）
        this.botCombatSystem.update(delta);

        // 更新人机模式HUD
        this.botHUD.update(this.player, this.botCombatSystem, this.weapon);
    }

    /**
     * 鼠标移动事件
     */
    _onMouseMove(x, y) {
        if (this.state.phase !== 'playing') return;
        this.cameraController.handleMouseMove(x, y);
    }

    /**
     * 鼠标按下事件
     */
    _onMouseDown(button) {
        if (this.state.phase !== 'playing') return;
        if (button === 0) {
            // 左键射击
            if (this.state.mode === 'training') {
                this._handleShoot();
            } else if (this.state.mode === 'monster') {
                this._handleMonsterShoot();
            } else if (this.state.mode === 'bot') {
                this._handleBotShoot();
            }
        } else if (button === 2) {
            // 右键开镜
            if (this.weapon) {
                this.weapon.setAiming(true);
            }
        }
    }

    /**
     * 鼠标释放事件
     */
    _onMouseUp(button) {
        if (button === 2) {
            // 右键松开取消开镜
            if (this.weapon) {
                this.weapon.setAiming(false);
            }
        }
    }

    /**
     * 怪兽模式射击
     */
    _handleMonsterShoot() {
        // 游戏结束后锁定输入（避免污染结算统计）
        if (this.combatSystem && this.combatSystem.isGameOver) return;
        // Weapon.shoot处理弹药/弹道/后坐力，传空数组跳过靶标检测
        const result = this.weapon.shoot(this.scene, [], this.raycaster);

        if (result.fired) {
            this.audio.playShoot();
            // 统计射击次数（用于计分板命中率计算）
            if (this.combatSystem) {
                this.combatSystem.stats.shotsFired = (this.combatSystem.stats.shotsFired || 0) + 1;
            }

            // 自定义射线检测命中怪兽
            const camera = this.cameraController.camera;
            const origin = new THREE.Vector3();
            camera.getWorldPosition(origin);
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            this.raycaster.set(origin, direction);
            this.raycaster.far = this.weapon.range;

            let closestMonster = null;
            let closestDist = this.weapon.range;

            for (const monster of this.combatSystem.monsters) {
                if (!monster.isAlive) continue;
                const hit = monster.checkMeleeHit(this.raycaster, this.weapon.range);
                if (hit && hit.distance < closestDist) {
                    closestMonster = hit;
                    closestDist = hit.distance;
                }
            }

            if (closestMonster) {
                const isKill = closestMonster.target.takeDamage(this.weapon.damage);
                this.visualEffects.createBloodSplatter(closestMonster.point, direction);
                this.monsterHUD.showHitMarker(isKill);
                this.monsterHUD.showDamageNumber(this.weapon.damage, isKill);

                // 统计命中次数（用于计分板命中率计算）
                if (this.combatSystem) {
                    this.combatSystem.stats.hits = (this.combatSystem.stats.hits || 0) + 1;
                }

                if (isKill) {
                    this.visualEffects.createDeathExplosion(closestMonster.target.position);
                    this.audio.playHit(true);
                    // 添加击杀提示
                    if (this.uiRouter) {
                        let weaponName = 'PHANTOM';
                        try {
                            const current = this.weaponSelect && this.weaponSelect.getCurrentWeapon();
                            if (current && current.name) weaponName = current.name;
                        } catch (e) { /* 使用默认值 */ }
                        this.uiRouter.addKillFeed('玩家', weaponName, '怪兽');
                    }
                } else {
                    this.audio.playHit(false);
                }
            }
        }

        // 弹药耗尽自动换弹（fired=false, empty=true时触发）
        if (result.empty && !this.weapon.isReloading) {
            this.weapon.startReload();
            this.audio.playReload();
        }
    }

    /**
     * 人机模式射击（射线检测Bot命中，支持爆头）
     */
    _handleBotShoot() {
        // 游戏结束后锁定输入
        if (this.botCombatSystem && this.botCombatSystem.isGameOver) return;
        // Weapon.shoot处理弹药/弹道/后坐力，传空数组跳过靶标检测
        const result = this.weapon.shoot(this.scene, [], this.raycaster);

        if (result.fired) {
            this.audio.playShoot();
            // 统计射击次数
            if (this.botCombatSystem) {
                this.botCombatSystem.stats.shotsFired = (this.botCombatSystem.stats.shotsFired || 0) + 1;
            }

            // 射线检测命中Bot（复用临时向量避免GC）
            const camera = this.cameraController.camera;
            const origin = this._tempVec;
            camera.getWorldPosition(origin);
            const direction = this._botShootDir || (this._botShootDir = new THREE.Vector3());
            camera.getWorldDirection(direction);
            this.raycaster.set(origin, direction);
            this.raycaster.far = this.weapon.range;

            let closestHit = null;
            let closestDist = this.weapon.range;

            for (const bot of this.botCombatSystem.bots) {
                if (!bot.isAlive) continue;
                const hit = bot.checkHit(this.raycaster, this.weapon.range);
                if (hit && hit.distance < closestDist) {
                    closestHit = hit;
                    closestDist = hit.distance;
                }
            }

            if (closestHit) {
                // 爆头伤害加倍
                const isHeadshot = closestHit.isHead;
                const damage = isHeadshot
                    ? Math.round(this.weapon.damage * (this.weapon.headshotMultiplier || 1.8))
                    : this.weapon.damage;
                const isKill = closestHit.target.takeDamage(damage, isHeadshot);
                // 命中视觉反馈
                this.visualEffects.createBloodSplatter(closestHit.point, direction);
                this.botHUD.showHitMarker(isKill);
                this.botHUD.showDamageNumber(damage, isKill, isHeadshot);

                // 统计
                if (this.botCombatSystem) {
                    this.botCombatSystem.stats.hits = (this.botCombatSystem.stats.hits || 0) + 1;
                }

                if (isKill) {
                    // 击杀提示由BotCombatSystem._onBotDeath处理
                    this.audio.playHit(true);
                } else {
                    this.audio.playHit(false);
                }
            }
        } else if (result.empty && !this.weapon.isReloading) {
            // 弹药耗尽自动换弹
            this.weapon.startReload();
            this.audio.playReload();
        }
    }

    /**
     * 键盘按下事件
     */
    _onKeyDown(code) {
        if (code === 'KeyR' && this.state.phase === 'playing') {
            if (this.weapon.startReload()) {
                this.audio.playReload();
                if (this.state.mode === 'training') {
                    this.tutorial.onReload();
                }
            }
        }
        if (code === 'Escape') {
            if (this.state.phase === 'playing') {
                this._pause();
            }
        }
    }

    /**
     * 指针锁定状态变化
     */
    _onPointerLockChange(locked) {
        if (!locked && this.state.phase === 'playing') {
            this._pause();
        } else if (locked && this.state.phase === 'paused') {
            this._resume();
        }
    }

    /**
     * 暂停
     */
    _pause() {
        this.state.phase = 'paused';
        document.getElementById('pause-hint').classList.add('show');
        const monsterPauseHint = document.getElementById('monster-pause-hint');
        if (monsterPauseHint) monsterPauseHint.classList.add('show');
        const botPauseHint = document.getElementById('bot-pause-hint');
        if (botPauseHint) botPauseHint.classList.add('show');
        if (this.uiRouter) this.uiRouter.showPauseMenu();
    }

    /**
     * 恢复
     */
    _resume() {
        this.state.phase = 'playing';
        document.getElementById('pause-hint').classList.remove('show');
        const monsterPauseHint = document.getElementById('monster-pause-hint');
        if (monsterPauseHint) monsterPauseHint.classList.remove('show');
        const botPauseHint = document.getElementById('bot-pause-hint');
        if (botPauseHint) botPauseHint.classList.remove('show');
        if (this.uiRouter) this.uiRouter.hidePauseMenu();
        this.clock.getDelta(); // 清除暂停期间的delta
    }

    /**
     * 应用设置
     */
    _applySettings(settings) {
        // 鼠标灵敏度（settings.sensitivity范围0.5-5，控制器需要0.001-0.01级别）
        if (this.cameraController) {
            const sensValue = settings.sensitivity / 1000;
            this.cameraController.sensitivity = sensValue;
            // 更新灵敏度预设映射
            this.cameraController.sensitivityPresets = {
                low: sensValue * 0.7,
                medium: sensValue,
                high: sensValue * 1.5
            };
            // 反向Y轴
            if (this.cameraController.invertY !== undefined) {
                this.cameraController.invertY = settings.invertY;
            }
            // 同步基础灵敏度到武器（开镜时基于此降低）
            if (this.weapon) {
                this.weapon.setBaseSensitivity(sensValue);
            }
        }

        // 音频音量
        if (this.audio) {
            this.audio.setMasterVolume(settings.masterVolume / 100);
            this.audio.setSfxVolume(settings.sfxVolume / 100);
        }

        // 视野范围
        if (this.cameraController && this.cameraController.camera) {
            this.cameraController.camera.fov = settings.fov;
            this.cameraController.camera.updateProjectionMatrix();
            // 同步基础FOV到武器（开镜时基于此缩放）
            if (this.weapon) {
                this.weapon.setBaseFov(settings.fov);
            }
        }

        // 阴影质量
        if (this.lighting) {
            this.lighting.setQuality(settings.shadowQuality);
        }

        // FPS显示
        const fpsCounter = document.getElementById('fps-counter');
        const monsterFpsCounter = document.getElementById('monster-fps-counter');
        if (fpsCounter) fpsCounter.style.display = settings.showFps ? '' : 'none';
        if (monsterFpsCounter) monsterFpsCounter.style.display = settings.showFps ? '' : 'none';
    }

    /**
     * 应用武器配置
     */
    _applyWeapon(weaponId) {
        const config = WEAPON_DEFINITIONS[weaponId];
        if (!config || !this.weapon) return;

        // 基础弹药参数
        this.weapon.magazineSize = config.magazineSize;
        this.weapon.ammoInMagazine = config.magazineSize;
        this.weapon.reserveAmmo = config.reserveAmmo;
        this.weapon._defaultReserveAmmo = config.reserveAmmo;  // 记录默认备弹供reset使用
        this.weapon.fireRate = config.fireRate;
        this.weapon.damage = config.damage;
        this.weapon.range = config.range;
        this.weapon.reloadTime = config.reloadTime;
        this.weapon.recoilAmount = config.recoil;

        // 武器特性参数
        this.weapon.automatic = config.automatic !== undefined ? config.automatic : true;
        this.weapon.adsZoom = config.adsZoom || 1.0;
        this.weapon.moveSpeedMultiplier = config.moveSpeedMultiplier || 1.0;
        this.weapon.headshotMultiplier = config.headshotMultiplier || 1.0;
        this.weapon.baseSpread = config.baseSpread || 0;
        this.weapon.moveSpreadPenalty = config.moveSpreadPenalty || 0;
        this.weapon.adsSpreadBonus = config.adsSpreadBonus || 0;

        // 重置开镜状态（切换武器时取消开镜）
        this.weapon.setAiming(false);

        // 应用武器移动速度倍率到玩家
        if (this.player) {
            this.player.speedMultiplier = this.weapon.moveSpeedMultiplier;
        }

        // 更新所有HUD中的武器名称（训练模式+怪兽模式）
        document.querySelectorAll('.weapon-name').forEach(el => {
            el.textContent = config.name;
        });

        if (this.toast) {
            const fireMode = this.weapon.automatic ? '全自动' : '半自动';
            this.toast.success('武器已装备', `${config.nameCn} · ${config.tag} · ${fireMode}`);
        }

        // 应用当前装备的皮肤（切换武器时同步应用持久化的皮肤配置）
        if (this.skinSelect) {
            const skin = this.skinSelect.getEquippedSkin(weaponId);
            if (skin) this._applySkin(weaponId, skin.id);
        }
    }

    /**
     * 应用武器皮肤（视角模型+弹道特效）
     * @param {string} weaponId 武器ID
     * @param {string} skinId 皮肤ID
     */
    _applySkin(weaponId, skinId) {
        if (!this.skinSelect) return;
        const skin = this.skinSelect.getEquippedSkin(weaponId);
        // 仅当当前装备的皮肤ID匹配时才应用（避免预览状态干扰）
        if (!skin || skin.id !== skinId) return;
        if (this.cameraController && this.cameraController.applySkin) {
            this.cameraController.applySkin(skin);
        }
        if (this.weapon && this.weapon.applySkin) {
            this.weapon.applySkin(skin);
        }
    }

    /**
     * 处理射击
     */
    _handleShoot() {
        const result = this.weapon.shoot(this.scene, this.targets, this.raycaster);
        if (result.fired) {
            this.hud.showMuzzleFlash();
            this.audio.playShoot();
            this.tutorial.onShoot();
            if (result.hit) {
                // 命中处理已在靶标回调中完成
            }
        } else if (result.empty && !this.weapon.isReloading) {
            // 空仓时自动换弹（避免按住左键空仓音效刷屏）
            this.weapon.startReload();
            this.audio.playReload();
        }
    }

    /**
     * 处理近战攻击
     */
    _handleMeleeAttack() {
        const monsters = this.combatSystem.getAliveMonsters();
        const result = this.meleeWeapon.attack(monsters);
        if (result.attacked) {
            this.audio.playShoot(); // 复用射击音效作为挥砍音效
        }
    }

    /**
     * 近战攻击发起回调
     */
    _onMeleeAttack() {
        // 攻击发起时的处理
    }

    /**
     * 近战命中回调
     */
    _onMeleeHit(monster, damage, isKill, point) {
        // 生成命中特效
        this.visualEffects.createBloodSplatter(point, new THREE.Vector3(0, 1, 0));
        this.visualEffects.createSparkBurst(point);

        if (isKill) {
            // 击杀特效在怪兽死亡回调中处理
        }
    }

    /**
     * 显示怪兽模式结算
     */
    showMonsterModeResult(isVictory, stats) {
        this.state.phase = 'completed';
        this.state.isRunning = false;

        document.getElementById('monster-hud').classList.add('hidden');
        document.getElementById('monster-result-screen').classList.remove('hidden');

        // 填充结算数据
        document.getElementById('monster-result-title').textContent = isVictory ? '战斗胜利' : '战斗失败';
        document.getElementById('monster-result-tag').textContent = isVictory ? 'VICTORY' : 'DEFEATED';
        document.getElementById('monster-result-tag').className = 'result-tag ' + (isVictory ? 'victory' : 'defeat');
        document.getElementById('stat-monsters-killed').textContent = stats.monstersKilled;
        document.getElementById('stat-damage-dealt').textContent = Math.round(stats.damageDealt);
        document.getElementById('stat-damage-taken').textContent = Math.round(stats.damageTaken);
        document.getElementById('stat-waves').textContent = `${stats.waveCompleted} / ${this.combatSystem.maxWaves}`;
        const minutes = Math.floor(stats.timeElapsed / 60);
        const seconds = Math.floor(stats.timeElapsed % 60);
        document.getElementById('stat-monster-time').textContent =
            `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // 评级（适配7波系统，考虑波次完成度和受伤量）
        let rank = 'D';
        if (isVictory) {
            // 胜利评级：根据受伤量
            if (stats.damageTaken < 50) rank = 'S';
            else if (stats.damageTaken < 100) rank = 'A';
            else if (stats.damageTaken < 200) rank = 'B';
            else rank = 'C';
        } else {
            // 失败评级：根据完成的波次
            if (stats.waveCompleted >= 5) rank = 'B';
            else if (stats.waveCompleted >= 3) rank = 'C';
            else rank = 'D';
        }
        document.getElementById('stat-monster-rank').textContent = rank;
    }

    /**
     * 显示人机对决结算
     */
    showBotModeResult(isVictory, stats) {
        this.state.phase = 'completed';
        this.state.isRunning = false;
        // 退出指针锁定以便玩家点击按钮
        this.input.exitPointerLock();

        document.getElementById('bot-hud').classList.add('hidden');
        document.getElementById('bot-result-screen').classList.remove('hidden');

        // 填充结算数据
        document.getElementById('bot-result-title').textContent = isVictory ? '对决胜利' : '对决失败';
        document.getElementById('bot-result-tag').textContent = isVictory ? 'VICTORY' : 'DEFEATED';
        document.getElementById('bot-result-tag').className = 'result-tag ' + (isVictory ? 'victory' : 'defeat');
        document.getElementById('bot-stat-kills').textContent = stats.kills || 0;
        // 命中率
        const accuracy = stats.shotsFired > 0
            ? Math.round((stats.hits / stats.shotsFired) * 100) : 0;
        document.getElementById('bot-stat-accuracy').textContent = accuracy + '%';
        document.getElementById('bot-stat-damage').textContent = Math.round(stats.damageDealt || 0);
        document.getElementById('bot-stat-taken').textContent = Math.round(stats.damageTaken || 0);
        const minutes = Math.floor(stats.timeElapsed / 60);
        const seconds = Math.floor(stats.timeElapsed % 60);
        document.getElementById('bot-stat-time').textContent =
            `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // 评级（1v3模式下根据击杀数和受伤量）
        let rank = 'D';
        if (isVictory) {
            if (stats.damageTaken < 50) rank = 'S';
            else if (stats.damageTaken < 100) rank = 'A';
            else if (stats.damageTaken < 200) rank = 'B';
            else rank = 'C';
        } else {
            if (stats.kills >= 2) rank = 'B';
            else if (stats.kills >= 1) rank = 'C';
            else rank = 'D';
        }
        document.getElementById('bot-stat-rank').textContent = rank;
    }

    /**
     * 窗口缩放处理
     */
    _onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height);
        this.cameraController.onResize(width, height);
    }

    /**
     * 完成教程
     */
    completeTutorial() {
        this.state.phase = 'completed';
        this.state.isRunning = false;
        this.input.exitPointerLock();
        document.getElementById('game-hud').classList.add('hidden');
        document.getElementById('completion-screen').classList.remove('hidden');

        // 填充统计数据
        const stats = this.tutorial.getStats();
        document.getElementById('stat-hits').textContent = stats.shotsHit;
        document.getElementById('stat-accuracy').textContent = stats.accuracy + '%';
        document.getElementById('stat-destroyed').textContent = stats.targetsDestroyed;
        document.getElementById('stat-reloads').textContent = stats.reloadCount;
        const minutes = Math.floor(stats.timeElapsed / 60);
        const seconds = Math.floor(stats.timeElapsed % 60);
        document.getElementById('stat-time').textContent =
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('stat-rank').textContent = this._calculateRank(stats);
    }

    /**
     * 计算评级
     */
    _calculateRank(stats) {
        const accuracy = stats.accuracy;
        if (accuracy >= 80) return 'S';
        if (accuracy >= 60) return 'A';
        if (accuracy >= 40) return 'B';
        if (accuracy >= 20) return 'C';
        return 'D';
    }
}
