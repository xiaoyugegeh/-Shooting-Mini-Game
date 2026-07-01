/**
 * WeaponSelect.js - 武器选择系统
 * 提供多种武器配置供玩家选择，不同武器拥有不同属性
 * 含皮肤系统：每把武器拥有多个不同稀有度的皮肤
 */

// 武器配置定义 - 参考无畏契约武器属性
// 每个武器拥有独特特性：开镜、移动速度、爆头倍率、散布、射击模式
export const WEAPON_DEFINITIONS = {
    phantom: {
        id: 'phantom',
        name: 'PHANTOM',
        nameCn: '幻影',
        tag: '突击步枪',
        desc: '全距离均衡武器，稳定后坐力，移动射击精度高',
        magazineSize: 30,
        reserveAmmo: 120,
        fireRate: 0.1,
        damage: 25,
        range: 100,
        reloadTime: 2.0,
        recoil: 0.02,
        // 武器特性
        automatic: true,           // 全自动
        adsZoom: 1.25,             // 开镜倍率（轻微）
        moveSpeedMultiplier: 1.0,  // 标准移动速度
        headshotMultiplier: 1.8,   // 爆头倍率
        baseSpread: 0.005,         // 基础散布（弧度）
        moveSpreadPenalty: 0.02,   // 移动时额外散布
        adsSpreadBonus: 0.004,     // 开镜时散布降低
        stats: { damage: 70, fireRate: 85, stability: 75, mobility: 70 },
        skins: [
            { id: 'default', nameCn: '原版', rarity: 'common', bodyColor: 0x1a1a1a, accentColor: 0xff4655, tracerColor: 0xffee88, muzzleColor: 0xffaa44 },
            { id: 'glitch', nameCn: '故障', rarity: 'rare', bodyColor: 0x0a3d3d, accentColor: 0x00ffaa, tracerColor: 0x00ffaa, muzzleColor: 0x00ffcc },
            { id: 'sakura', nameCn: '樱花', rarity: 'epic', bodyColor: 0x4a1a2a, accentColor: 0xff7eb0, tracerColor: 0xff9ec7, muzzleColor: 0xffc0d4 },
            { id: 'ion', nameCn: '离子', rarity: 'legendary', bodyColor: 0x2a1a4a, accentColor: 0xb14eff, tracerColor: 0xcc66ff, muzzleColor: 0xdd88ff }
        ]
    },
    vandal: {
        id: 'vandal',
        name: 'VANDAL',
        nameCn: '暴徒',
        tag: '突击步枪',
        desc: '高伤害远程武器，后坐力较大，爆头一击致命',
        magazineSize: 25,
        reserveAmmo: 100,
        fireRate: 0.11,
        damage: 35,
        range: 120,
        reloadTime: 2.2,
        recoil: 0.03,
        // 武器特性
        automatic: true,
        adsZoom: 1.3,
        moveSpeedMultiplier: 0.95,
        headshotMultiplier: 2.5,   // 高爆头倍率（远距离爆头致命）
        baseSpread: 0.004,
        moveSpreadPenalty: 0.025,
        adsSpreadBonus: 0.0035,
        stats: { damage: 90, fireRate: 80, stability: 55, mobility: 65 },
        skins: [
            { id: 'default', nameCn: '原版', rarity: 'common', bodyColor: 0x1a1a1a, accentColor: 0xff4655, tracerColor: 0xffee88, muzzleColor: 0xffaa44 },
            { id: 'crimson', nameCn: '猩红', rarity: 'rare', bodyColor: 0x3a0a0a, accentColor: 0xff1133, tracerColor: 0xff3344, muzzleColor: 0xff5566 },
            { id: 'prime', nameCn: '尊享', rarity: 'epic', bodyColor: 0x1a3a5a, accentColor: 0x33ddff, tracerColor: 0x66eeff, muzzleColor: 0x99ffff },
            { id: 'rehno', nameCn: '混沌', rarity: 'legendary', bodyColor: 0x3a2a0a, accentColor: 0xffaa00, tracerColor: 0xffcc33, muzzleColor: 0xffdd66 }
        ]
    },
    spectre: {
        id: 'spectre',
        name: 'SPECTRE',
        nameCn: '幽灵',
        tag: '冲锋枪',
        desc: '高射速近战武器，移动灵活，近距离压制',
        magazineSize: 30,
        reserveAmmo: 120,
        fireRate: 0.07,
        damage: 18,
        range: 60,
        reloadTime: 1.8,
        recoil: 0.015,
        // 武器特性
        automatic: true,
        adsZoom: 1.15,             // 轻微开镜
        moveSpeedMultiplier: 1.15, // 移动速度加成（冲锋枪灵活）
        headshotMultiplier: 1.5,
        baseSpread: 0.008,         // 基础散布较大
        moveSpreadPenalty: 0.01,   // 移动惩罚小（冲锋枪优势）
        adsSpreadBonus: 0.005,
        stats: { damage: 50, fireRate: 95, stability: 80, mobility: 85 },
        skins: [
            { id: 'default', nameCn: '原版', rarity: 'common', bodyColor: 0x1a1a1a, accentColor: 0xff4655, tracerColor: 0xffee88, muzzleColor: 0xffaa44 },
            { id: 'frost', nameCn: '霜冻', rarity: 'rare', bodyColor: 0x0a2a4a, accentColor: 0x66ccff, tracerColor: 0xaaeeff, muzzleColor: 0xddffff },
            { id: 'toxic', nameCn: '剧毒', rarity: 'epic', bodyColor: 0x1a3a0a, accentColor: 0x88ff00, tracerColor: 0xaaff44, muzzleColor: 0xccff88 }
        ]
    },
    operator: {
        id: 'operator',
        name: 'OPERATOR',
        nameCn: '行动者',
        tag: '狙击枪',
        desc: '远程精确打击武器，右键开镜，超高伤害，射速慢',
        magazineSize: 5,
        reserveAmmo: 30,
        fireRate: 0.8,
        damage: 120,
        range: 200,
        reloadTime: 3.0,
        recoil: 0.05,
        // 武器特性
        automatic: false,          // 单发
        adsZoom: 2.5,              // 高倍镜（狙击枪核心特性）
        moveSpeedMultiplier: 0.7,  // 持枪移动慢
        headshotMultiplier: 3.0,   // 爆头必杀
        baseSpread: 0.001,         // 基础散布极小
        moveSpreadPenalty: 0.08,   // 移动时散布剧增（狙击枪惩罚）
        adsSpreadBonus: 0.0009,    // 开镜时几乎零散布
        stats: { damage: 100, fireRate: 25, stability: 40, mobility: 50 },
        skins: [
            { id: 'default', nameCn: '原版', rarity: 'common', bodyColor: 0x1a1a1a, accentColor: 0xff4655, tracerColor: 0xffee88, muzzleColor: 0xffaa44 },
            { id: 'nebula', nameCn: '星云', rarity: 'epic', bodyColor: 0x2a0a3a, accentColor: 0xaa44ff, tracerColor: 0xcc66ff, muzzleColor: 0xdd88ff },
            { id: 'goldvault', nameCn: '黄金', rarity: 'legendary', bodyColor: 0x4a3a0a, accentColor: 0xffd700, tracerColor: 0xffee44, muzzleColor: 0xffff66 }
        ]
    },
    guardian: {
        id: 'guardian',
        name: 'GUARDIAN',
        nameCn: '守卫者',
        tag: '神射手',
        desc: '半自动精确步枪，平衡伤害与射速，爆头致命',
        magazineSize: 12,
        reserveAmmo: 60,
        fireRate: 0.3,
        damage: 55,
        range: 150,
        reloadTime: 2.5,
        recoil: 0.025,
        // 武器特性
        automatic: false,          // 半自动
        adsZoom: 1.6,              // 中倍镜
        moveSpeedMultiplier: 0.9,
        headshotMultiplier: 2.2,   // 爆头致命
        baseSpread: 0.002,
        moveSpreadPenalty: 0.04,
        adsSpreadBonus: 0.0015,
        stats: { damage: 80, fireRate: 50, stability: 65, mobility: 60 },
        skins: [
            { id: 'default', nameCn: '原版', rarity: 'common', bodyColor: 0x1a1a1a, accentColor: 0xff4655, tracerColor: 0xffee88, muzzleColor: 0xffaa44 },
            { id: 'emerald', nameCn: '翡翠', rarity: 'rare', bodyColor: 0x0a3a2a, accentColor: 0x00ff88, tracerColor: 0x44ffaa, muzzleColor: 0x88ffcc },
            { id: 'spectrum', nameCn: '光谱', rarity: 'legendary', bodyColor: 0x2a2a2a, accentColor: 0xffffff, tracerColor: 0xffffff, muzzleColor: 0xffffff }
        ]
    },
    classic: {
        id: 'classic',
        name: 'CLASSIC',
        nameCn: '经典',
        tag: '手枪',
        desc: '标准手枪，备用武器，灵活轻便，半自动射击',
        magazineSize: 12,
        reserveAmmo: 60,
        fireRate: 0.15,
        damage: 22,
        range: 50,
        reloadTime: 1.5,
        recoil: 0.018,
        // 武器特性
        automatic: false,          // 半自动
        adsZoom: 1.1,              // 轻微开镜
        moveSpeedMultiplier: 1.2,  // 移动速度最快（手枪轻便）
        headshotMultiplier: 2.0,
        baseSpread: 0.006,
        moveSpreadPenalty: 0.015,
        adsSpreadBonus: 0.004,
        stats: { damage: 45, fireRate: 70, stability: 70, mobility: 95 },
        skins: [
            { id: 'default', nameCn: '原版', rarity: 'common', bodyColor: 0x1a1a1a, accentColor: 0xff4655, tracerColor: 0xffee88, muzzleColor: 0xffaa44 },
            { id: 'lavender', nameCn: '薰衣草', rarity: 'rare', bodyColor: 0x2a1a3a, accentColor: 0xaa77ff, tracerColor: 0xbb88ff, muzzleColor: 0xcc99ff }
        ]
    }
};

