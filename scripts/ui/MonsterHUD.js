/**
 * MonsterHUD.js - 怪兽模式专用HUD
 * 显示波次进度、怪兽计数、近战冷却、玩家血量
 */
export class MonsterHUD {
    constructor() {
        this.elements = {
            crosshair: null,
            healthBar: null,
            healthText: null,
            waveInfo: null,
            monsterCount: null,
            attackCooldown: null,
            notification: null,
            damageOverlay: null
        };

        this._createHUD();
        this._cacheElements();

        // 通知定时器
        this.notificationTimer = null;
        // 受伤遮罩定时器
        this.damageOverlayTimer = null;
    }

    /**
     * 动态创建HUD元素
     * 注意：直接在innerHTML中包含FPS/罗盘/击杀提示/动态准星等战术元素，
     * 避免依赖index.html预置元素（会被innerHTML覆盖销毁）
     */
    _createHUD() {
        const hud = document.getElementById('monster-hud');
        if (!hud) return;

        hud.innerHTML = `
            <!-- FPS计数器 -->
            <div class="fps-counter" id="monster-fps-counter">
                FPS <span class="fps-value" id="monster-fps-value">60</span>
            </div>

            <!-- 战术罗盘 -->
            <div class="tactical-compass" id="monster-tactical-compass">
                <div class="compass-strip" id="monster-compass-strip"></div>
                <div class="compass-needle"></div>
            </div>

            <!-- 击杀提示 -->
            <div class="kill-feed" id="monster-kill-feed"></div>

            <!-- 开镜遮罩（ADS时显示，屏幕边缘变暗） -->
            <div class="ads-overlay" id="monster-ads-overlay"></div>

            <!-- 战术小地图 -->
            <div class="minimap-container" id="monster-minimap-container"></div>

            <!-- 顶部波次信息 -->
            <div class="monster-hud-top">
                <div class="wave-info-card">
                    <div class="wave-label">WAVE</div>
                    <div class="wave-number" id="wave-number">1 / 3</div>
                </div>
                <div class="monster-counter">
                    <div class="counter-label">剩余怪兽</div>
                    <div class="counter-value" id="monster-count">0</div>
                </div>
            </div>

            <!-- 中央准星 -->
            <div class="monster-hud-center">
                <div class="melee-crosshair">
                    <div class="crosshair-dot"></div>
                    <div class="crosshair-ring"></div>
                </div>
                <!-- 动态准星（响应移动/射击扩散） -->
                <div class="monster-dynamic-crosshair" id="monster-dynamic-crosshair">
                    <div class="mdc-line mdc-top"></div>
                    <div class="mdc-line mdc-bottom"></div>
                    <div class="mdc-line mdc-left"></div>
                    <div class="mdc-line mdc-right"></div>
                    <div class="mdc-center"></div>
                </div>
                <div class="hit-marker" id="monster-hit-marker"></div>
                <div class="damage-numbers" id="monster-damage-numbers"></div>
            </div>

            <!-- 通知提示 -->
            <div class="monster-notification" id="monster-notification">
                <div class="notification-title" id="notification-title"></div>
                <div class="notification-desc" id="notification-desc"></div>
            </div>

            <!-- 底部状态栏 -->
            <div class="monster-hud-bottom">
                <div class="health-container">
                    <div class="health-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </div>
                    <div class="health-bar-container">
                        <div class="health-bar-fill" id="monster-health-bar"></div>
                        <div class="health-bar-text" id="monster-health-text">100</div>
                    </div>
                </div>
                <div class="attack-info">
                <div class="weapon-name" id="monster-weapon-name">PHANTOM</div>
                    <div class="ammo-display" id="monster-ammo-display">
                        <span class="ammo-current" id="monster-ammo-current">30</span>
                        <span class="ammo-separator">/</span>
                        <span class="ammo-reserve" id="monster-ammo-reserve">999</span>
                    </div>
                    <div class="reload-hint" id="monster-reload-hint">按 R 换弹</div>
                </div>
            </div>

            <!-- 受伤遮罩 -->
            <div class="damage-overlay" id="damage-overlay"></div>

            <!-- 受击方向指示器（显示伤害来源方向） -->
            <div class="damage-direction-indicator" id="damage-direction"></div>

            <!-- 暂停提示 -->
            <div class="pause-hint" id="monster-pause-hint">
                <div class="pause-content">
                    <div class="pause-title">已暂停</div>
                    <div class="pause-text">点击屏幕继续战斗</div>
                </div>
            </div>
        `;
    }

    /**
     * 缓存DOM元素
     */
    _cacheElements() {
        this.elements.waveNumber = document.getElementById('wave-number');
        this.elements.monsterCount = document.getElementById('monster-count');
        this.elements.healthBar = document.getElementById('monster-health-bar');
        this.elements.healthText = document.getElementById('monster-health-text');
        this.elements.ammoCurrent = document.getElementById('monster-ammo-current');
        this.elements.ammoReserve = document.getElementById('monster-ammo-reserve');
        this.elements.reloadHint = document.getElementById('monster-reload-hint');
        this.elements.notification = document.getElementById('monster-notification');
        this.elements.notificationTitle = document.getElementById('notification-title');
        this.elements.notificationDesc = document.getElementById('notification-desc');
        this.elements.hitMarker = document.getElementById('monster-hit-marker');
        this.elements.damageNumbers = document.getElementById('monster-damage-numbers');
        this.elements.damageOverlay = document.getElementById('damage-overlay');
    }

