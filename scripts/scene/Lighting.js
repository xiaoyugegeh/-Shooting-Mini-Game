/**
 * Lighting.js - 沙漠迷城(Dust II)风格光照
 * 暖色沙漠阳光 + 沙色环境光
 */
import * as THREE from 'three';

export class Lighting {
    constructor(scene) {
        this.scene = scene;
        this.lights = [];
        // 阴影手动更新帧计数（降低更新频率）
        this._shadowFrameCount = 0;
        this._shadowUpdateInterval = 3;  // 每3帧更新一次阴影
    }

    setup() {
        this._setupAmbientLight();
        this._setupHemisphereLight();
        this._setupDirectionalLight();
        this._setupFillLight();
    }

    /**
     * 环境光 - 沙漠暖色基底
     */
    _setupAmbientLight() {
        const ambient = new THREE.AmbientLight(0xd4a878, 0.5);
        this.scene.add(ambient);
        this.lights.push(ambient);
    }

    /**
     * 半球光 - 沙漠天空与地面
     */
    _setupHemisphereLight() {
        const hemi = new THREE.HemisphereLight(0xffcc88, 0xc4a878, 0.6);
        hemi.position.set(0, 50, 0);
        this.scene.add(hemi);
        this.lights.push(hemi);
    }

    /**
     * 主方向光 - 沙漠正午阳光
     */
    _setupDirectionalLight() {
        const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.5);
        dirLight.position.set(40, 50, 10);
        dirLight.target.position.set(0, 0, 0);

        dirLight.castShadow = true;
        // 阴影贴图从2048降到1024（性能提升明显，视觉差异小）
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 200;
        dirLight.shadow.camera.left = -60;
        dirLight.shadow.camera.right = 60;
        dirLight.shadow.camera.top = 60;
        dirLight.shadow.camera.bottom = -60;
        dirLight.shadow.bias = -0.0005;
        dirLight.shadow.normalBias = 0.02;
        // 关闭自动更新，改为手动按帧间隔更新（场景环境静态，怪兽阴影仍可低频更新）
        dirLight.shadow.autoUpdate = false;
        // 首次需手动触发一次以生成阴影贴图
        dirLight.shadow.needsUpdate = true;

        this.scene.add(dirLight);
        this.scene.add(dirLight.target);
        this.lights.push(dirLight);
        this.mainLight = dirLight;
    }

    /**
     * 填充光 - 暖色补光消除硬阴影
     */
    _setupFillLight() {
        const fillLight = new THREE.DirectionalLight(0xffddaa, 0.4);
        fillLight.position.set(-30, 25, -20);
        this.scene.add(fillLight);
        this.lights.push(fillLight);
    }

    /**
     * 每帧更新：按间隔手动刷新阴影贴图（降低更新频率以提升性能）
     * 需由游戏主循环调用
     */
    update(delta) {
        if (!this.mainLight) return;
        this._shadowFrameCount++;
        if (this._shadowFrameCount >= this._shadowUpdateInterval) {
            this.mainLight.shadow.needsUpdate = true;
            this._shadowFrameCount = 0;
        }
    }

    /**
     * 设置阴影质量
     * @param {string} quality - off|low|high
     */
    setQuality(quality) {
        if (!this.mainLight) return;
        switch (quality) {
            case 'off':
                this.mainLight.castShadow = false;
                this._shadowUpdateInterval = 999;
                break;
            case 'low':
                this.mainLight.castShadow = true;
                this.mainLight.shadow.mapSize.width = 1024;
                this.mainLight.shadow.mapSize.height = 1024;
                this._shadowUpdateInterval = 3;
                // 重新生成阴影贴图（map可能为null，需检查）
                if (this.mainLight.shadow.map) {
                    this.mainLight.shadow.map.dispose();
                    this.mainLight.shadow.map = null;
                }
                this.mainLight.shadow.needsUpdate = true;
                break;
            case 'high':
                this.mainLight.castShadow = true;
                this.mainLight.shadow.mapSize.width = 2048;
                this.mainLight.shadow.mapSize.height = 2048;
                this._shadowUpdateInterval = 1;
                if (this.mainLight.shadow.map) {
                    this.mainLight.shadow.map.dispose();
                    this.mainLight.shadow.map = null;
                }
                this.mainLight.shadow.needsUpdate = true;
                break;
        }
    }
}
