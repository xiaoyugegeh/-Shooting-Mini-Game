/**
 * main.js - 程序入口
 * 初始化游戏并绑定UI事件
 */
import { Game } from './core/Game.js';

// 创建游戏实例
const game = new Game();

// 启动游戏
async function bootstrap() {
    try {
        await game.init();

        // 训练模式按钮
        document.getElementById('start-training-btn').addEventListener('click', () => {
            game.start();
        });

        // 怪兽模式按钮
        document.getElementById('start-monster-btn').addEventListener('click', () => {
            game.startMonsterMode();
        });

        // 人机对决模式按钮
        document.getElementById('start-bot-btn').addEventListener('click', () => {
            game.startBotMode();
        });

        // 皮肤库按钮（主菜单）
        document.getElementById('open-skin-select-btn').addEventListener('click', () => {
            game.skinSelect.show();
        });

        // 灵敏度设置按钮
        document.querySelectorAll('.sens-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sens-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                game.cameraController.setSensitivity(btn.dataset.sens);
            });
        });

        // 设置面板按钮（主菜单）
        document.getElementById('open-settings-btn').addEventListener('click', () => {
            game.settingsPanel.show();
        });

        // 武器选择按钮（主菜单）
        document.getElementById('open-weapon-select-btn').addEventListener('click', () => {
            game.weaponSelect.show();
        });

        // 训练模式重新开始按钮
        document.getElementById('restart-button').addEventListener('click', () => {
            game.restart();
        });

        // 怪兽模式重新开始按钮
        document.getElementById('monster-restart-button').addEventListener('click', () => {
            game.restart();
        });

        // 人机模式重新开始按钮
        document.getElementById('bot-restart-button').addEventListener('click', () => {
            game.restart();
        });

        // 训练模式返回菜单按钮
        document.getElementById('training-back-menu-button').addEventListener('click', () => {
            game.returnToMenu();
        });

        // 怪兽模式返回菜单按钮
        document.getElementById('back-to-menu-button').addEventListener('click', () => {
            game.returnToMenu();
        });

        // 人机模式返回菜单按钮
        document.getElementById('bot-back-button').addEventListener('click', () => {
            game.returnToMenu();
        });

        // 点击暂停界面恢复游戏
        document.getElementById('pause-hint').addEventListener('click', () => {
            game.input.requestPointerLock();
        });

        // 点击画布恢复游戏 (从暂停状态)
        document.getElementById('game-canvas').addEventListener('click', () => {
            if (game.state.phase === 'paused') {
                game.input.requestPointerLock();
            }
        });

        // 防止页面失焦时游戏继续运行
        window.addEventListener('blur', () => {
            if (game.state.phase === 'playing') {
                game._pause();
            }
        });

        // 欢迎Toast
        setTimeout(() => {
            if (game.toast) {
                game.toast.show('欢迎来到训练场', '选择模式开始训练 · 按 TAB 查看计分板', 'success', 4000);
            }
        }, 1000);

        console.log('%c VALORANT TRAINING GROUND ', 'background: #FF4655; color: #ECE8E1; font-weight: bold; padding: 4px 8px;');
        console.log('%c 战术训练场已就绪 ', 'color: #FF4655; font-size: 12px;');
    } catch (error) {
        console.error('游戏初始化失败:', error);
        document.getElementById('loading-status').textContent = '加载失败: ' + error.message;
    }
}

// 启动
bootstrap();