// 皮肤稀有度配置
export const SKIN_RARITY = {
    common:    { nameCn: '普通',    color: '#a0a0a0', glow: 'rgba(160,160,160,0.4)' },
    rare:      { nameCn: '稀有',    color: '#4a9eff', glow: 'rgba(74,158,255,0.5)' },
    epic:      { nameCn: '史诗',    color: '#b14eff', glow: 'rgba(177,78,255,0.6)' },
    legendary: { nameCn: '传奇',    color: '#ffaa00', glow: 'rgba(255,170,0,0.7)' }
};

export class WeaponSelect {
    constructor() {
        this.overlay = document.getElementById('weapon-select-overlay');
        this.grid = document.getElementById('weapon-grid');
        this.confirmBtn = document.getElementById('weapon-confirm-btn');
        this.selectedWeapon = 'phantom';
        this.currentWeaponId = 'phantom';
        this.onConfirm = null;
        this._buildGrid();
        this._bindEvents();
    }

    _buildGrid() {
        if (!this.grid) return;
        this.grid.innerHTML = '';
        Object.values(WEAPON_DEFINITIONS).forEach(weapon => {
            const card = document.createElement('div');
            card.className = 'weapon-card';
            card.dataset.weaponId = weapon.id;
            if (weapon.id === this.currentWeaponId) {
                card.classList.add('selected');
            }
            // 射击模式标签
            const fireMode = weapon.automatic ? '全自动' : '半自动';
            // 开镜倍率显示
            const adsInfo = weapon.adsZoom >= 2.0 ? '高倍镜' : (weapon.adsZoom >= 1.4 ? '中倍镜' : '低倍镜');
            card.innerHTML = `
                <div class="weapon-card-header">
                    <div class="weapon-card-name">${weapon.name}</div>
                    <div class="weapon-card-tag">${weapon.tag}</div>
                </div>
                <div class="weapon-card-desc">${weapon.desc}</div>
                <div class="weapon-features">
                    <span class="weapon-feature">${fireMode}</span>
                    <span class="weapon-feature">${adsInfo}</span>
                    <span class="weapon-feature">爆头×${weapon.headshotMultiplier}</span>
                </div>
                <div class="weapon-stats">
                    ${this._renderStatRow('伤害', weapon.stats.damage)}
                    ${this._renderStatRow('射速', weapon.stats.fireRate)}
                    ${this._renderStatRow('稳定', weapon.stats.stability)}
                    ${this._renderStatRow('机动', weapon.stats.mobility)}
                </div>
            `;
            this.grid.appendChild(card);
        });
    }

