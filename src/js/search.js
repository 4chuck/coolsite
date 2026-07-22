/**
 * Tetron Centralized Search Engine
 * Manages keyword-based navigation across the entire platform.
 */

export function initSearch() {
    const searchModal = document.getElementById('id03');
    const searchInput = document.getElementById('global-search-input');
    const searchBtn = document.getElementById('open-search-btn');
    const closeBtn = document.querySelector('#id03 .close');

    if (!searchModal) return;

    // Open Modal
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            searchModal.style.display = 'flex';
            if (searchInput) {
                searchInput.value = '';
                setTimeout(() => searchInput.focus(), 100);
            }
        });
    }

    // Close Modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            searchModal.style.display = 'none';
        });
    }

    // Advanced Keyword Mapping
    const keywordMap = {
        'codepen': '/firebase/home/codepen/index.html',
        'labs': '/firebase/home/codepen/index.html',
        'camera': '/tools/camera.html',
        'studio': '/tools/camera.html',
        'sketch': '/tools/blackboard.html',
        'drawing': '/tools/blackboard.html',
        'blackboard': '/tools/blackboard.html',
        'vault': '/tools/AES.html',
        'encryption': '/tools/AES.html',
        'secure': '/tools/AES.html',
        'editor': '/tools/img_edit.html',
        'studioeditor': '/tools/img_edit.html',
        'gallery': '/gallery/DOG.html',
        'dog': '/gallery/DOG.html',
        'canine': '/gallery/DOG.html',
        'cat': '/gallery/cat.html',
        'feline': '/gallery/cat.html',
        'calci': '/tools/calci.html',
        'calculator': '/tools/calci.html',
        'ironman': '/gallery/ironman.html',
        'armor': '/gallery/ironman.html',
        'sea': '/gallery/sea.html',
        'nature': '/gallery/sea.html',
        'dashboard': '/dashboard/index.html',
        'profile': '/dashboard/index.html',
        'settings': '/dashboard/settings.html',
        'admin': '/dashboard/admin.html'
    };

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const term = searchInput.value.toLowerCase().trim().replace(/\s+/g, '');
                
                if (keywordMap[term]) {
                    searchModal.style.display = 'none';
                    
                    // Determine the root prefix dynamically to support deployment inside subdirectories/GitHub Pages/file protocol
                    const pathname = window.location.pathname.toLowerCase();
                    let rootPrefix = './';
                    
                    if (pathname.includes('/dashboard/') || pathname.includes('/login/') || pathname.includes('/tools/') || pathname.includes('/gallery/')) {
                        rootPrefix = '../';
                    } else if (pathname.includes('/firebase/home/cyborg/')) {
                        rootPrefix = '../../../';
                    } else if (pathname.includes('/firebase/home/')) {
                        rootPrefix = '../../';
                    } else if (pathname.includes('/firebase/')) {
                        rootPrefix = '../';
                    }
                    
                    // Strip leading slash from mapped path and prepend rootPrefix
                    const targetPath = keywordMap[term].startsWith('/') ? keywordMap[term].substring(1) : keywordMap[term];
                    window.location.href = rootPrefix + targetPath;
                } else {
                    alert('No exact match found. Keywords: dog, cat, sketch, vault, editor, etc.');
                }
            }
        });
    }
    
    // Close modal on outside click
    window.addEventListener('click', (event) => {
        if (event.target == searchModal) {
            searchModal.style.display = "none";
        }
    });
}

// Auto-init for standard inclusion
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
} else {
    initSearch();
}
