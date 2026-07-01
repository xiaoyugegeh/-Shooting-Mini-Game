/**
 * UIRouter.js - UI路由中心
 * 统一管理战术罗盘、FPS计数器、击杀提示、波次过渡、暂停菜单
 */
export class UIRouter {
    constructor(game) {
        this.game = game;

        // 罗盘
        this.compassStrip = document.getElementById('compass-strip');
        this.monsterCompassStrip = document.getElementById('monster-compass-strip');
        this._buildCompass();

        // FPS计数器
        this.fpsCounter = document.getElementById('fps-counter');
        this.fpsValue = document.getElementById('fps-value');
        this.monsterFpsCounter = document.getElementById('monster-fps-counter');
        this.monsterFpsValue = document.getElementById('monster-fps-value');

        // 击杀提示
        this.killFeed = document.getElementById('kill-feed');
        this.monsterKillFeed = document.getElementById('monster-kill-feed');
        // bot-kill-feed 由 BotHUD 动态创建，使用懒加载

        // 波次过渡
        this.waveTransition = document.getElementById('wave-transition');
        this.waveTransitionTitle = document.getElementById('wave-transition-title');
        this.waveTransitionTag = document.getElementById('wave-transition-tag');
        this.waveTransitionSubtitle = document.getElementById('wave-transition-subtitle');

        // 暂停菜单
        this.pauseMenu = document.getElementById('pause-menu');
        this._bindPauseMenu();

        // 罗盘刻度缓存
        this._compassWidth = 320;
    }

    /**
     * 构建罗盘刻度（N E S W + 度数）
     */
    _buildCompass() {
        const directions = [
            { label: 'N', deg: 0, cardinal: true },
            { label: '15', deg: 15 },
            { label: '30', deg: 30 },
            { label: '45', deg: 45 },
            { label: '60', deg: 60 },
            { label: '75', deg: 75 },
            { label: 'E', deg: 90, cardinal: true },
            { label: '105', deg: 105 },
            { label: '120', deg: 120 },
            { label: '135', deg: 135 },
            { label: '150', deg: 150 },
            { label: '165', deg: 165 },
            { label: 'S', deg: 180, cardinal: true },
            { label: '195', deg: 195 },
            { label: '210', deg: 210 },
            { label: '225', deg: 225 },
            { label: '240', deg: 240 },
            { label: '255', deg: 255 },
            { label: 'W', deg: 270, cardinal: true },
            { label: '285', deg: 285 },
            { label: '300', deg: 300 },
            { label: '315', deg: 315 },
            { label: '330', deg: 330 },
            { label: '345', deg: 345 }
        ];

        const buildStrip = (stripEl) => {
            if (!stripEl) return;
            stripEl.innerHTML = '';
            // 重复3次以实现循环滚动
            for (let rep = 0; rep < 3; rep++) {
                directions.forEach(d => {
                    const tick = document.createElement('span');
                    tick.className = 'compass-tick' + (d.cardinal ? ' cardinal' : '');
                    tick.textContent = d.label;
                    stripEl.appendChild(tick);
                });
            }
        };
        buildStrip(this.compassStrip);
        buildStrip(this.monsterCompassStrip);
    }

    /**
     * 更新罗盘（根据玩家朝向）
     * @param {number} yaw - 玩家偏航角（弧度）
     */
    updateCompass(yaw) {
        // 将弧度转为度数（0-360），N=0
        let deg = (yaw * 180 / Math.PI) % 360;
        if (deg < 0) deg += 360;

        // 每个刻度40px宽，共24个刻度=960px一组
        const tickWidth = 40;
        const groupWidth = 24 * tickWidth;
        // 中心偏移：让当前角度的刻度位于罗盘中央
        const offset = -(deg / 15) * tickWidth + this._compassWidth / 2 - tickWidth / 2;
        // 加上一组偏移以避免负值显示问题
        const finalOffset = offset + groupWidth;

        if (this.compassStrip) {
            this.compassStrip.style.transform = `translateX(${finalOffset}px)`;
        }
        if (this.monsterCompassStrip) {
            this.monsterCompassStrip.style.transform = `translateX(${finalOffset}px)`;
        }
        // 人机模式罗盘（懒加载）
        if (!this._botCompassStrip) {
            this._botCompassStrip = document.getElementById('bot-compass-strip');
            if (this._botCompassStrip) this._buildCompassInto(this._botCompassStrip);
        }
        if (this._botCompassStrip) {
            this._botCompassStrip.style.transform = `translateX(${finalOffset}px)`;
        }
    }

    /**
     * 将罗盘刻度构建到指定元素（供懒加载的bot罗盘使用）
     */
    _buildCompassInto(stripEl) {
        if (!stripEl) return;
        stripEl.innerHTML = '';
        const directions = [
            { label: 'N', deg: 0, cardinal: true },
            { label: '15', deg: 15 },
            { label: '30', deg: 30 },
            { label: '45', deg: 45 },
            { label: '60', deg: 60 },
            { label: '75', deg: 75 },
            { label: 'E', deg: 90, cardinal: true },
            { label: '105', deg: 105 },
            { label: '120', deg: 120 },
            { label: '135', deg: 135 },
            { label: '150', deg: 150 },
            { label: '165', deg: 165 },
            { label: 'S', deg: 180, cardinal: true },
            { label: '195', deg: 195 },
            { label: '210', deg: 210 },
            { label: '225', deg: 225 },
            { label: '240', deg: 240 },
            { label: '255', deg: 255 },
            { label: 'W', deg: 270, cardinal: true },
            { label: '285', deg: 285 },
            { label: '300', deg: 300 },
            { label: '315', deg: 315 },
            { label: '330', deg: 330 },
            { label: '345', deg: 345 }
        ];
        // 重复3次以实现循环滚动
        for (let rep = 0; rep < 3; rep++) {
            directions.forEach(d => {
                const tick = document.createElement('span');
                tick.className = 'compass-tick' + (d.cardinal ? ' cardinal' : '');
                tick.textContent = d.label;
                stripEl.appendChild(tick);
            });
        }
    }

