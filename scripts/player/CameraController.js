/**
 * CameraController.js - 第一人称相机控制器（CS:GO风格）
 * 参考three.js PointerLockControls: Euler YXZ顺序避免万向锁
 * 相机即玩家头部，眼高1.6，无第三人称距离偏移
 */
import * as THREE from 'three';

export class CameraController {
    constructor(player, colliders) {
        this.player = player;
        this.colliders = colliders;

        // 第一人称相机
        this.camera = new THREE.PerspectiveCamera(
            90,                              // FOV 90° (CS:GO风格广视野)
            window.innerWidth / window.innerHeight,
            0.01,                            // 近裁面极近（武器不穿墙）
            500
        );

        // 视角控制 - 鼠标输入直接写入（无延迟）
        this.yaw = 0;              // 水平偏航角
        this.pitch = 0;            // 垂直俯仰角

        // 鼠标灵敏度（降低默认值，提升操作舒适度）
        this.sensitivity = 0.0015;
        this.sensitivityPresets = {
            low: 0.0010,
            medium: 0.0015,
            high: 0.0022
        };
        // 反向Y轴（设置面板控制）
        this.invertY = false;

        // 俯仰角限制（收窄范围，避免上下视角过度翻转导致不适）
        this.maxPitch = Math.PI / 2 - 0.15;  // ~81.4°
        this.minPitch = -Math.PI / 2 + 0.15;

        // 眼睛高度
        this.eyeHeight = 1.6;

        // 视角晃动参数（行走时的武器摆动）
        this.bobTime = 0;
        this.bobAmount = 0.015;
        this.bobSpeed = 10;

        // 屏幕震动参数
        this.shakeIntensity = 0;       // 当前震动强度
        this.shakeDecay = 0.85;        // 每帧衰减系数

        // 武器后坐力视觉偏移（viewmodel踢动动画）
        this.recoilOffset = new THREE.Vector3();
        // 武器模型基础位置（用于叠加后坐力偏移）
        this._vmBasePos = new THREE.Vector3(0.18, -0.15, -0.35);

        // 武器视角模型
        this.viewmodel = null;
        this._buildViewmodel();

        // 复用欧拉角（避免每帧创建）
        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._tempVec = new THREE.Vector3();
    }