    _renderStatRow(label, value) {
        return `
            <div class="weapon-stat-row">
                <span class="weapon-stat-label">${label}</span>
                <div class="weapon-stat-bar">
                    <div class="weapon-stat-bar-fill" style="width: ${value}%"></div>
                </div>
                <span class="weapon-stat-value">${value}</span>
            </div>
        `;
    }

    _bindEvents() {
        if (!this.grid) return;
        this.grid.addEventListener('click', (e) => {
            const card = e.target.closest('.weapon-card');
            if (!card) return;
            this.grid.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            this.selectedWeapon = card.dataset.weaponId;
            if (this.confirmBtn) this.confirmBtn.disabled = false;
        });

        if (this.confirmBtn) {
            this.confirmBtn.addEventListener('click', () => {
                this.currentWeaponId = this.selectedWeapon;
                if (this.onConfirm) this.onConfirm(this.currentWeaponId);
                this.hide();
            });
        }
    }

    show() {
        if (this.overlay) this.overlay.classList.add('show');
        if (this.confirmBtn) this.confirmBtn.disabled = true;
    }

    hide() {
        if (this.overlay) this.overlay.classList.remove('show');
    }

    getCurrentWeapon() {
        return WEAPON_DEFINITIONS[this.currentWeaponId];
    }
}
