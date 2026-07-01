/**
 * MiniMap.js - 战术小地图
 * 显示玩家位置、朝向、怪兽位置、地图方位
 * 使用Canvas 2D绘制，性能开销极小
 */
export class MiniMap {
    constructor(game) {
        this.game = game;
        this.canvas = null;
        this.ctx = null;
        this.size = 160;           // 小地图边长（像素）
        this.worldRange = 50;      // 显示世界范围（米），玩家为中心
        this.visible = false;
        this.enabled = false;      // 仅怪兽模式启用

        // 绘制缓存
        this._playerIcon = null;
    }

    /**
     * 创建小地图Canvas元素
     */
    create() {
        // 训练模式HUD中的小地图
        const hudMinimap = document.getElementById('minimap-container');
        if (hudMinimap) {
            hudMinimap.innerHTML = '';
            this.canvas = document.createElement('canvas');
            this.canvas.width = this.size;
            this.canvas.height = this.size;
            this.canvas.className = 'minimap-canvas';
            hudMinimap.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
        }

        // 怪兽模式HUD中的小地图
        const monsterMinimap = document.getElementById('monster-minimap-container');
        if (monsterMinimap) {
            monsterMinimap.innerHTML = '';
            const monsterCanvas = document.createElement('canvas');
            monsterCanvas.width = this.size;
            monsterCanvas.height = this.size;
            monsterCanvas.className = 'minimap-canvas';
            monsterMinimap.appendChild(monsterCanvas);
            // 怪兽模式使用独立canvas
            this.monsterCanvas = monsterCanvas;
            this.monsterCtx = monsterCanvas.getContext('2d');
        }

        // 人机模式HUD中的小地图
        const botMinimap = document.getElementById('bot-minimap-container');
        if (botMinimap) {
            botMinimap.innerHTML = '';
            const botCanvas = document.createElement('canvas');
            botCanvas.width = this.size;
            botCanvas.height = this.size;
            botCanvas.className = 'minimap-canvas';
            botMinimap.appendChild(botCanvas);
            this.botCanvas = botCanvas;
            this.botCtx = botCanvas.getContext('2d');
        }
    }

    /**
     * 显示小地图
     * @param {boolean} monsterMode 是否为怪兽模式（人机模式也使用true以使用专用canvas）
     * @param {string} mode 游戏模式（'monster' | 'bot' | 'training'），优先级高于monsterMode参数
     */
    show(monsterMode = false, mode = null) {
        this.enabled = true;
        this._mode = mode || (monsterMode ? 'monster' : 'training');
        const target = this._getActiveCanvas();
        if (target) target.parentElement.style.display = 'block';
    }

    /**
     * 获取当前模式对应的canvas
     */
    _getActiveCanvas() {
        if (this._mode === 'monster') return this.monsterCanvas;
        if (this._mode === 'bot') return this.botCanvas;
        return this.canvas;
    }

    /**
     * 获取当前模式对应的ctx
     */
    _getActiveCtx() {
        if (this._mode === 'monster') return this.monsterCtx;
        if (this._mode === 'bot') return this.botCtx;
        return this.ctx;
    }

    /**
     * 隐藏小地图
     */
    hide() {
        this.enabled = false;
        if (this.canvas) this.canvas.parentElement.style.display = 'none';
        if (this.monsterCanvas) this.monsterCanvas.parentElement.style.display = 'none';
        if (this.botCanvas) this.botCanvas.parentElement.style.display = 'none';
    }

