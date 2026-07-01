/**
 * Scoreboard.js - 计分板系统
 * 按住TAB键显示，展示玩家统计数据
 */
export class Scoreboard {
    constructor() {
        this.overlay = document.getElementById('scoreboard-overlay');
        this.titleEl = document.getElementById('scoreboard-title');
        this.modeEl = document.getElementById('scoreboard-mode');
        this.bodyEl = document.getElementById('scoreboard-body');
        this.isVisible = false;
        this._bindEvents();
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Tab') {
                // 仅在游戏进行中显示计分板（避免菜单/结算界面冲突）
                if (this.game && this.game.state && this.game.state.phase === 'playing') {
                    e.preventDefault();
                    this.show();
                }
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Tab') {
                if (this.isVisible) {
                    e.preventDefault();
                    this.hide();
                }
            }
        });
    }

    /**
     * 更新计分板数据
     * @param {Object} stats - 统计数据
     * @param {string} mode - 模式：training|monster
     */
    update(stats, mode = 'training') {
        if (this.titleEl) {
            this.titleEl.textContent = mode === 'monster' ? '怪兽讨伐' : '战术训练';
        }
        if (this.modeEl) {
            this.modeEl.textContent = mode === 'monster' ? 'MONSTER HUNT' : 'TRAINING GROUND';
        }
        if (!this.bodyEl) return;

        const accuracy = stats.shotsFired > 0
            ? Math.round((stats.hits / stats.shotsFired) * 100)
            : 0;
        const score = (stats.hits || 0) * 10 + (stats.kills || 0) * 100 + (stats.destroyed || 0) * 50;

        const rows = [
            {
                name: '玩家',
                isYou: true,
                hits: stats.hits || 0,
                destroyed: stats.kills || stats.destroyed || 0,
                accuracy: accuracy + '%',
                damage: stats.damageDealt || 0,
                score: score
            }
        ];

        this.bodyEl.innerHTML = rows.map(row => `
            <tr class="player-row">
                <td><span class="scoreboard-name ${row.isYou ? 'you' : ''}">${row.name}</span></td>
                <td class="num">${row.hits}</td>
                <td class="num">${row.destroyed}</td>
                <td class="num scoreboard-kda">${row.accuracy}</td>
                <td class="num">${row.damage}</td>
                <td class="num">${row.score}</td>
            </tr>
        `).join('');
    }

    show() {
        if (this.overlay) {
            this.overlay.classList.add('show');
            this.isVisible = true;
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('show');
            this.isVisible = false;
        }
    }
}
