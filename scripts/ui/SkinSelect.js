/**
 * SkinSelect.js - 皮肤选择系统
 * 为每把武器提供多款皮肤切换，支持稀有度分级与持久化
 */
import { WEAPON_DEFINITIONS, SKIN_RARITY } from './WeaponSelect.js';

const STORAGE_KEY = 'val_skins';  // 持久化所有武器皮肤选择 { weaponId: skinId }

export class SkinSelect {
    constructor() {
        this.overlay = document.getElementById('skin-select-overlay');
        this.grid = document.getElementById('skin-grid');
        this.preview = document.getElementById('skin-preview');
        this.confirmBtn = document.getElementById('skin-confirm-btn');
        this.closeBtn = document.getElementById('skin-close-btn');
        // 当前选中武器（默认幻影）
        this.currentWeaponId = 'phantom';
        // 已装备的皮肤映射 { weaponId: skinId }
        this.equippedSkins = this._loadEquippedSkins();
        // 当前面板内正在预览的皮肤（未确认前不影响实际装备）
        this.previewSkinId = this.equippedSkins[this.currentWeaponId] || 'default';
        this.onConfirm = null;
        this._buildWeaponTabs();
        this._buildGrid();
        this._bindEvents();
    }

    /**
     * 加载已装备皮肤配置（localStorage 持久化）
     */
    _loadEquippedSkins() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) { /* ignore */ }
        // 默认全部使用原版皮肤
        const defaults = {};
        Object.keys(WEAPON_DEFINITIONS).forEach(id => { defaults[id] = 'default'; });
        return defaults;
    }

    /**
     * 保存已装备皮肤配置
     */
    _saveEquippedSkins() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.equippedSkins));
        } catch (e) { /* ignore */ }
    }

    /**
     * 构建武器切换Tab
     */
    _buildWeaponTabs() {
        const tabsContainer = document.getElementById('skin-weapon-tabs');
        if (!tabsContainer) return;
        tabsContainer.innerHTML = '';
        Object.values(WEAPON_DEFINITIONS).forEach(weapon => {
            const tab = document.createElement('div');
            tab.className = 'skin-weapon-tab';
            tab.dataset.weaponId = weapon.id;
            if (weapon.id === this.currentWeaponId) tab.classList.add('active');
            tab.textContent = weapon.name;
            tabsContainer.appendChild(tab);
        });
    }

    /**
     * 构建皮肤卡片网格
     */
    _buildGrid() {
        if (!this.grid) return;
        this.grid.innerHTML = '';
        const weapon = WEAPON_DEFINITIONS[this.currentWeaponId];
        if (!weapon || !weapon.skins) return;
        weapon.skins.forEach(skin => {
            const rarity = SKIN_RARITY[skin.rarity] || SKIN_RARITY.common;
            const isEquipped = (this.equippedSkins[this.currentWeaponId] || 'default') === skin.id;
            const card = document.createElement('div');
            card.className = `skin-card rarity-${skin.rarity}`;
            card.dataset.skinId = skin.id;
            if (isEquipped) card.classList.add('equipped');
            // 颜色预览块（hex 转 css 颜色）
            const bodyHex = '#' + skin.bodyColor.toString(16).padStart(6, '0');
            const accentHex = '#' + skin.accentColor.toString(16).padStart(6, '0');
            const tracerHex = '#' + skin.tracerColor.toString(16).padStart(6, '0');
            card.innerHTML = `
                <div class="skin-card-preview" style="background: linear-gradient(135deg, ${bodyHex} 0%, ${accentHex} 100%); box-shadow: 0 0 16px ${rarity.glow};">
                    <div class="skin-card-tracer" style="background: ${tracerHex};"></div>
                </div>
                <div class="skin-card-info">
                    <div class="skin-card-name">${skin.nameCn}</div>
                    <div class="skin-card-rarity" style="color: ${rarity.color};">${rarity.nameCn}</div>
                </div>
                ${isEquipped ? '<div class="skin-card-badge">已装备</div>' : ''}
            `;
            this.grid.appendChild(card);
        });
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 武器Tab切换
        const tabsContainer = document.getElementById('skin-weapon-tabs');
        if (tabsContainer) {
            tabsContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.skin-weapon-tab');
                if (!tab) return;
                tabsContainer.querySelectorAll('.skin-weapon-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentWeaponId = tab.dataset.weaponId;
                this.previewSkinId = this.equippedSkins[this.currentWeaponId] || 'default';
                this._buildGrid();
                this._updatePreview();
            });
        }

        // 皮肤卡片选择
        if (this.grid) {
            this.grid.addEventListener('click', (e) => {
                const card = e.target.closest('.skin-card');
                if (!card) return;
                this.grid.querySelectorAll('.skin-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.previewSkinId = card.dataset.skinId;
                if (this.confirmBtn) this.confirmBtn.disabled = false;
                this._updatePreview();
            });
        }

        // 确认按钮
        if (this.confirmBtn) {
            this.confirmBtn.addEventListener('click', () => {
                this.equippedSkins[this.currentWeaponId] = this.previewSkinId;
                this._saveEquippedSkins();
                if (this.onConfirm) this.onConfirm(this.currentWeaponId, this.previewSkinId);
                this._buildGrid();  // 刷新已装备标识
                this.hide();
            });
        }

        // 关闭按钮
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
        }
    }

    /**
     * 更新预览面板（显示当前武器+皮肤名）
     */
    _updatePreview() {
        if (!this.preview) return;
        const weapon = WEAPON_DEFINITIONS[this.currentWeaponId];
        const skin = weapon.skins.find(s => s.id === this.previewSkinId) || weapon.skins[0];
        const rarity = SKIN_RARITY[skin.rarity] || SKIN_RARITY.common;
        const bodyHex = '#' + skin.bodyColor.toString(16).padStart(6, '0');
        const accentHex = '#' + skin.accentColor.toString(16).padStart(6, '0');
        this.preview.innerHTML = `
            <div class="preview-weapon-name">${weapon.nameCn} · ${weapon.name}</div>
            <div class="preview-skin-name" style="color: ${rarity.color};">${skin.nameCn}</div>
            <div class="preview-rarity-tag" style="background: ${rarity.color};">${rarity.nameCn}</div>
            <div class="preview-color-swatch">
                <div style="background: ${bodyHex};"></div>
                <div style="background: ${accentHex};"></div>
            </div>
            <div class="preview-hint">点击"确认装备"应用皮肤</div>
        `;
    }

    show() {
        if (this.overlay) this.overlay.classList.add('show');
        // 重置预览为当前装备
        this.previewSkinId = this.equippedSkins[this.currentWeaponId] || 'default';
        this._buildGrid();
        this._updatePreview();
        if (this.confirmBtn) this.confirmBtn.disabled = true;
    }

    hide() {
        if (this.overlay) this.overlay.classList.remove('show');
    }

    /**
     * 获取指定武器当前装备的皮肤配置对象
     * @param {string} weaponId
     * @returns {object} 皮肤配置 { id, nameCn, rarity, bodyColor, accentColor, tracerColor, muzzleColor }
     */
    getEquippedSkin(weaponId) {
        const weapon = WEAPON_DEFINITIONS[weaponId];
        if (!weapon || !weapon.skins) return null;
        const skinId = this.equippedSkins[weaponId] || 'default';
        return weapon.skins.find(s => s.id === skinId) || weapon.skins[0];
    }

    /**
     * 切换当前武器（外部联动调用，如WeaponSelect切换武器时同步）
     */
    setWeapon(weaponId) {
        if (WEAPON_DEFINITIONS[weaponId]) {
            this.currentWeaponId = weaponId;
            this.previewSkinId = this.equippedSkins[weaponId] || 'default';
        }
    }
}
