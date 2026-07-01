/**
 * BotHUD.js - 人机对决模式HUD
 * 显示玩家血量、敌人计数、弹药、击杀提示、伤害反馈
 */
export class BotHUD {
    constructor() {
        this.elements = {};
        this.notificationTimer = null;
        this.damageOverlayTimer = null;
        this._directionTimer = null;
        this._createHUD();
        this._cacheElements();
    }

    _createHUD() {
        const hud = document.getElementById('bot-hud');
        if (!hud) return;
        hud.innerHTML = `
            <!-- FPS计数器 -->
            <div class="fps-counter" id="bot-fps-counter">
                FPS <span class="fps-value" id="bot-fps-value">60</span>
            </div>

            <!-- 战术罗盘 -->
            <div class="tactical-compass" id="bot-tactical-compass">
                <div class="compass-strip" id="bot-compass-strip"></div>
                <div class="compass-needle"></div>
            </div>

            <!-- 击杀提示 -->
            <div class="kill-feed" id="bot-kill-feed"></div>

            <!-- 开镜遮罩 -->
            <div class="ads-overlay" id="bot-ads-overlay"></div>

            <!-- 战术小地图容器 -->
            <div class="minimap-container" id="bot-minimap-container"></div>

            <!-- 顶部信息 -->
            <div class="bot-hud-top">
                <div class="bot-info-card">
                    <div class="bot-info-label">敌人剩余</div>
                    <div class="bot-info-value" id="bot-enemy-count">3</div>
                </div>
                <div class="bot-info-card">
                    <div class="bot-info-label">已击杀</div>
                    <div class="bot-info-value" id="bot-kill-count">0</div>
                </div>
                <div class="bot-info-card">
                    <div class="bot-info-label">用时</div>
                    <div class="bot-info-value" id="bot-timer">0:00</div>
                </div>
            </div>

            <!-- 中央准星 -->
            <div class="bot-hud-center">
                <div class="melee-crosshair">
                    <div class="crosshair-dot"></div>
                    <div class="crosshair-ring"></div>
                </div>
                <div class="monster-dynamic-crosshair" id="bot-dynamic-crosshair">
                    <div class="mdc-line mdc-top"></div>
                    <div class="mdc-line mdc-bottom"></div>
                    <div class="mdc-line mdc-left"></div>
                    <div class="mdc-line mdc-right"></div>
                    <div class="mdc-center"></div>
                </div>
                <div class="hit-marker" id="bot-hit-marker"></div>
                <div class="damage-numbers" id="bot-damage-numbers"></div>
            </div>

            <!-- 通知提示 -->
            <div class="monster-notification" id="bot-notification">
                <div class="notification-title" id="bot-notification-title"></div>
                <div class="notification-desc" id="bot-notification-desc"></div>
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
                        <div class="health-bar-fill" id="bot-health-bar"></div>
                        <div class="health-bar-text" id="bot-health-text">100</div>
                    </div>
                </div>
                <div class="attack-info">
                    <div class="weapon-name" id="bot-weapon-name">PHANTOM</div>
                    <div class="ammo-display" id="bot-ammo-display">
                        <span class="ammo-current" id="bot-ammo-current">30</span>
                        <span class="ammo-separator">/</span>
                        <span class="ammo-reserve" id="bot-ammo-reserve">120</span>
                    </div>
                    <div class="reload-hint" id="bot-reload-hint">按 R 换弹</div>
                </div>
            </div>

            <!-- 受伤遮罩 -->
            <div class="damage-overlay" id="bot-damage-overlay"></div>

            <!-- 受击方向指示器 -->
            <div class="damage-direction-indicator" id="bot-damage-direction"></div>

            <!-- 暂停提示 -->
            <div class="pause-hint" id="bot-pause-hint">
                <div class="pause-content">
                    <div class="pause-title">已暂停</div>
                    <div class="pause-text">点击屏幕继续对决</div>
                </div>
            </div>
        `;
    }

    _cacheElements() {
        this.elements = {
            enemyCount: document.getElementById('bot-enemy-count'),
            killCount: document.getElementById('bot-kill-count'),
            timer: document.getElementById('bot-timer'),
            healthBar: document.getElementById('bot-health-bar'),
            healthText: document.getElementById('bot-health-text'),
            ammoCurrent: document.getElementById('bot-ammo-current'),
            ammoReserve: document.getElementById('bot-ammo-reserve'),
            reloadHint: document.getElementById('bot-reload-hint'),
            weaponName: document.getElementById('bot-weapon-name'),
            notification: document.getElementById('bot-notification'),
            notificationTitle: document.getElementById('bot-notification-title'),
            notificationDesc: document.getElementById('bot-notification-desc'),
            hitMarker: document.getElementById('bot-hit-marker'),
            damageNumbers: document.getElementById('bot-damage-numbers'),
            damageOverlay: document.getElementById('bot-damage-overlay'),
            damageDirection: document.getElementById('bot-damage-direction')
        };
    }

