/**
 * Environment.js - CS:GO沙漠迷城(Dust II)风格地图
 * 沙色建筑、长走廊、开阔区域、掩体箱子
 * 性能优化：静态几何体按材质合并，大幅减少draw call
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.objects = [];

        // 沙漠迷城配色
        this._materials = {
            sand: new THREE.MeshStandardMaterial({
                color: 0xc4a878, roughness: 0.95, metalness: 0.0
            }),
            sandDark: new THREE.MeshStandardMaterial({
                color: 0xa68b5b, roughness: 0.95, metalness: 0.0
            }),
            sandLight: new THREE.MeshStandardMaterial({
                color: 0xd4bc8e, roughness: 0.9, metalness: 0.0
            }),
            brick: new THREE.MeshStandardMaterial({
                color: 0xb58850, roughness: 0.9, metalness: 0.0
            }),
            wood: new THREE.MeshStandardMaterial({
                color: 0x8a6b3d, roughness: 0.85, metalness: 0.0
            }),
            metal: new THREE.MeshStandardMaterial({
                color: 0x665544, roughness: 0.5, metalness: 0.6
            }),
            barrel: new THREE.MeshStandardMaterial({
                color: 0x4a6b3d, roughness: 0.6, metalness: 0.3
            }),
            barrelRed: new THREE.MeshStandardMaterial({
                color: 0x8b3a2a, roughness: 0.6, metalness: 0.3
            })
        };

        // 共享几何体（木箱/油桶/柱子复用同一实例，减少GPU内存与绘制开销）
        this._sharedGeometry = {
            crate: new THREE.BoxGeometry(1.5, 1.5, 1.5),
            barrel: new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12),
            pillar: new THREE.CylinderGeometry(0.4, 0.5, 7, 8)
        };

        // 待合并的静态网格列表（性能优化：合并静态网格减少draw call）
        this._independentMeshes = [];
    }

    build() {
        this._buildGround();
        this._buildGroundVariation();
        this._buildBoundaryWalls();
        this._buildDust2Layout();
        this._buildCoverObjects();
        this._buildBarrelGroups();
        this._buildBarricades();
        this._buildAwnings();
        this._buildDecorations();
        // 合并静态几何体（将数十个独立Mesh压缩为少数几个）
        this._mergeStaticGeometries();
    }

    getColliders() {
        return this.colliders;
    }

    _addCollider(position, size) {
        const half = size.clone().multiplyScalar(0.5);
        this.colliders.push({
            min: new THREE.Vector3(position.x - half.x, position.y - half.y, position.z - half.z),
            max: new THREE.Vector3(position.x + half.x, position.y + half.y, position.z + half.z)
        });
    }

    /**
     * 创建网格 - 暂不加入场景，等待合并（性能优化）
     * 调用方可正常设置rotation/scale，合并时会bake完整变换
     */
    _createMesh(geometry, material, position, castShadow = true, receiveShadow = true, independent = false) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;

        if (independent) {
            // 大型独立网格直接加入场景
            this.scene.add(mesh);
            this.objects.push(mesh);
        } else {
            // 小型静态网格收集待合并
            this._independentMeshes.push(mesh);
        }
        return mesh;
    }

    /**
     * 合并静态几何体（将数十个独立Mesh压缩为少数几个，大幅减少draw call）
     */
    _mergeStaticGeometries() {
        // 按材质分组
        const groups = {};
        for (const mesh of this._independentMeshes) {
            // 更新世界矩阵（包含position+rotation+scale）
            mesh.updateMatrixWorld(true);
            // 克隆几何体并bake完整变换
            const geo = mesh.geometry.clone();
            geo.applyMatrix4(mesh.matrixWorld);
            // 按材质分组
            const matKey = mesh.material.uuid;
            if (!groups[matKey]) {
                groups[matKey] = { geometries: [], material: mesh.material };
            }
            groups[matKey].geometries.push(geo);
        }

        let mergedCount = 0;
        for (const key in groups) {
            const group = groups[key];
            if (group.geometries.length === 0) continue;
            // 合并同材质的所有几何体
            const merged = mergeGeometries(group.geometries, false);
            if (!merged) continue;
            const mesh = new THREE.Mesh(merged, group.material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.objects.push(mesh);
            mergedCount++;
            // 释放临时几何体
            group.geometries.forEach(g => g.dispose());
        }

        // 清理待合并列表（原始mesh未被加入场景，无需移除）
        this._independentMeshes = [];
        console.log(`[Environment] 静态几何体合并完成：${mergedCount}个合并Mesh`);
    }

    /**
     * 沙漠地面
     */
    _buildGround() {
        const groundGeo = new THREE.PlaneGeometry(120, 120);
        const ground = this._createMesh(
            groundGeo, this._materials.sand,
            new THREE.Vector3(0, 0, 0), false, true
        );
        ground.rotation.x = -Math.PI / 2;

        // 中央道路 - 浅色沙地
        const roadGeo = new THREE.PlaneGeometry(8, 60);
        const road = this._createMesh(
            roadGeo, this._materials.sandLight,
            new THREE.Vector3(0, 0.01, 0), false, true
        );
        road.rotation.x = -Math.PI / 2;
    }

    /**
     * 边界墙
     */
    _buildBoundaryWalls() {
        const h = 10, t = 1, s = 50;
        const positions = [
            { pos: [0, h/2, -s], size: [s*2, h, t] },
            { pos: [0, h/2, s], size: [s*2, h, t] },
            { pos: [s, h/2, 0], size: [t, h, s*2] },
            { pos: [-s, h/2, 0], size: [t, h, s*2] }
        ];
        positions.forEach(w => {
            this._createMesh(
                new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]),
                this._materials.sandDark,
                new THREE.Vector3(w.pos[0], w.pos[1], w.pos[2])
            );
            this._addCollider(
                new THREE.Vector3(w.pos[0], w.pos[1], w.pos[2]),
                new THREE.Vector3(w.size[0], w.size[1], w.size[2])
            );
        });
    }

    /**
     * 沙漠迷城核心布局
     */
    _buildDust2Layout() {
        // 区域墙体颜色
        const colorA = 0xb58850;  // A大道：偏红砖色
        const colorB = 0xc4a070;  // B大道：偏黄沙色
        const colorMid = 0xb0a890; // 中庭：偏灰白

        // === A大道（左侧长走廊）===
        this._buildWall(-25, 4, -30, 20, 8, 1, colorA);   // A长廊外墙
        this._buildWall(-25, 4, -10, 1, 8, 20, colorA);   // A长廊侧墙
        this._buildWall(-35, 4, -20, 20, 8, 1, colorA);   // A长廊内墙

        // A包点建筑
        this._buildWall(-30, 4, -35, 12, 6, 1, colorA);
        this._buildWall(-36, 4, -30, 1, 6, 12, colorA);

        // === B大道（右侧长走廊）===
        this._buildWall(25, 4, -30, 20, 8, 1, colorB);    // B长廊外墙
        this._buildWall(25, 4, -10, 1, 8, 20, colorB);    // B长廊侧墙
        this._buildWall(35, 4, -20, 20, 8, 1, colorB);    // B长廊内墙

        // B包点建筑
        this._buildWall(30, 4, -35, 12, 6, 1, colorB);
        this._buildWall(36, 4, -30, 1, 6, 12, colorB);

        // === 中门区域 ===
        this._buildWall(-8, 4, -15, 1, 8, 10, colorMid);    // 中门左墙
        this._buildWall(8, 4, -15, 1, 8, 10, colorMid);     // 中门右墙
        // 中门通道（留缺口在x=0附近）

        // === 中庭开阔区 ===
        this._buildWall(-15, 4, 5, 1, 6, 12, colorMid);     // 中庭左墙
        this._buildWall(15, 4, 5, 1, 6, 12, colorMid);      // 中庭右墙

        // === A小道 ===
        this._buildWall(-12, 4, 15, 1, 6, 10, colorA);    // A小道墙
        this._buildWall(-18, 4, 20, 12, 6, 1, colorA);    // A小道后墙

        // === B小道 ===
        this._buildWall(12, 4, 15, 1, 6, 10, colorB);     // B小道墙
        this._buildWall(18, 4, 20, 12, 6, 1, colorB);     // B小道后墙

        // === 中央二层平台（狙击位）===
        this._buildPlatform(0, 3, -8, 10, 0.3, 6);
        this._buildWall(-5, 5.5, -11, 0.5, 5, 0.5, colorMid);  // 平台围栏
        this._buildWall(5, 5.5, -11, 0.5, 5, 0.5, colorMid);
        this._buildWall(0, 5.5, -14, 10, 5, 0.5, colorMid);

        // 平台楼梯（斜坡）
        this._buildRamp(0, 0, -5, 4, 3, 3);

        // === 出生点区域墙（近端）===
        this._buildWall(-20, 4, 30, 12, 6, 1, colorMid);
        this._buildWall(20, 4, 30, 12, 6, 1, colorMid);
        this._buildWall(-30, 4, 35, 1, 6, 10, colorMid);
        this._buildWall(30, 4, 35, 1, 6, 10, colorMid);

        // === 拱门通道（走廊连接处）===
        this._buildArch(-15, 0, -10);  // A大道入口拱门
        this._buildArch(15, 0, -10);   // B大道入口拱门
        this._buildArch(0, 0, -10);    // 中门拱门

        // === 双层建筑（A包点和B包点）===
        this._buildTwoStoryBuilding(-33, -32);
        this._buildTwoStoryBuilding(33, -32);
    }

    /**
     * 构建墙体（带碰撞）
     * @param {number} color - 可选颜色，不传则使用默认brick材质
     */
    _buildWall(x, y, z, w, h, d, color = null) {
        const material = color !== null
            ? new THREE.MeshStandardMaterial({ color: color, roughness: 0.9, metalness: 0.0 })
            : this._materials.brick;
        this._createMesh(
            new THREE.BoxGeometry(w, h, d),
            material,
            new THREE.Vector3(x, y, z)
        );
        this._addCollider(
            new THREE.Vector3(x, y, z),
            new THREE.Vector3(w, h, d)
        );
    }

    /**
     * 构建平台
     */
    _buildPlatform(x, y, z, w, h, d) {
        this._createMesh(
            new THREE.BoxGeometry(w, h, d),
            this._materials.sandDark,
            new THREE.Vector3(x, y, z)
        );
        this._addCollider(
            new THREE.Vector3(x, y, z),
            new THREE.Vector3(w, h, d)
        );
    }

    /**
     * 构建斜坡（楼梯替代）
     */
    _buildRamp(x, y, z, w, h, d) {
        const ramp = this._createMesh(
            new THREE.BoxGeometry(w, h, d),
            this._materials.sandDark,
            new THREE.Vector3(x, y + h/2, z)
        );
        ramp.rotation.x = Math.atan2(h, d);
        this._addCollider(
            new THREE.Vector3(x, y + h/2, z),
            new THREE.Vector3(w, h, d)
        );
    }

    /**
     * 掩体：木箱、油桶
     */
    _buildCoverObjects() {
        // 木箱组 - A大道
        this._buildCrate(-22, 0, -25);
        this._buildCrate(-22, 1.5, -25);
        this._buildCrate(-20, 0, -23);

        // 木箱组 - B大道
        this._buildCrate(22, 0, -25);
        this._buildCrate(22, 1.5, -25);
        this._buildCrate(20, 0, -23);

        // 中央木箱（中庭掩体）
        this._buildCrate(-5, 0, 0);
        this._buildCrate(5, 0, 0);
        this._buildCrate(0, 0, -3);
        this._buildCrate(-3, 0, 3);
        this._buildCrate(3, 0, 3);

        // 油桶
        this._buildBarrel(-10, 0, 10, false);
        this._buildBarrel(-8, 0, 10, true);
        this._buildBarrel(10, 0, 10, false);
        this._buildBarrel(8, 0, 10, true);

        // 出生点附近掩体
        this._buildCrate(-10, 0, 25);
        this._buildCrate(10, 0, 25);
        this._buildBarrel(0, 0, 28, false);

        // A小道掩体
        this._buildCrate(-15, 0, 18);
        // B小道掩体
        this._buildCrate(15, 0, 18);
    }

    /**
     * 木箱
     */
    _buildCrate(x, y, z) {
        const s = 1.5;
        this._createMesh(
            this._sharedGeometry.crate,
            this._materials.wood,
            new THREE.Vector3(x, y + s/2, z)
        );
        this._addCollider(
            new THREE.Vector3(x, y + s/2, z),
            new THREE.Vector3(s, s, s)
        );
    }

    /**
     * 油桶
     */
    _buildBarrel(x, y, z, isRed) {
        const mat = isRed ? this._materials.barrelRed : this._materials.barrel;
        this._createMesh(
            this._sharedGeometry.barrel,
            mat,
            new THREE.Vector3(x, y + 0.7, z),
            false  // 小物体不投射阴影，减少阴影计算
        );
        this._addCollider(
            new THREE.Vector3(x, y + 0.7, z),
            new THREE.Vector3(1, 1.4, 1)
        );
    }

    /**
     * 拱门通道（两侧柱子 + 顶部横梁）
     * 用 sandLight 材质，模拟沙漠迷城拱门
     */
    _buildArch(x, y, z) {
        const mat = this._materials.sandLight;
        const pillarH = 6;       // 柱子高度
        const pillarW = 0.8;     // 柱子宽度
        const pillarD = 1.5;     // 柱子深度
        const beamH = 1;         // 横梁高度
        const beamW = 6;         // 横梁宽度（覆盖通道）
        const beamD = 1.5;       // 横梁深度
        const gap = 4;           // 通道宽度

        // 左柱
        this._createMesh(
            new THREE.BoxGeometry(pillarW, pillarH, pillarD),
            mat,
            new THREE.Vector3(x - gap / 2 - pillarW / 2, y + pillarH / 2, z)
        );
        this._addCollider(
            new THREE.Vector3(x - gap / 2 - pillarW / 2, y + pillarH / 2, z),
            new THREE.Vector3(pillarW, pillarH, pillarD)
        );

        // 右柱
        this._createMesh(
            new THREE.BoxGeometry(pillarW, pillarH, pillarD),
            mat,
            new THREE.Vector3(x + gap / 2 + pillarW / 2, y + pillarH / 2, z)
        );
        this._addCollider(
            new THREE.Vector3(x + gap / 2 + pillarW / 2, y + pillarH / 2, z),
            new THREE.Vector3(pillarW, pillarH, pillarD)
        );

        // 顶部横梁
        this._createMesh(
            new THREE.BoxGeometry(beamW, beamH, beamD),
            mat,
            new THREE.Vector3(x, y + pillarH + beamH / 2, z)
        );
        this._addCollider(
            new THREE.Vector3(x, y + pillarH + beamH / 2, z),
            new THREE.Vector3(beamW, beamH, beamD)
        );

        // 横梁上方装饰小方块（拱顶石）
        this._createMesh(
            new THREE.BoxGeometry(1.2, 0.5, 1.8),
            this._materials.sandDark,
            new THREE.Vector3(x, y + pillarH + beamH + 0.25, z)
        );
    }

    /**
     * 双层建筑（可进入，一层门洞，二层窗洞，外部楼梯）
     * 使用 brick 材质
     */
    _buildTwoStoryBuilding(x, z) {
        const wallH = 3;        // 每层高度
        const wallT = 0.3;      // 墙厚
        const width = 8;        // 建筑宽度
        const depth = 6;        // 建筑深度
        const doorW = 2;        // 门洞宽度
        const winW = 1.5;       // 窗洞宽度

        // === 一层墙体（前墙留门洞）===
        const sideW1 = (width - doorW) / 2;
        // 前墙左段
        this._buildWall(x - width / 2 + sideW1 / 2, wallH / 2, z + depth / 2,
            sideW1, wallH, wallT);
        // 前墙右段
        this._buildWall(x + width / 2 - sideW1 / 2, wallH / 2, z + depth / 2,
            sideW1, wallH, wallT);
        // 后墙
        this._buildWall(x, wallH / 2, z - depth / 2, width, wallH, wallT);
        // 左墙
        this._buildWall(x - width / 2, wallH / 2, z, wallT, wallH, depth);
        // 右墙
        this._buildWall(x + width / 2, wallH / 2, z, wallT, wallH, depth);

        // === 二层楼板 ===
        this._createMesh(
            new THREE.BoxGeometry(width, 0.2, depth),
            this._materials.sandDark,
            new THREE.Vector3(x, wallH, z)
        );

        // === 二层墙体（前墙留窗洞）===
        const sideW2 = (width - winW) / 2;
        // 前墙左段
        this._buildWall(x - width / 2 + sideW2 / 2, wallH + wallH / 2, z + depth / 2,
            sideW2, wallH, wallT);
        // 前墙右段
        this._buildWall(x + width / 2 - sideW2 / 2, wallH + wallH / 2, z + depth / 2,
            sideW2, wallH, wallT);
        // 后墙
        this._buildWall(x, wallH + wallH / 2, z - depth / 2, width, wallH, wallT);
        // 左墙
        this._buildWall(x - width / 2, wallH + wallH / 2, z, wallT, wallH, depth);
        // 右墙
        this._buildWall(x + width / 2, wallH + wallH / 2, z, wallT, wallH, depth);

        // === 屋顶 ===
        this._createMesh(
            new THREE.BoxGeometry(width + 0.4, 0.3, depth + 0.4),
            this._materials.sandDark,
            new THREE.Vector3(x, wallH * 2 + 0.15, z)
        );

        // === 外部楼梯（连接到二层）===
        this._buildExternalStairs(x + width / 2 + 0.6, z, wallH);
    }

    /**
     * 外部楼梯（阶梯式连接到二层）
     */
    _buildExternalStairs(x, z, targetH) {
        const stepCount = 6;
        const stepH = targetH / stepCount;
        const stepD = 0.4;
        const stepW = 1.5;
        for (let i = 0; i < stepCount; i++) {
            this._createMesh(
                new THREE.BoxGeometry(stepW, stepH, stepD),
                this._materials.sandDark,
                new THREE.Vector3(x + i * stepD * 0.5, stepH / 2 + i * stepH, z)
            );
            this._addCollider(
                new THREE.Vector3(x + i * stepD * 0.5, stepH / 2 + i * stepH, z),
                new THREE.Vector3(stepW, stepH, stepD)
            );
        }
        // 二层连接平台
        this._createMesh(
            new THREE.BoxGeometry(1.5, 0.2, 1.5),
            this._materials.sandDark,
            new THREE.Vector3(x + stepCount * stepD * 0.5 + 0.5, targetH, z)
        );
        this._addCollider(
            new THREE.Vector3(x + stepCount * stepD * 0.5 + 0.5, targetH, z),
            new THREE.Vector3(1.5, 0.2, 1.5)
        );
    }

    /**
     * 遮阳篷/帆布（倾斜的PlaneGeometry）
     */
    _buildAwning(x, y, z, color, rotationY = 0) {
        const mat = new THREE.MeshStandardMaterial({
            color: color, roughness: 0.8, metalness: 0.0,
            side: THREE.DoubleSide
        });
        const awning = this._createMesh(
            new THREE.PlaneGeometry(3, 1.5),
            mat,
            new THREE.Vector3(x, y, z),
            true, false
        );
        // 倾斜遮阳篷
        awning.rotation.set(-Math.PI / 6, rotationY, 0);
    }

    /**
     * 批量遮阳篷（红绿交替，建筑门口）
     */
    _buildAwnings() {
        // A包点建筑门口 - 红色
        this._buildAwning(-33, 3.5, -28.5, 0xb5332a, 0);
        // B包点建筑门口 - 绿色
        this._buildAwning(33, 3.5, -28.5, 0x3a7a3a, 0);
        // 出生点区域 - 红绿交替
        this._buildAwning(-20, 3.2, 29.5, 0xb5332a, 0);
        this._buildAwning(20, 3.2, 29.5, 0x3a7a3a, 0);
        // 中庭建筑 - 红色
        this._buildAwning(-14, 3.2, 4.5, 0xb5332a, Math.PI / 2);
        this._buildAwning(14, 3.2, 4.5, 0x3a7a3a, -Math.PI / 2);
    }

    /**
     * 地面纹理变化（不同区域不同颜色）
     */
    _buildGroundVariation() {
        // A大道地面 - 偏红沙色
        const aMat = new THREE.MeshStandardMaterial({
            color: 0xb58850, roughness: 0.95, metalness: 0.0
        });
        const aGround = this._createMesh(
            new THREE.PlaneGeometry(8, 30),
            aMat,
            new THREE.Vector3(-25, 0.02, -25), false, true
        );
        aGround.rotation.x = -Math.PI / 2;

        // B大道地面 - 偏黄沙色
        const bMat = new THREE.MeshStandardMaterial({
            color: 0xc4a070, roughness: 0.95, metalness: 0.0
        });
        const bGround = this._createMesh(
            new THREE.PlaneGeometry(8, 30),
            bMat,
            new THREE.Vector3(25, 0.02, -25), false, true
        );
        bGround.rotation.x = -Math.PI / 2;

        // 中庭地面 - 浅色石板
        const cMat = new THREE.MeshStandardMaterial({
            color: 0xb0a890, roughness: 0.9, metalness: 0.0
        });
        const cGround = this._createMesh(
            new THREE.PlaneGeometry(20, 20),
            cMat,
            new THREE.Vector3(0, 0.02, 5), false, true
        );
        cGround.rotation.x = -Math.PI / 2;

        // A包点地面标记
        const aMark = this._createMesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.MeshStandardMaterial({ color: 0xa67a40, roughness: 0.95 }),
            new THREE.Vector3(-33, 0.03, -32), false, true
        );
        aMark.rotation.x = -Math.PI / 2;

        // B包点地面标记
        const bMark = this._createMesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.MeshStandardMaterial({ color: 0xb59060, roughness: 0.95 }),
            new THREE.Vector3(33, 0.03, -32), false, true
        );
        bMark.rotation.x = -Math.PI / 2;
    }

    /**
     * 油桶组（3-4个一组，堆叠排列，红绿交替）
     */
    _buildBarrelGroup(x, z) {
        // 底层3个
        this._buildBarrel(x, 0, z, false);
        this._buildBarrel(x + 1.2, 0, z, true);
        this._buildBarrel(x + 0.6, 0, z + 1.2, false);
        // 顶部堆叠1个
        this._buildBarrel(x + 0.6, 1.4, z + 0.6, true);
    }

    /**
     * 批量油桶组（A包点、B包点、中庭各一组）
     */
    _buildBarrelGroups() {
        // A包点油桶组
        this._buildBarrelGroup(-30, -30);
        // B包点油桶组
        this._buildBarrelGroup(30, -30);
        // 中庭油桶组
        this._buildBarrelGroup(0, 8);
    }

    /**
     * 木板路障（倾斜的木板，增加战术感）
     */
    _buildBarricade(x, y, z, rotationY = 0) {
        const board = this._createMesh(
            new THREE.BoxGeometry(3, 0.15, 1),
            this._materials.wood,
            new THREE.Vector3(x, y + 1, z)
        );
        // 倾斜放置
        board.rotation.z = Math.PI / 8;
        board.rotation.y = rotationY;
        this._addCollider(
            new THREE.Vector3(x, y + 1, z),
            new THREE.Vector3(3, 1, 1)
        );

        // 第二块木板（交叉放置）
        const board2 = this._createMesh(
            new THREE.BoxGeometry(3, 0.15, 1),
            this._materials.wood,
            new THREE.Vector3(x, y + 1.8, z)
        );
        board2.rotation.z = -Math.PI / 8;
        board2.rotation.y = rotationY;
    }

    /**
     * 批量木板路障（走廊中）
     */
    _buildBarricades() {
        // A大道走廊
        this._buildBarricade(-25, 0, -20, 0);
        // B大道走廊
        this._buildBarricade(25, 0, -20, 0);
        // 中门通道
        this._buildBarricade(0, 0, -12, 0);
        // A小道
        this._buildBarricade(-15, 0, 18, Math.PI / 2);
        // B小道
        this._buildBarricade(15, 0, 18, Math.PI / 2);
    }

    /**
     * 装饰：柱子、拱门
     */
    _buildDecorations() {
        // 沙漠风格柱子
        const pillarPositions = [
            [-10, 0, -20], [10, 0, -20],
            [-10, 0, 10], [10, 0, 10]
        ];
        pillarPositions.forEach(p => {
            this._createMesh(
                this._sharedGeometry.pillar,
                this._materials.sandLight,
                new THREE.Vector3(p[0], 3.5, p[1]),
                false  // 装饰柱子不投射阴影，减少阴影计算
            );
            this._addCollider(
                new THREE.Vector3(p[0], 3.5, p[1]),
                new THREE.Vector3(1, 7, 1)
            );
            // 柱顶
            this._createMesh(
                new THREE.BoxGeometry(1.2, 0.4, 1.2),
                this._materials.sandDark,
                new THREE.Vector3(p[0], 7.2, p[1]),
                false  // 柱顶装饰不投射阴影
            );
        });

        // 地面沙色标记（中央区域指示）
        const markMat = new THREE.MeshBasicMaterial({
            color: 0xa68b5b, transparent: true, opacity: 0.3
        });
        const mark = new THREE.Mesh(
            new THREE.RingGeometry(4, 5, 4, 1),
            markMat
        );
        mark.rotation.x = -Math.PI / 2;
        mark.rotation.z = Math.PI / 4;
        mark.position.set(0, 0.02, 0);
        this.scene.add(mark);
    }
}
