/**
 * HUD.js - HUD界面管理
 * 管理准星、血量、弹药、命中反馈、任务面板等UI更新
 */
export class HUD {
    constructor() {
        // 缓存DOM元素
        this.elements = {
            crosshair: document.getElementById('crosshair'),
            hitMarker: document.getElementById('hit-marker'),
            damageNumbers: document.getElementById('damage-numbers'),
            healthBar: document.getElementById('health-bar'),
            healthText: document.getElementById('health-text'),
            ammoCurrent: document.getElementById('ammo-current'),
            ammoMagazine: document.getElementById('ammo-magazine'),
            ammoContainer: document.querySelector('.ammo-container'),
            reloadIndicator: document.getElementById('reload-indicator'),
            reloadBarFill: document.getElementById('reload-bar-fill'),
            missionCard: document.getElementById('mission-card'),
            missionTag: document.getElementById('mission-tag'),
            missionStatus: document.getElementById('mission-status'),
            missionTitle: document.getElementById('mission-title'),
            missionDesc: document.getElementById('mission-desc'),
            missionProgressBar: document.getElementById('mission-progress-bar'),
            missionProgressText: document.getElementById('mission-progress-text'),
            progressSteps: document.querySelectorAll('.progress-steps .step'),
            keyPrompts: document.getElementById('key-prompts')
        };

        // 准星状态
        this.crosshairFireTime = 0;
    }

    /**
     * 更新HUD
     */
    update(player, weapon, tutorial) {
        this._updateHealth(player);
        this._updateAmmo(weapon);
        this._updateReload(weapon);
        this._updateMission(tutorial);
        this._updateCrosshair();
    }

    /**
     * 更新血量
     */
    _updateHealth(player) {
        const ratio = player.health / player.maxHealth;
        this.elements.healthBar.style.width = (ratio * 100) + '%';
        this.elements.healthText.textContent = Math.ceil(player.health);

        // 低血量变色
        if (ratio < 0.3) {
            this.elements.healthBar.style.background = 'linear-gradient(90deg, #ff0000, #ff4655)';
        } else {
            this.elements.healthBar.style.background = 'linear-gradient(90deg, #BD3944, #FF4655)';
        }
    }

    /**
     * 更新弹药
     */
    _updateAmmo(weapon) {
        this.elements.ammoCurrent.textContent = weapon.ammoInMagazine;
        this.elements.ammoMagazine.textContent = weapon.magazineSize;

        // 低弹药警告
        if (weapon.ammoInMagazine <= 5) {
            this.elements.ammoContainer.classList.add('low');
        } else {
            this.elements.ammoContainer.classList.remove('low');
        }
    }

    /**
     * 更新换弹状态
     */
    _updateReload(weapon) {
        if (weapon.isReloading) {
            this.elements.reloadIndicator.classList.add('show');
            const progress = weapon.getReloadProgress();
            this.elements.reloadBarFill.style.width = (progress * 100) + '%';
        } else {
            this.elements.reloadIndicator.classList.remove('show');
        }
    }

    /**
     * 更新任务面板
     */
    _updateMission(tutorial) {
        const step = tutorial.getCurrentStep();
        if (!step) return;

        this.elements.missionTag.textContent = `TASK ${String(step.index + 1).padStart(2, '0')}`;
        this.elements.missionTitle.textContent = step.title;
        this.elements.missionDesc.textContent = step.description;

        const progress = tutorial.getStepProgress();
        this.elements.missionProgressBar.style.setProperty('--progress', (progress.ratio * 100) + '%');
        this.elements.missionProgressText.textContent = progress.text;

        // 完成状态
        if (step.isComplete) {
            this.elements.missionCard.classList.add('complete');
            this.elements.missionStatus.textContent = '已完成';
        } else {
            this.elements.missionCard.classList.remove('complete');
            this.elements.missionStatus.textContent = '进行中';
        }

        // 更新顶部进度步骤
        this.elements.progressSteps.forEach((el, i) => {
            el.classList.remove('active', 'completed');
            if (i < step.index) {
                el.classList.add('completed');
            } else if (i === step.index) {
                el.classList.add('active');
            }
        });

        // 更新按键提示
        this._updateKeyPrompts(step);
    }

    /**
     * 更新按键提示
     */
    _updateKeyPrompts(step) {
        const prompts = step.keyPrompts || [];
        this.elements.keyPrompts.innerHTML = prompts.map(p =>
            `<div class="key-prompt"><span class="key">${p.key}</span><span>${p.label}</span></div>`
        ).join('');
    }

    /**
     * 更新准星状态
     */
    _updateCrosshair() {
        if (this.crosshairFireTime > 0) {
            this.crosshairFireTime -= 0.016;
            if (this.crosshairFireTime <= 0) {
                this.elements.crosshair.classList.remove('firing');
            }
        }
    }

    /**
     * 显示枪口闪光反馈 (准星扩散)
     */
    showMuzzleFlash() {
        this.elements.crosshair.classList.add('firing');
        this.crosshairFireTime = 0.05;
    }

    /**
     * 显示命中标记
     */
    showHitMarker(isKill = false) {
        this.elements.hitMarker.classList.remove('show');
        // 强制重排以重新触发动画
        void this.elements.hitMarker.offsetWidth;
        this.elements.hitMarker.classList.add('show');

        if (isKill) {
            this.elements.crosshair.classList.add('hit');
            setTimeout(() => {
                this.elements.crosshair.classList.remove('hit');
            }, 200);
        }
    }

    /**
     * 显示伤害数字
     */
    showDamageNumber(damage, isKill = false) {
        const number = document.createElement('div');
        number.className = 'damage-number' + (isKill ? ' kill' : '');
        number.textContent = isKill ? `${damage} KILL` : damage;

        // 随机偏移
        const dx = (Math.random() - 0.5) * 60;
        number.style.setProperty('--dx', dx + 'px');
        number.style.left = '50%';
        number.style.top = '50%';
        number.style.transform = 'translate(-50%, -50%)';

        this.elements.damageNumbers.appendChild(number);

        // 自动移除
        setTimeout(() => {
            number.remove();
        }, 800);
    }
}
