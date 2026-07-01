/**
 * AudioManager.js - 音频管理器
 * 使用Web Audio API程序化生成射击、换弹、命中、UI等音效
 */
export class AudioManager {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.initialized = false;
        this.volume = 0.5;
    }

    /**
     * 初始化音频上下文
     */
    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();
            this.masterGain = this.context.createGain();
            // 应用已存储的音量设置（来自设置面板）
            const master = this.masterVolume !== undefined ? this.masterVolume : 1;
            const sfx = this.sfxVolume !== undefined ? this.sfxVolume : 1;
            this.masterGain.gain.value = master * sfx;
            this.volume = master * sfx;
            this.masterGain.connect(this.context.destination);
            // 预创建噪声缓冲区（避免每次射击都创建新缓冲区）
            this._noiseBuffer = this._createNoiseBuffer(0.1);
            this._footstepBuffer = this._createNoiseBuffer(0.05);
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API 不可用:', e);
        }
    }

    /**
     * 恢复音频上下文 (浏览器策略要求用户交互后才能播放)
     */
    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    /**
     * 设置音量
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
    }

    /**
     * 设置主音量
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            // 主音量与音效音量组合
            const sfx = this.sfxVolume !== undefined ? this.sfxVolume : 1;
            this.masterGain.gain.value = this.masterVolume * sfx;
        }
    }

    /**
     * 设置音效音量
     */
    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            const master = this.masterVolume !== undefined ? this.masterVolume : 1;
            this.masterGain.gain.value = master * this.sfxVolume;
        }
    }

    /**
     * 播放射击音效
     */
    playShoot() {
        if (!this.initialized) return;
        this.resume();
        const ctx = this.context;
        const now = ctx.currentTime;

        // 噪声爆裂 (枪声主体) - 使用预创建的缓冲区（性能优化）
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = this._noiseBuffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1500;
        noiseFilter.Q.value = 1;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noiseSource.start(now);
        noiseSource.stop(now + 0.1);

        // 低频冲击
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.05);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.4, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    /**
     * 播放命中音效
     */
    playHit(isKill = false) {
        if (!this.initialized) return;
        this.resume();
        const ctx = this.context;
        const now = ctx.currentTime;

        if (isKill) {
            // 击杀音效 - 双音确认
            this._playTone(880, 0.05, 0.15, 'square', now);
            this._playTone(1320, 0.08, 0.2, 'square', now + 0.05);
        } else {
            // 普通命中 - 短促金属撞击
            this._playTone(2000, 0.03, 0.1, 'square', now);
            this._playTone(1500, 0.04, 0.08, 'sine', now);
        }
    }

    /**
     * 播放换弹音效
     */
    playReload() {
        if (!this.initialized) return;
        this.resume();
        const ctx = this.context;
        const now = ctx.currentTime;

        // 换弹过程: 弹匣退出 → 弹匣装入 → 上膛
        // 1. 弹匣退出声
        this._playClick(now, 800, 0.05);
        // 2. 弹匣装入声
        this._playClick(now + 0.8, 600, 0.05);
        // 3. 上膛声
        this._playClick(now + 1.5, 1000, 0.08);
        // 4. 完成确认
        this._playTone(1200, 0.04, 0.1, 'sine', now + 1.8);
    }

    /**
     * 播放空仓音效
     */
    playEmpty() {
        if (!this.initialized) return;
        this.resume();
        const ctx = this.context;
        const now = ctx.currentTime;
        this._playClick(now, 2500, 0.03);
    }

    /**
     * 播放UI完成音效
     */
    playUiComplete() {
        if (!this.initialized) return;
        this.resume();
        const ctx = this.context;
        const now = ctx.currentTime;

        // 上升音阶
        this._playTone(523, 0.08, 0.15, 'sine', now);        // C
        this._playTone(659, 0.08, 0.15, 'sine', now + 0.08); // E
        this._playTone(784, 0.12, 0.2, 'sine', now + 0.16);  // G
    }

    /**
     * 播放脚步声
     */
    playFootstep() {
        if (!this.initialized) return;
        this.resume();
        const ctx = this.context;
        const now = ctx.currentTime;

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = this._footstepBuffer;  // 使用预创建缓冲区

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noiseSource.start(now);
        noiseSource.stop(now + 0.05);
    }

    /**
     * 播放点击声
     */
    _playClick(time, frequency, duration) {
        this._playTone(frequency, duration, 0.15, 'square', time);
    }

    /**
     * 播放单音
     */
    _playTone(frequency, duration, volume, type = 'sine', startTime = null) {
        const ctx = this.context;
        const now = startTime !== null ? startTime : ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * 创建噪声缓冲区
     */
    _createNoiseBuffer(duration) {
        const ctx = this.context;
        const sampleRate = ctx.sampleRate;
        const length = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        return buffer;
    }
}
