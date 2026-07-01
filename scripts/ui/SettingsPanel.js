/**
 * SettingsPanel.js - 设置面板
 * 提供控制、音频、画面设置，持久化到localStorage
 */
export class SettingsPanel {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('settings-overlay');
        this.settings = this._loadSettings();
        this.onApply = null;
        this._bindEvents();
        this._initValues();
    }

    /**
     * 默认设置
     */
    _defaults() {
        return {
            sensitivity: 1.5,      // 降低默认灵敏度（原2.2）
            invertY: false,
            masterVolume: 80,
            sfxVolume: 90,
            shadowQuality: 'low',
            showFps: true,
            fov: 90
        };
    }

    _loadSettings() {
        try {
            const saved = localStorage.getItem('val_settings');
            if (saved) {
                return { ...this._defaults(), ...JSON.parse(saved) };
            }
        } catch (e) { /* ignore */ }
        return this._defaults();
    }

    _saveSettings() {
        try {
            localStorage.setItem('val_settings', JSON.stringify(this.settings));
        } catch (e) { /* ignore */ }
    }

    _initValues() {
        this._setSliderValue('sens-slider', 'sens-value', this.settings.sensitivity);
        this._setSliderValue('master-volume-slider', 'master-volume-value', this.settings.masterVolume);
        this._setSliderValue('sfx-volume-slider', 'sfx-volume-value', this.settings.sfxVolume);
        this._setSliderValue('fov-slider', 'fov-value', this.settings.fov);

        this._setToggle('invert-y-toggle', this.settings.invertY);
        this._setToggle('show-fps-toggle', this.settings.showFps);

        document.querySelectorAll('#shadow-quality .val-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === this.settings.shadowQuality);
        });
    }

    _setSliderValue(sliderId, valueId, value) {
        const slider = document.getElementById(sliderId);
        const valueEl = document.getElementById(valueId);
        if (!slider) return;
        const min = parseFloat(slider.dataset.min);
        const max = parseFloat(slider.dataset.max);
        const percent = ((value - min) / (max - min)) * 100;
        const fill = slider.querySelector('.val-slider-fill');
        const thumb = slider.querySelector('.val-slider-thumb');
        if (fill) fill.style.width = percent + '%';
        if (thumb) thumb.style.left = percent + '%';
        if (valueEl) valueEl.textContent = value;
    }

    _setToggle(id, on) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('on', on);
    }

    _bindEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('settings-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());

        // 点击遮罩关闭
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.hide();
            });
        }

        // 滑块拖拽
        this._bindSlider('sens-slider', 'sens-value', (v) => { this.settings.sensitivity = v; });
        this._bindSlider('master-volume-slider', 'master-volume-value', (v) => { this.settings.masterVolume = v; });
        this._bindSlider('sfx-volume-slider', 'sfx-volume-value', (v) => { this.settings.sfxVolume = v; });
        this._bindSlider('fov-slider', 'fov-value', (v) => { this.settings.fov = v; });

        // 切换开关
        this._bindToggle('invert-y-toggle', (on) => { this.settings.invertY = on; });
        this._bindToggle('show-fps-toggle', (on) => { this.settings.showFps = on; });

        // 阴影质量选项
        document.querySelectorAll('#shadow-quality .val-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#shadow-quality .val-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.settings.shadowQuality = btn.dataset.value;
            });
        });

        // 应用按钮
        const applyBtn = document.getElementById('settings-apply-btn');
        if (applyBtn) applyBtn.addEventListener('click', () => {
            this._saveSettings();
            if (this.onApply) this.onApply(this.settings);
            this.hide();
        });

        // 恢复默认
        const resetBtn = document.getElementById('settings-reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', () => {
            this.settings = this._defaults();
            this._initValues();
        });
    }

    _bindSlider(sliderId, valueId, callback) {
        const slider = document.getElementById(sliderId);
        const valueEl = document.getElementById(valueId);
        if (!slider) return;
        const min = parseFloat(slider.dataset.min);
        const max = parseFloat(slider.dataset.max);
        const step = parseFloat(slider.dataset.step);

        const updateFromX = (clientX) => {
            const rect = slider.getBoundingClientRect();
            let percent = (clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            let value = min + percent * (max - min);
            value = Math.round(value / step) * step;
            if (step >= 1) value = Math.round(value);
            else value = parseFloat(value.toFixed(1));
            percent = ((value - min) / (max - min)) * 100;
            const fill = slider.querySelector('.val-slider-fill');
            const thumb = slider.querySelector('.val-slider-thumb');
            if (fill) fill.style.width = percent + '%';
            if (thumb) thumb.style.left = percent + '%';
            if (valueEl) valueEl.textContent = value;
            callback(value);
        };

        let dragging = false;
        slider.addEventListener('mousedown', (e) => {
            dragging = true;
            updateFromX(e.clientX);
        });
        document.addEventListener('mousemove', (e) => {
            if (dragging) updateFromX(e.clientX);
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    _bindToggle(id, callback) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', () => {
            const on = !el.classList.contains('on');
            el.classList.toggle('on', on);
            callback(on);
        });
    }

    show() {
        if (this.overlay) this.overlay.classList.add('show');
    }

    hide() {
        if (this.overlay) this.overlay.classList.remove('show');
    }

    getSettings() {
        return this.settings;
    }
}
