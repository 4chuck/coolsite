// Simple toast notification system
export function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `custom-toast toast-${type}`;
    
    toast.innerHTML = `
        <div class="toast-content">${message}</div>
        <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Handle close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        dismissToast(toast);
    });

    // Auto dismiss after 4 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            dismissToast(toast);
        }
    }, 4000);
}

function dismissToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300); // match transition duration
}

export function showError(msg) {
    showNotification(msg, 'error');
}

export function showSuccess(msg) {
    showNotification(msg, 'success');
}