    /**
     * 更新小地图（每帧调用）
     * @param {THREE.Vector3} playerPos - 玩家位置
     * @param {number} playerYaw - 玩家偏航角
     * @param {Array} monsters - 怪兽列表（怪兽模式）
     */
    update(playerPos, playerYaw, monsters = []) {
        if (!this.enabled) return;
        const ctx = this._getActiveCtx();
        if (!ctx) return;

        const w = this.size;
        const h = this.size;
        const cx = w / 2;
        const cy = h / 2;
        const scale = w / (this.worldRange * 2);  // 世界坐标到canvas坐标的缩放

        // 清空画布
        ctx.clearRect(0, 0, w, h);

        // 绘制背景
        ctx.fillStyle = 'rgba(15, 25, 35, 0.85)';
        ctx.fillRect(0, 0, w, h);

        // 绘制边框
        ctx.strokeStyle = 'rgba(255, 70, 85, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);

        // 绘制网格
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        const gridStep = w / 4;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * gridStep, 0);
            ctx.lineTo(i * gridStep, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * gridStep);
            ctx.lineTo(w, i * gridStep);
            ctx.stroke();
        }

        // 绘制方位标识（N/E/S/W）
        // CameraController前向 = (-sin(yaw), 0, -cos(yaw))，右向 = (cos(yaw), 0, -sin(yaw))
        // 世界方位向量投影到玩家局部坐标系：
        //   rightDist   = wx*cos(yaw) - wz*sin(yaw)
        //   forwardDist = -wx*sin(yaw) - wz*cos(yaw)
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const yaw = playerYaw;
        const dirRadius = cx - 12;
        // 世界方位：N=-z, E=+x, S=+z, W=-x
        const directions = [
            { name: 'N', wx: 0,  wz: -1 },
            { name: 'E', wx: 1,  wz: 0  },
            { name: 'S', wx: 0,  wz: 1  },
            { name: 'W', wx: -1, wz: 0  }
        ];
        for (const dir of directions) {
            const rightDist   = dir.wx * Math.cos(yaw) - dir.wz * Math.sin(yaw);
            const forwardDist = -dir.wx * Math.sin(yaw) - dir.wz * Math.cos(yaw);
            const x = cx + rightDist * dirRadius;
            const y = cy - forwardDist * dirRadius;
            // 只绘制在圆内的方位
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < cx - 6) {
                ctx.fillStyle = dir.name === 'N' ? 'rgba(255, 70, 85, 0.9)' : 'rgba(255, 255, 255, 0.5)';
                ctx.fillText(dir.name, x, y);
            }
        }

        // 绘制范围圆
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, cx - 4, 0, Math.PI * 2);
        ctx.stroke();

        // 绘制怪兽位置（红色圆点）
        if (monsters && monsters.length > 0) {
            for (const monster of monsters) {
                if (!monster.isAlive) continue;
                // 计算怪兽相对玩家的世界位置
                const dx = monster.position.x - playerPos.x;
                const dz = monster.position.z - playerPos.z;
                // 投影到玩家局部坐标系（与方位标识使用同一公式）
                const rightDist   = dx * Math.cos(yaw) - dz * Math.sin(yaw);
                const forwardDist = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
                // 转换到canvas坐标（前方=上方=y更小，右方=x更大）
                const mapX = cx + rightDist * scale;
                const mapY = cy - forwardDist * scale;

                // 裁剪到圆内
                const distFromCenter = Math.sqrt((mapX - cx) ** 2 + (mapY - cy) ** 2);
                if (distFromCenter > cx - 6) continue;

                // 绘制怪兽红点
                ctx.fillStyle = '#ff4655';
                ctx.beginPath();
                ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
                ctx.fill();
                // 红点外发光
                ctx.strokeStyle = 'rgba(255, 70, 85, 0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(mapX, mapY, 5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // 绘制玩家（中心，三角形指示朝向）
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6);     // 顶点（前方）
        ctx.lineTo(cx - 4, cy + 4); // 左下
        ctx.lineTo(cx + 4, cy + 4); // 右下
        ctx.closePath();
        ctx.fill();
        // 玩家外圈
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();

        // 绘制视野扇形
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const fovHalf = Math.PI / 4;  // 45度半视角
        ctx.arc(cx, cy, cx - 4, -Math.PI / 2 - fovHalf, -Math.PI / 2 + fovHalf);
        ctx.closePath();
        ctx.fill();
    }
}