    /**
     * 每帧更新HUD
     */
    update(player, combatSystem, weapon) {
        if (!player || !combatSystem) return;
        const el = this.elements;

        // 血量
        const healthRatio = player.health / player.maxHealth;
        if (el.healthBar) {
            el.healthBar.style.width = (healthRatio * 100) + '%';
            // 低血量警告
            if (healthRatio < 0.3) {
                el.healthBar.style.background = 'linear-gradient(90deg, #8B0000, #FF0000)';
            } else {
                el.healthBar.style.background = 'linear-gradient(90deg, #BD3944, #FF4655)';
            }
        }
        if (el.healthText) el.healthText.textContent = Math.ceil(player.health);

        // 敌人计数
        if (el.enemyCount) {
            el.enemyCount.textContent = combatSystem.getAliveBots();
        }
        if (el.killCount) {
            el.killCount.textContent = combatSystem.stats.kills;
        }

        // 计时器
        if (el.timer && combatSystem.stats.startTime > 0) {
            const elapsed = Math.floor(performance.now() / 1000 - combatSystem.stats.startTime);
            const m = Math.floor(elapsed / 60);
            const s = elapsed % 60;
            el.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        }

        // 弹药
        if (el.ammoCurrent) el.ammoCurrent.textContent = weapon.ammoInMagazine;
        if (el.ammoReserve) el.ammoReserve.textContent = weapon.reserveAmmo;

        // 换弹提示
        if (el.reloadHint) {
            if (weapon.isReloading) {
                el.reloadHint.textContent = '换弹中...';
                el.reloadHint.style.color = '#ffaa44';
            } else if (weapon.ammoInMagazine <= 5) {
                el.reloadHint.textContent = '按 R 换弹';
                el.reloadHint.style.color = '#ff4655';
            } else {
                el.reloadHint.textContent = '按 R 换弹';
                el.reloadHint.style.color = 'rgba(236, 232, 225, 0.4)';
            }
        }
    }

    showNotification(title, desc) {
        const el = this.elements;
        if (!el.notification) return;
        el.notificationTitle.textContent = title;
        el.notificationDesc.textContent = desc;
        el.notification.classList.add('show');
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => {
            el.notification.classList.remove('show');
        }, 3000);
    }

    showHitMarker(isKill = false) {
        const marker = this.elements.hitMarker;
        if (!marker) return;
        // 强制reflow触发动画重启
        void marker.offsetWidth;
        marker.classList.add('show');
        if (isKill) marker.classList.add('kill');
        else marker.classList.remove('kill');
        setTimeout(() => {
            marker.classList.remove('show');
        }, 200);
    }

    showDamageNumber(damage, isKill = false, isHeadshot = false) {
        const container = this.elements.damageNumbers;
        if (!container) return;
        const num = document.createElement('div');
        num.className = 'damage-number';
        if (isKill) num.classList.add('kill');
        if (isHeadshot) num.classList.add('headshot');
        let text = isKill ? `${damage} KILL` : `${damage}`;
        if (isHeadshot && !isKill) text = `${damage} HEAD`;
        num.textContent = text;
        // 随机偏移
        const dx = (Math.random() - 0.5) * 60;
        num.style.setProperty('--dx', dx + 'px');
        container.appendChild(num);
        setTimeout(() => {
            if (num.parentNode) num.parentNode.removeChild(num);
        }, 800);
    }

    showDamageScreen(attackerPos, playerPos, playerYaw) {
        const overlay = this.elements.damageOverlay;
        if (overlay) {
            overlay.classList.add('active');
            if (this.damageOverlayTimer) clearTimeout(this.damageOverlayTimer);
            this.damageOverlayTimer = setTimeout(() => {
                overlay.classList.remove('active');
            }, 300);
        }
        // 受击方向指示
        if (attackerPos && playerPos && playerYaw !== undefined) {
            this._showDamageDirection(attackerPos, playerPos, playerYaw);
        }
    }

    _showDamageDirection(attackerPos, playerPos, playerYaw) {
        const indicator = this.elements.damageDirection;
        if (!indicator) return;
        // 计算攻击者相对玩家的角度
        const dx = attackerPos.x - playerPos.x;
        const dz = attackerPos.z - playerPos.z;
        const angle = Math.atan2(dx, -dz);
        // 转换为屏幕角度（相对玩家朝向）
        let relAngle = angle - playerYaw;
        // 标准化到 -PI ~ PI
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;
        const screenRotation = relAngle * (180 / Math.PI);
        indicator.style.transform = `translate(-50%, -50%) rotate(${screenRotation}deg)`;
        indicator.classList.add('active');
        if (this._directionTimer) clearTimeout(this._directionTimer);
        this._directionTimer = setTimeout(() => {
            indicator.classList.remove('active');
        }, 1000);
    }
}
