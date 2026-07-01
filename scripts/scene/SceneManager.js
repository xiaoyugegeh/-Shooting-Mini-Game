/**
 * SceneManager.js - 场景管理器
 * 负责Three.js Scene的创建、雾效与背景设置
 */
import * as THREE from 'three';

export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();
        this._setupBackground();
        this._setupFog();
    }

    /**
     * 设置背景色 - 沙漠迷城风格暖色天空
     */
    _setupBackground() {
        const skyGeometry = new THREE.SphereGeometry(200, 32, 16);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x6ba8d4) },      // 沙漠蓝天
                middleColor: { value: new THREE.Color(0xc4d4e4) },   // 浅蓝白
                bottomColor: { value: new THREE.Color(0xe8c890) },   // 沙色地平线
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 middleColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    vec3 color;
                    if (h > 0.0) {
                        color = mix(middleColor, topColor, pow(h, exponent));
                    } else {
                        color = mix(middleColor, bottomColor, pow(abs(h), 0.5));
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
        this.sky = sky;
    }

    /**
     * 设置雾效 - 沙漠热浪氛围
     */
    _setupFog() {
        this.scene.fog = new THREE.FogExp2(0xd4bc8e, 0.008);
    }

    /**
     * 添加物体到场景
     */
    add(object) {
        this.scene.add(object);
    }

    /**
     * 移除物体
     */
    remove(object) {
        this.scene.remove(object);
    }
}
