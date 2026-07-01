/**
 * InputManager.js - 输入管理器
 * 负责键盘、鼠标输入的统一管理与事件分发
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};              // 键盘按键状态
        this.mouse = {
            movementX: 0,            // 鼠标水平移动量
            movementY: 0,            // 鼠标垂直移动量
            leftButton: false,       // 左键状态
            rightButton: false,      // 右键状态（开镜）
            isLocked: false          // 是否锁定鼠标
        };

        // 事件回调
        this.onMouseMove = null;     // 鼠标移动回调
        this.onMouseDown = null;     // 鼠标按下回调
        this.onMouseUp = null;       // 鼠标释放回调
        this.onKeyDown = null;       // 键盘按下回调
        this.onKeyUp = null;         // 键盘释放回调
        this.onPointerLockChange = null; // 指针锁定状态变化回调

        this._bindEvents();
    }

    /**
     * 绑定输入事件
     */
    _bindEvents() {
        // 键盘事件
        window.addEventListener('keydown', (e) => this._handleKeyDown(e));
        window.addEventListener('keyup', (e) => this._handleKeyUp(e));

        // 鼠标事件
        document.addEventListener('mousemove', (e) => this._handleMouseMove(e));
        document.addEventListener('mousedown', (e) => this._handleMouseDown(e));
        document.addEventListener('mouseup', (e) => this._handleMouseUp(e));

        // 指针锁定状态变化
        document.addEventListener('pointerlockchange', () => this._handlePointerLockChange());

        // 防止右键菜单
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * 请求锁定鼠标指针
     */
    requestPointerLock() {
        this.canvas.requestPointerLock();
    }

    /**
     * 退出指针锁定
     */
    exitPointerLock() {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    /**
     * 键盘按下处理
     */
    _handleKeyDown(e) {
        // 防止WASD等按键的默认行为
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR'].includes(e.code)) {
            e.preventDefault();
        }

        const wasPressed = !this.keys[e.code];
        this.keys[e.code] = true;

        if (wasPressed && this.onKeyDown) {
            this.onKeyDown(e.code);
        }
    }

    /**
     * 键盘释放处理
     */
    _handleKeyUp(e) {
        this.keys[e.code] = false;
        if (this.onKeyUp) {
            this.onKeyUp(e.code);
        }
    }

    /**
     * 鼠标移动处理
     */
    _handleMouseMove(e) {
        if (this.mouse.isLocked) {
            this.mouse.movementX = e.movementX || 0;
            this.mouse.movementY = e.movementY || 0;
            if (this.onMouseMove) {
                this.onMouseMove(this.mouse.movementX, this.mouse.movementY);
            }
        }
    }

    /**
     * 鼠标按下处理
     */
    _handleMouseDown(e) {
        if (e.button === 0) { // 左键
            this.mouse.leftButton = true;
            if (this.onMouseDown) {
                this.onMouseDown(e.button);
            }
        } else if (e.button === 2) { // 右键（开镜）
            this.mouse.rightButton = true;
            if (this.onMouseDown) {
                this.onMouseDown(e.button);
            }
        }
    }

    /**
     * 鼠标释放处理
     */
    _handleMouseUp(e) {
        if (e.button === 0) {
            this.mouse.leftButton = false;
            if (this.onMouseUp) {
                this.onMouseUp(e.button);
            }
        } else if (e.button === 2) { // 右键（开镜）
            this.mouse.rightButton = false;
            if (this.onMouseUp) {
                this.onMouseUp(e.button);
            }
        }
    }

    /**
     * 指针锁定状态变化处理
     */
    _handlePointerLockChange() {
        this.mouse.isLocked = document.pointerLockElement === this.canvas;
        if (this.onPointerLockChange) {
            this.onPointerLockChange(this.mouse.isLocked);
        }
    }

    /**
     * 检查按键是否按下
     */
    isKeyDown(code) {
        return !!this.keys[code];
    }

    /**
     * 检查任意一组按键是否按下
     */
    isAnyKeyDown(...codes) {
        return codes.some(code => this.keys[code]);
    }

    /**
     * 获取移动输入向量 (归一化)
     * 返回 {x, y} x为左右, y为前后
     */
    getMovementVector() {
        let x = 0;
        let y = 0;
        if (this.isKeyDown('KeyW')) y += 1;
        if (this.isKeyDown('KeyS')) y -= 1;
        if (this.isKeyDown('KeyA')) x -= 1;
        if (this.isKeyDown('KeyD')) x += 1;

        // 归一化对角线移动
        const len = Math.sqrt(x * x + y * y);
        if (len > 0) {
            x /= len;
            y /= len;
        }
        return { x, y };
    }

    /**
     * 每帧重置瞬时输入（如鼠标移动量）
     */
    resetFrameInput() {
        this.mouse.movementX = 0;
        this.mouse.movementY = 0;
    }
}