    /**
     * 更新HUD
     */
    update(player, combatSystem, weapon) {
        // 更新血量
        const healthRatio = player.health / player.maxHealth;
        this.elements.healthBar.style.width = (healthRatio * 100) + '%';
        this.elements.healthText.textContent = Math.max(0, Math.ceil(player.health));

        if (healthRatio < 0.3) {
            this.elements.healthBar.style.background = 'linear-gradient(90deg, #ff0000, #ff4655)';
        } else {
            this.elements.healthBar.style.background = 'linear-gradient(90deg, #BD3944, #FF4655)';
        }

        // 更新波次信息（显示波次进度和难度名称）
        const waveInfo = combatSystem.getWaveInfo();
        const waveNames = ['', '入门', '简单', '普通', '困难', '专家', '噩梦', '地狱'];
        const waveName = waveNames[waveInfo.current] || '挑战';
        this.elements.waveNumber.textContent = `${waveInfo.current}/${waveInfo.max} ${waveName}`;
        this.elements.monsterCount.textContent = waveInfo.aliveCount;

        // 更新弹药
        this.elements.ammoCurrent.textContent = weapon.ammoInMagazine;
        this.elements.ammoReserve.textContent = weapon.reserveAmmo;

        // 换弹提示
        if (weapon.isReloading) {
            this.elements.reloadHint.textContent = '换弹中...';
            this.elements.reloadHint.style.color = '#ffaa00';
        } else if (weapon.ammoInMagazine <= 5) {
            this.elements.reloadHint.textContent = '按 R 换弹';
            this.elements.reloadHint.style.color = '#ff4655';
        } else {
            this.elements.reloadHint.textContent = '按 R 换弹';
            this.elements.reloadHint.style.color = '#7a7a7a';
        }
    }

    /**
     * 显示通知
     */
    showNotification(title, desc) {
        this.elements.notificationTitle.textContent = title;
        this.elements.notificationDesc.textContent = desc;
        this.elements.notification.classList.add('show');

        if (this.notificationTimer) {
            clearTimeout(this.notificationTimer);
        }
        this.notificationTimer = setTimeout(() => {
            this.elements.notification.classList.remove('show');
        }, 3000);
    }

    /**
     * 显示命中标记
     */
    showHitMarker(isKill = false) {
        this.elements.hitMarker.classList.remove('show');
        void this.elements.hitMarker.offsetWidth;
        this.elements.hitMarker.classList.add('show');
    }

    /**
     * 显示伤害数字
     */
    showDamageNumber(damage, isKill = false) {
        const number = document.createElement('div');
        number.className = 'damage-number' + (isKill ? ' kill' : '');
        number.textContent = isKill ? `${damage} KILL` : damage;

        const dx = (Math.random() - 0.5) * 60;
        number.style.setProperty('--dx', dx + 'px');
        number.style.left = '50%';
        number.style.top = '50%';
        number.style.transform = 'translate(-50%, -50%)';

        this.elements.damageNumbers.appendChild(number);
        setTimeout(() => number.remove(), 800);
    }

    /**
     * 显示受伤屏幕特效
     * @param {THREE.Vector3} [attackerPos] - 攻击者位置（用于显示受击方向）
     * @param {THREE.Vector3} [playerPos] - 玩家位置
     * @param {number} [playerYaw] - 玩家朝向
     */
    showDamageScreen(attackerPos, playerPos, playerYaw) {
        this.elements.damageOverlay.classList.add('active');
        if (this.damageOverlayTimer) {
            clearTimeout(this.damageOverlayTimer);
        }
        this.damageOverlayTimer = setTimeout(() => {
            this.elements.damageOverlay.classList.remove('active');
        }, 300);

        // 显示受击方向指示器
        if (attackerPos && playerPos && playerYaw !== undefined) {
            this._showDamageDirection(attackerPos, playerPos, playerYaw);
        }
    }

    /**
     * 显示受击方向指示器
     * @param {THREE.Vector3} attackerPos - 攻击者位置
     * @param {THREE.Vector3} playerPos - 玩家位置
     * @param {number} playerYaw - 玩家偏航角
     */
    _showDamageDirection(attackerPos, playerPos, playerYaw) {
        const indicator = document.getElementById('damage-direction');
        if (!indicator) return;

        // 计算攻击者相对玩家的角度
        const dx = attackerPos.x - playerPos.x;
        const dz = attackerPos.z - playerPos.z;
        const angleToAttacker = Math.atan2(dx, -dz);  // 世界角度

        // 转换为相对玩家朝向的角度
        let relativeAngle = angleToAttacker - playerYaw;
        // 标准化到 -PI ~ PI
        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

        // 转换为屏幕上的旋转角度（度）
        const screenRotation = relativeAngle * (180 / Math.PI);

        indicator.style.transform = `translate(-50%, -50%) rotate(${screenRotation}deg)`;
        indicator.classList.add('active');

        // 1秒后淡出
        clearTimeout(this._directionTimer);
        this._directionTimer = setTimeout(() => {
            indicator.classList.remove('active');
        }, 1000);
    }
}