    /**
     * 构建FPS武器视角模型（挂在相机子节点）
     * 参考: nicktaras/three-js-fps - camera.add(weaponMesh)
     */
    _buildViewmodel() {
        const vm = new THREE.Group();

        // 武器主体 - 简化步枪外形（材质引用保存以支持皮肤切换）
        this._vmBodyMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, roughness: 0.6, metalness: 0.4
        });
        this._vmAccentMat = new THREE.MeshStandardMaterial({
            color: 0xff4655, roughness: 0.4, metalness: 0.3,
            emissive: 0xff4655, emissiveIntensity: 0.3
        });

        // 枪身
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.12, 0.5),
            this._vmBodyMat
        );
        body.position.set(0, 0, -0.1);
        vm.add(body);

        // 枪管
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8),
            this._vmBodyMat
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.45);
        vm.add(barrel);

        // 握把
        const grip = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.15, 0.08),
            this._vmBodyMat
        );
        grip.position.set(0, -0.12, 0.05);
        grip.rotation.x = 0.2;
        vm.add(grip);

        // 弹匣
        const mag = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.18, 0.06),
            this._vmBodyMat
        );
        mag.position.set(0, -0.13, -0.1);
        vm.add(mag);

        // 瞄准准星/红点
        const sight = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.03, 0.03),
            this._vmAccentMat
        );
        sight.position.set(0, 0.08, -0.2);
        vm.add(sight);

        // 定位到屏幕右下角（CS:GO风格）
        vm.position.set(0.18, -0.15, -0.35);
        vm.rotation.y = -0.05;

        this.viewmodel = vm;
        this.camera.add(vm);
    }

    /**
     * 应用武器皮肤（修改viewmodel主体与装饰材质颜色）
     * @param {object} skin 皮肤配置 { bodyColor, accentColor, ... }
     */
    applySkin(skin) {
        if (!skin) return;
        if (this._vmBodyMat) {
            this._vmBodyMat.color.setHex(skin.bodyColor);
            // 传奇皮肤提高金属感强化质感
            if (skin.rarity === 'legendary') {
                this._vmBodyMat.metalness = 0.7;
                this._vmBodyMat.roughness = 0.3;
            }
        }
        if (this._vmAccentMat) {
            this._vmAccentMat.color.setHex(skin.accentColor);
            this._vmAccentMat.emissive.setHex(skin.accentColor);
            // 史诗/传奇皮肤增强发光
            if (skin.rarity === 'epic' || skin.rarity === 'legendary') {
                this._vmAccentMat.emissiveIntensity = 0.6;
            }
        }
    }

    /**
     * 处理鼠标移动 - CS:GO风格直接映射
     */
    handleMouseMove(movementX, movementY) {
        // 线性灵敏度，1:1可预测响应
        this.yaw -= movementX * this.sensitivity;
        // Y轴标准FPS手感：鼠标上移(movementY<0)→视线上抬(pitch>0)
        // Three.js中正pitch=抬头，故非反向时 pitch -= movementY*sens
        const ySign = this.invertY ? -1 : 1;
        this.pitch -= movementY * this.sensitivity * ySign;

        // 限制俯仰角（防止翻转）
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    }

    /**
     * 设置灵敏度
     */
    setSensitivity(preset) {
        if (this.sensitivityPresets[preset]) {
            this.sensitivity = this.sensitivityPresets[preset];
        }
    }

    /**
     * 添加屏幕震动（外部调用触发）
     * @param {number} intensity - 震动强度
     */
    addShake(intensity) {
        // 取较大值，避免连续射击时震动被覆盖变小
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    }

    /**
     * 添加武器后坐力动画（viewmodel向后踢）
     * 方向：z正方向（向后退）+ y正方向（上抬）
     */
    addRecoil() {
        this.recoilOffset.set(0, 0.05, 0.15);
    }

    /**
     * 更新相机 - 第一人称
     */
    update(delta, input) {
        // 相机位置 = 玩家位置 + 眼高
        this.camera.position.set(
            this.player.position.x,
            this.player.position.y + this.eyeHeight,
            this.player.position.z
        );

        // 屏幕震动 - 应用随机偏移到相机位置
        if (this.shakeIntensity > 0.001) {
            this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
            this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
            // 每帧衰减
            this.shakeIntensity *= this.shakeDecay;
        } else {
            this.shakeIntensity = 0;
        }

        // 使用欧拉角设置相机朝向（YXZ顺序避免万向锁）
        this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this._euler);

        // 行走晃动（武器bob效果）- 计算基础位置
        const speed = Math.sqrt(
            this.player.velocity.x ** 2 + this.player.velocity.z ** 2
        );
        if (speed > 0.5 && this.player.isOnGround) {
            this.bobTime += delta * this.bobSpeed;
            const bobX = Math.cos(this.bobTime) * this.bobAmount;
            const bobY = Math.abs(Math.sin(this.bobTime)) * this.bobAmount;
            this._vmBasePos.set(0.18 + bobX, -0.15 + bobY, -0.35);
        } else {
            // 静止时缓慢回正
            this._vmBasePos.x += (0.18 - this._vmBasePos.x) * 0.1;
            this._vmBasePos.y += (-0.15 - this._vmBasePos.y) * 0.1;
            this._vmBasePos.z = -0.35;
        }

        // 叠加后坐力偏移并应用到武器模型
        this.viewmodel.position.copy(this._vmBasePos).add(this.recoilOffset);

        // 后坐力衰减回原位
        this.recoilOffset.multiplyScalar(0.85);
    }

    /**
     * 获取相机前方方向（水平，用于移动）
     */
    getForwardVector() {
        return new THREE.Vector3(
            -Math.sin(this.yaw),
            0,
            -Math.cos(this.yaw)
        ).normalize();
    }

    /**
     * 获取相机右方方向（水平，用于移动）
     */
    getRightVector() {
        return new THREE.Vector3(
            Math.cos(this.yaw),
            0,
            -Math.sin(this.yaw)
        ).normalize();
    }

    /**
     * 获取相机视线方向（3D，用于射击）
     */
    getLookDirection() {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        return dir;
    }

    /**
     * 获取累计旋转角度（用于教程统计）
     */
    getTotalRotation() {
        return Math.abs(this.yaw);
    }

    /**
     * 窗口缩放处理
     */
    onResize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
}
