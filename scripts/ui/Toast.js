/**
 * Toast.js - Toast通知系统
 * 无畏契约风格的通知提示，支持成功/警告/错误/普通四种类型
 */
export class Toast {
    constructor() {
        this.container = document.getElementById('toast-container');
        this.toasts = [];
        this.maxToasts = 4;
        this.defaultDuration = 3000;
    }

    /**
     * 显示Toast通知
     * @param {string} title - 标题
     * @param {string} desc - 描述（可选）
     * @param {string} type - 类型：default|success|warning|error
     * @param {number} duration - 持续时间(ms)
     */
    show(title, desc = '', type = 'default', duration = this.defaultDuration) {
        if (!this.container) return;

        // 超过最大数量时移除最早的
        if (this.toasts.length >= this.maxToasts) {
            this._remove(this.toasts[0]);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-title">${title}</div>
            ${desc ? `<div class="toast-desc">${desc}</div>` : ''}
        `;
        this.container.appendChild(toast);

        const toastObj = { element: toast, timer: null };
        this.toasts.push(toastObj);

        toastObj.timer = setTimeout(() => this._remove(toastObj), duration);
    }

    success(title, desc = '', duration) {
        this.show(title, desc, 'success', duration);
    }

    warning(title, desc = '', duration) {
        this.show(title, desc, 'warning', duration);
    }

    error(title, desc = '', duration) {
        this.show(title, desc, 'error', duration || 4000);
    }

    _remove(toastObj) {
        if (!toastObj || !toastObj.element) return;
        clearTimeout(toastObj.timer);
        const idx = this.toasts.indexOf(toastObj);
        if (idx > -1) this.toasts.splice(idx, 1);

        const el = toastObj.element;
        if (!el.parentNode) return;
        el.classList.add('hide');
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }

    clear() {
        this.toasts.forEach(t => this._remove(t));
    }
}
