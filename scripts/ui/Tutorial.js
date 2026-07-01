/**
 * Tutorial.js - 教程系统
 * 5步递进式新手引导：移动 → 视角 → 射击 → 换弹 → 综合战斗
 */
export class Tutorial {
    constructor(game) {
        this.game = game;

        // 教程步骤定义
        this.steps = [
            {
                index: 0,
                title: '移动训练',
                description: '使用 W A S D 键移动角色，探索训练场',
                target: 20,  // 目标移动距离(米)
                unit: 'm',
                keyPrompts: [
                    { key: 'W', label: '前进' },
                    { key: 'A', label: '左移' },
                    { key: 'S', label: '后退' },
                    { key: 'D', label: '右移' }
                ]
            },
            {
                index: 1,
                title: '视角控制',
                description: '移动鼠标控制视角，环顾四周环境',
                target: 360,  // 目标旋转角度
                unit: '°',
                keyPrompts: [
                    { key: 'MOUSE', label: '视角' }
                ]
            },
            {
                index: 2,
                title: '射击训练',
                description: '左键射击前方的战术靶标，命中即可完成',
                target: 1,  // 目标命中次数
                unit: '次',
                keyPrompts: [
                    { key: 'LMB', label: '射击' }
                ]
            },
            {
                index: 3,
                title: '换弹操作',
                description: '按 R 键更换弹匣，准备持续作战',
                target: 1,  // 目标换弹次数
                unit: '次',
                keyPrompts: [
                    { key: 'R', label: '换弹' }
                ]
            },
            {
                index: 4,
                title: '综合战斗',
                description: '击毁所有战术靶标，展示你的战斗技巧',
                target: 5,  // 目标击毁数
                unit: '个',
                keyPrompts: [
                    { key: 'LMB', label: '射击' },
                    { key: 'R', label: '换弹' },
                    { key: 'WASD', label: '移动' }
                ]
            }
        ];

        // 当前状态
        this.currentStepIndex = 0;
        this.startTime = 0;

        // 进度统计
        this.progress = {
            moveDistance: 0,
            rotationAngle: 0,
            hitCount: 0,
            reloadCount: 0,
            targetsDestroyed: 0
        };

        // 总体统计
        this.stats = {
            shotsFired: 0,
            shotsHit: 0,
            targetsDestroyed: 0,
            reloadCount: 0,
            timeElapsed: 0
        };

        // 上次相机角度 (用于计算旋转量)
        this._lastYaw = 0;
        this._totalRotation = 0;

        // 已完成的步骤
        this.completedSteps = new Set();
    }

    /**
     * 开始教程
     */
    start() {
        this.currentStepIndex = 0;
        this.startTime = performance.now() / 1000;
        this.progress = {
            moveDistance: 0,
            rotationAngle: 0,
            hitCount: 0,
            reloadCount: 0,
            targetsDestroyed: 0
        };
        this.stats = {
            shotsFired: 0,
            shotsHit: 0,
            targetsDestroyed: 0,
            reloadCount: 0,
            timeElapsed: 0
        };
        this._lastYaw = this.game.cameraController.yaw;
        this._totalRotation = 0;
        this.completedSteps.clear();
        // 重置所有步骤的完成标志（避免重启后教程卡死）
        if (this.steps) {
            this.steps.forEach(step => { step.isComplete = false; });
        }
    }

    /**
     * 重置教程
     */
    reset() {
        this.start();
    }

    /**
     * 更新教程
     */
    update(delta) {
        const step = this.steps[this.currentStepIndex];
        if (!step) return;

        // 更新统计数据
        this.stats.timeElapsed = (performance.now() / 1000) - this.startTime;

        // 根据当前步骤更新进度
        switch (this.currentStepIndex) {
            case 0: // 移动训练
                this.progress.moveDistance = this.game.player.totalDistance;
                break;
            case 1: // 视角控制
                this._updateRotationProgress();
                break;
            case 3: // 换弹操作
                this.progress.reloadCount = this.stats.reloadCount;
                break;
        }

        // 检查步骤完成
        this._checkStepCompletion();
    }

    /**
     * 更新旋转进度
     */
    _updateRotationProgress() {
        const currentYaw = this.game.cameraController.yaw;
        let diff = currentYaw - this._lastYaw;

        // 处理角度环绕
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        this._totalRotation += Math.abs(diff);
        this._lastYaw = currentYaw;
        this.progress.rotationAngle = (this._totalRotation * 180 / Math.PI);
    }

    /**
     * 检查当前步骤是否完成
     */
    _checkStepCompletion() {
        const step = this.steps[this.currentStepIndex];
        if (!step || step.isComplete) return;

        let currentValue = 0;
        switch (this.currentStepIndex) {
            case 0: currentValue = this.progress.moveDistance; break;
            case 1: currentValue = this.progress.rotationAngle; break;
            case 2: currentValue = this.progress.hitCount; break;
            case 3: currentValue = this.progress.reloadCount; break;
            case 4: currentValue = this.progress.targetsDestroyed; break;
        }

        if (currentValue >= step.target) {
            step.isComplete = true;
            this.completedSteps.add(this.currentStepIndex);
            // 延迟进入下一步
            setTimeout(() => this._advanceStep(), 1500);
        }
    }

    /**
     * 进入下一步
     */
    _advanceStep() {
        if (this.currentStepIndex < this.steps.length - 1) {
            this.currentStepIndex++;
            this.game.audio.playUiComplete();
        } else {
            // 全部完成
            this.game.completeTutorial();
        }
    }

    /**
     * 射击事件回调
     */
    onShoot() {
        this.stats.shotsFired++;
    }

    /**
     * 靶标命中回调
     */
    onTargetHit(target, damage, isKill) {
        this.stats.shotsHit++;
        if (this.currentStepIndex === 2) {
            this.progress.hitCount++;
        }
    }

    /**
     * 靶标击毁回调
     */
    onTargetDestroyed(target) {
        this.stats.targetsDestroyed++;
        this.progress.targetsDestroyed++;
    }

    /**
     * 换弹事件回调 (由Game调用)
     */
    onReload() {
        this.stats.reloadCount++;
        if (this.currentStepIndex === 3) {
            this.progress.reloadCount++;
        }
    }

    /**
     * 获取当前步骤
     */
    getCurrentStep() {
        return this.steps[this.currentStepIndex];
    }

    /**
     * 获取当前步骤进度
     */
    getStepProgress() {
        const step = this.steps[this.currentStepIndex];
        if (!step) return { ratio: 0, text: '0 / 0' };

        let current = 0;
        switch (this.currentStepIndex) {
            case 0: current = this.progress.moveDistance; break;
            case 1: current = this.progress.rotationAngle; break;
            case 2: current = this.progress.hitCount; break;
            case 3: current = this.progress.reloadCount; break;
            case 4: current = this.progress.targetsDestroyed; break;
        }

        const ratio = Math.min(1, current / step.target);
        const displayCurrent = Math.floor(current);
        const displayTarget = step.target;

        return {
            ratio,
            text: `${displayCurrent} / ${displayTarget}${step.unit}`
        };
    }

    /**
     * 获取最终统计数据
     */
    getStats() {
        const accuracy = this.stats.shotsFired > 0
            ? Math.round((this.stats.shotsHit / this.stats.shotsFired) * 100)
            : 0;

        return {
            shotsFired: this.stats.shotsFired,
            shotsHit: this.stats.shotsHit,
            accuracy,
            targetsDestroyed: this.stats.targetsDestroyed,
            reloadCount: this.stats.reloadCount,
            timeElapsed: this.stats.timeElapsed
        };
    }
}