    /**
     * 更新FPS显示
     */
    updateFPS(fps) {
        const updateOne = (counter, valueEl) => {
            if (!counter || !valueEl) return;
            valueEl.textContent = fps;
            counter.classList.remove('low', 'critical');
            if (fps < 30) counter.classList.add('critical');
            else if (fps < 50) counter.classList.add('low');
        };
        updateOne(this.fpsCounter, this.fpsValue);
        updateOne(this.monsterFpsCounter, this.monsterFpsValue);
        // 人机模式FPS（懒加载）
        if (!this._botFpsCounter) {
            this._botFpsCounter = document.getElementById('bot-fps-counter');
            this._botFpsValue = document.getElementById('bot-fps-value');
        }
        updateOne(this._botFpsCounter, this._botFpsValue);
    }

    /**
     * 添加击杀提示
     */
    addKillFeed(killer, weapon, victim) {
        const addOne = (feedEl) => {
            if (!feedEl) return;
            const item = document.createElement('div');
            item.className = 'kill-feed-item';
            item.innerHTML = `
                <span class="kill-feed-killer">${killer}</span>
                <span class="kill-feed-weapon">[${weapon}]</span>
                <span class="kill-feed-victim">${victim}</span>
            `;
            feedEl.appendChild(item);
            // 最多保留4条
            while (feedEl.children.length > 4) {
                feedEl.removeChild(feedEl.firstChild);
            }
            // 4秒后淡出移除
            setTimeout(() => {
                item.classList.add('fade');
                setTimeout(() => {
                    if (item.parentNode) item.parentNode.removeChild(item);
                }, 400);
            }, 4000);
        };
        addOne(this.killFeed);
        addOne(this.monsterKillFeed);
        // 人机模式击杀提示（懒加载，因为BotHUD在UIRouter之后初始化）
        if (!this._botKillFeed) {
            this._botKillFeed = document.getElementById('bot-kill-feed');
        }
        addOne(this._botKillFeed);
    }

    /**
     * 显示波次过渡动画
     */
    showWaveTransition(waveNumber, totalWaves) {
        if (!this.waveTransition) return;
        if (this.waveTransitionTitle) {
            this.waveTransitionTitle.textContent = `第 ${waveNumber} 波`;
        }
        if (this.waveTransitionTag) {
            this.waveTransitionTag.textContent = waveNumber === totalWaves ? 'FINAL WAVE' : 'WAVE INCOMING';
        }
        if (this.waveTransitionSubtitle) {
            this.waveTransitionSubtitle.textContent = waveNumber === totalWaves ? 'FINAL COMBAT' : 'PREPARE FOR COMBAT';
        }
        this.waveTransition.classList.add('show');
        setTimeout(() => {
            this.waveTransition.classList.remove('show');
        }, 2500);
    }

    /**
     * 显示暂停菜单
     */
    showPauseMenu() {
        if (this.pauseMenu) this.pauseMenu.classList.add('show');
    }

    /**
     * 隐藏暂停菜单
     */
    hidePauseMenu() {
        if (this.pauseMenu) this.pauseMenu.classList.remove('show');
    }

    _bindPauseMenu() {
        const resumeBtn = document.getElementById('pause-resume-btn');
        const settingsBtn = document.getElementById('pause-settings-btn');
        const restartBtn = document.getElementById('pause-restart-btn');
        const backBtn = document.getElementById('pause-menu-back-btn');

        if (resumeBtn) resumeBtn.addEventListener('click', () => {
            this.hidePauseMenu();
            if (this.game) this.game.input.requestPointerLock();
        });

        if (settingsBtn) settingsBtn.addEventListener('click', () => {
            if (this.game && this.game.settingsPanel) this.game.settingsPanel.show();
        });

        if (restartBtn) restartBtn.addEventListener('click', () => {
            this.hidePauseMenu();
            if (this.game) this.game.restart();
        });

        if (backBtn) backBtn.addEventListener('click', () => {
            // 返回主菜单前确认（避免误点击丢失进度）
            if (this.game && this.game.toast) {
                if (this._backConfirmTimer) {
                    // 第二次点击：确认返回
                    clearTimeout(this._backConfirmTimer);
                    this._backConfirmTimer = null;
                    this.hidePauseMenu();
                    this.game.returnToMenu();
                } else {
                    // 第一次点击：提示确认
                    this.game.toast.warning('确认返回主菜单？', '再次点击以确认', 3000);
                    this._backConfirmTimer = setTimeout(() => {
                        this._backConfirmTimer = null;
                    }, 3000);
                }
            } else {
                this.hidePauseMenu();
                if (this.game) this.game.returnToMenu();
            }
        });
    }
}
