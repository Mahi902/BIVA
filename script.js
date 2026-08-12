/**
 * BIVA — Better Immersive Vanilla Addons Platform Engine
 */

(function () {
    'use strict';

    const CONFIG = {
        DATA_URL: 'https://mahi902.github.io/BIVA/packs.json',
        LOCAL_FALLBACK_URL: './packs.json',
        DEBOUNCE_MS: 200
    };

    const SchemaAdapter = {
        getId: item => item.id || item.uuid || item.slug || '',
        getName: item => item.name || item.title || 'Untitled Addon',
        getDescription: item => item.description || item.summary || 'No description provided.',
        getCreator: item => item.creator || item.author || 'Unknown Creator',
        getCreatorUrl: item => item.creatorUrl || item.creator_url || item.authorUrl || '',
        getCategory: item => item.category || 'Utility',
        getType: item => item.type || item.fileType || 'mcaddon',
        getVersion: item => item.version || '1.0.0',
        getMcVersion: item => item.mcVersion || item.minecraft_version || '1.20+',
        getRating: item => parseFloat(item.rating || 0),
        getRatingUrl: item => item.ratingUrl || item.rating_url || '',
        getDownloadUrl: item => item.download || item.downloadUrl || '#',
        getThumbnail: item => item.thumbnail || item.icon || item.image || '',
        getScreenshots: item => Array.isArray(item.screenshots) ? item.screenshots : [],
        getChangelog: item => item.changelog || '',
        getTags: item => Array.isArray(item.tags) ? item.tags : [],
        isFeatured: item => Boolean(item.featured || item.is_featured),
        getUpdatedDate: item => item.updatedDate || item.releaseDate || ''
    };

    const state = {
        packs: [],
        categories: new Set(),
        searchQuery: '',
        selectedCategory: 'All',
        sortBy: 'recommended',
        activeView: 'browse',
        activePackId: null,
        loading: true,
        error: null,
        theme: localStorage.getItem('biva_theme') || 'dark'
    };

    const DOM = {};

    function cacheDOM() {
        DOM.appView = document.getElementById('app-view');
        DOM.navSearchInput = document.getElementById('nav-search-input');
        DOM.navSearchClear = document.getElementById('nav-search-clear');
        DOM.themeToggle = document.getElementById('theme-toggle');
        DOM.mobileToggle = document.getElementById('mobile-toggle');
        DOM.navMenu = document.getElementById('nav-menu');
        DOM.lightbox = document.getElementById('lightbox');
        DOM.lightboxImg = document.getElementById('lightbox-img');
        DOM.lightboxCaption = document.getElementById('lightbox-caption');
        DOM.lightboxClose = document.getElementById('lightbox-close');
        DOM.lightboxBackdrop = document.getElementById('lightbox-backdrop');
        DOM.toastContainer = document.getElementById('toast-container');
    }

    function sanitizeText(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        DOM.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }

    async function fetchPacks() {
        state.loading = true;
        renderLoadingState();

        try {
            let res;
            try {
                res = await fetch(CONFIG.DATA_URL, { cache: 'no-cache' });
                if (!res.ok) throw new Error();
            } catch {
                res = await fetch(CONFIG.LOCAL_FALLBACK_URL);
            }

            if (!res.ok) throw new Error('HTTP failure');
            const data = await res.json();

            state.packs = data;
            state.categories.clear();
            state.categories.add('All');
            data.forEach(p => {
                const cat = SchemaAdapter.getCategory(p);
                if (cat) state.categories.add(cat);
            });

            state.loading = false;
            handleRoute();
        } catch (err) {
            state.loading = false;
            state.error = 'Couldn\'t load the addon library. Please check your connection.';
            renderErrorState();
        }
    }

    function handleRoute() {
        const hash = window.location.hash || '#/';
        DOM.navMenu.classList.remove('mobile-open');

        if (hash.startsWith('#/pack/')) {
            const packId = hash.replace('#/pack/', '').trim();
            state.activeView = 'pack';
            renderPackDetailView(packId);
        } else if (hash.startsWith('#/categories')) {
            state.activeView = 'browse';
            renderBrowseView(true);
        } else if (hash.startsWith('#/about')) {
            state.activeView = 'about';
            renderAboutView();
        } else {
            state.activeView = 'browse';
            renderBrowseView();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function getFilteredPacks() {
        return state.packs.filter(pack => {
            const query = state.searchQuery.toLowerCase().trim();
            const categoryMatch = (state.selectedCategory === 'All') || 
                (SchemaAdapter.getCategory(pack).toLowerCase() === state.selectedCategory.toLowerCase());

            if (!categoryMatch) return false;
            if (!query) return true;

            const name = SchemaAdapter.getName(pack).toLowerCase();
            const desc = SchemaAdapter.getDescription(pack).toLowerCase();
            const creator = SchemaAdapter.getCreator(pack).toLowerCase();
            const cat = SchemaAdapter.getCategory(pack).toLowerCase();
            const tags = SchemaAdapter.getTags(pack).join(' ').toLowerCase();

            return name.includes(query) || desc.includes(query) || creator.includes(query) || cat.includes(query) || tags.includes(query);
        }).sort((a, b) => {
            if (state.sortBy === 'newest') return new Date(SchemaAdapter.getUpdatedDate(b) || 0) - new Date(SchemaAdapter.getUpdatedDate(a) || 0);
            if (state.sortBy === 'rating') return SchemaAdapter.getRating(b) - SchemaAdapter.getRating(a);
            if (state.sortBy === 'alphabetical') return SchemaAdapter.getName(a).localeCompare(SchemaAdapter.getName(b));
            return (SchemaAdapter.isFeatured(b) ? 1 : 0) - (SchemaAdapter.isFeatured(a) ? 1 : 0);
        });
    }

    function renderLoadingState() {
        DOM.appView.innerHTML = `
            <div class="container" style="text-align:center; padding: 64px 24px;">
                <div class="mc-panel" style="padding: 48px; max-width: 500px; margin: 0 auto;">
                    <h2 style="font-family: var(--font-pixel); color: var(--accent-gold); font-size: 1rem; margin-bottom: 12px;">LOADING ADDONS...</h2>
                    <p style="color: var(--text-muted);">Fetching the latest Minecraft Bedrock library.</p>
                </div>
            </div>
        `;
    }

    function renderErrorState() {
        DOM.appView.innerHTML = `
            <div class="container" style="text-align:center; padding: 64px 24px;">
                <div class="mc-panel" style="padding: 48px; max-width: 500px; margin: 0 auto;">
                    <h2 style="font-family: var(--font-pixel); color: #ff5555; font-size: 1rem; margin-bottom: 12px;">CONNECTION ERROR</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">${sanitizeText(state.error)}</p>
                    <button type="button" class="mc-btn mc-btn-green" id="retry-btn">Retry Connection</button>
                </div>
            </div>
        `;
        document.getElementById('retry-btn')?.addEventListener('click', fetchPacks);
    }

    function renderBrowseView(focusCategories = false) {
        if (state.loading) return;

        const filteredPacks = getFilteredPacks();

        const html = `
            <!-- Full-Width Cover Banner Hero Screen -->
            <section class="hero-cover-container">
                <img src="https://mahi902.github.io/BIVA/assets/76883807-b5e2-4837-bdf4-e5858cf838c3.png" alt="BIVA Banner Cover" class="hero-cover-img">
                <div class="hero-sub-bar">
                    <div class="hero-sub-content">
                        <span class="hero-motto-text">Enhancing Minecraft, without losing the vanilla experience.</span>
                        <div class="hero-actions">
                            <a href="#browse-section" class="mc-btn mc-btn-green">Browse Addons</a>
                            <a href="#/about" class="mc-btn mc-btn-stone">About Philosophy</a>
                        </div>
                    </div>
                </div>
            </section>

            <div class="container" id="browse-section">
                <div class="browse-toolbar">
                    <div class="category-chips">
                        ${Array.from(state.categories).map(cat => `
                            <button type="button" class="chip ${state.selectedCategory === cat ? 'active' : ''}" data-category="${sanitizeText(cat)}">
                                ${sanitizeText(cat)}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="browse-controls">
                    <span style="font-weight: 700; color: var(--text-secondary);">
                        Showing <strong>${filteredPacks.length}</strong> ${filteredPacks.length === 1 ? 'addon' : 'addons'}
                    </span>
                    <div>
                        <select id="sort-select" class="sort-select">
                            <option value="recommended" ${state.sortBy === 'recommended' ? 'selected' : ''}>Recommended</option>
                            <option value="newest" ${state.sortBy === 'newest' ? 'selected' : ''}>Recently Updated</option>
                            <option value="rating" ${state.sortBy === 'rating' ? 'selected' : ''}>Highest Rated</option>
                            <option value="alphabetical" ${state.sortBy === 'alphabetical' ? 'selected' : ''}>Alphabetical</option>
                        </select>
                    </div>
                </div>

                ${filteredPacks.length > 0 ? `
                    <div class="addon-grid">
                        ${filteredPacks.map(pack => renderAddonCard(pack)).join('')}
                    </div>
                ` : `
                    <div class="mc-panel" style="text-align:center; padding: 48px;">
                        <h2 style="font-family: var(--font-pixel); color: var(--accent-gold); margin-bottom:12px;">NO ADDONS FOUND</h2>
                        <p style="color: var(--text-secondary);">Try clearing filters or changing your search terms.</p>
                    </div>
                `}
            </div>
        `;

        DOM.appView.innerHTML = html;
        bindBrowseEvents();

        if (focusCategories) {
            document.querySelector('.category-chips')?.scrollIntoView({ behavior: 'smooth' });
        }
    }

    function renderAddonCard(pack) {
        const id = SchemaAdapter.getId(pack);
        const name = SchemaAdapter.getName(pack);
        const creator = SchemaAdapter.getCreator(pack);
        const desc = SchemaAdapter.getDescription(pack);
        const thumb = SchemaAdapter.getThumbnail(pack);
        const rating = SchemaAdapter.getRating(pack);
        const cat = SchemaAdapter.getCategory(pack);
        const type = SchemaAdapter.getType(pack);

        return `
            <article class="addon-card" onclick="window.location.hash='#/pack/${id}'">
                <div class="card-media">
                    <img src="${sanitizeText(thumb)}" alt="${sanitizeText(name)}" loading="lazy" onerror="this.src='https://mahi902.github.io/BIVA/assets/76883807-b5e2-4837-bdf4-e5858cf838c3.png'">
                </div>
                <div class="card-body">
                    <div>
                        <h3 class="addon-title">${sanitizeText(name)}</h3>
                        <span class="addon-creator">by ${sanitizeText(creator)}</span>
                    </div>
                    <p class="addon-desc">${sanitizeText(desc)}</p>
                    <div class="card-footer-meta">
                        <span class="rating-badge">Rating: ${rating > 0 ? rating.toFixed(1) : 'N/A'}</span>
                        <div style="display:flex; gap: 4px;">
                            <span class="tag">${sanitizeText(cat)}</span>
                            <span class="tag">.${sanitizeText(type)}</span>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    function renderPackDetailView(packId) {
        const pack = state.packs.find(p => SchemaAdapter.getId(p) === packId);

        if (!pack) {
            DOM.appView.innerHTML = `
                <div class="container" style="text-align:center; padding: 64px 24px;">
                    <div class="mc-panel" style="padding: 48px;">
                        <h2 style="font-family: var(--font-pixel); color: var(--accent-gold); margin-bottom:12px;">ADDON NOT FOUND</h2>
                        <a href="#/browse" class="mc-btn mc-btn-green" style="margin-top:16px;">Return to Discover</a>
                    </div>
                </div>
            `;
            return;
        }

        const name = SchemaAdapter.getName(pack);
        const creator = SchemaAdapter.getCreator(pack);
        const desc = SchemaAdapter.getDescription(pack);
        const thumb = SchemaAdapter.getThumbnail(pack);
        const version = SchemaAdapter.getVersion(pack);
        const mcVersion = SchemaAdapter.getMcVersion(pack);
        const rating = SchemaAdapter.getRating(pack);
        const ratingUrl = SchemaAdapter.getRatingUrl(pack);
        const downloadUrl = SchemaAdapter.getDownloadUrl(pack);
        const fileType = SchemaAdapter.getType(pack);
        const cat = SchemaAdapter.getCategory(pack);
        const screenshots = SchemaAdapter.getScreenshots(pack);

        const html = `
            <div class="detail-container">
                <div style="margin-bottom: 24px;">
                    <a href="#/browse" class="mc-btn mc-btn-stone">&larr; Back to Addons</a>
                </div>

                <header class="detail-header mc-panel">
                    <img src="${sanitizeText(thumb)}" alt="${sanitizeText(name)}" class="detail-icon" onerror="this.src='https://mahi902.github.io/BIVA/assets/76883807-b5e2-4837-bdf4-e5858cf838c3.png'">
                    <div>
                        <h1>${sanitizeText(name)}</h1>
                        <p style="color: var(--text-secondary);">by <strong>${sanitizeText(creator)}</strong> • Rating: ${rating > 0 ? rating.toFixed(1) : 'Unrated'} • <span class="tag">${sanitizeText(cat)}</span></p>
                    </div>
                    <a href="${sanitizeText(downloadUrl)}" class="mc-btn mc-btn-green" download target="_blank" rel="noopener">
                        Download .${sanitizeText(fileType)}
                    </a>
                </header>

                <div class="detail-body-layout">
                    <main>
                        <section class="detail-section mc-panel">
                            <h2 class="detail-section-title">About this Addon</h2>
                            <p style="white-space: pre-line; color: var(--text-secondary);">${sanitizeText(desc)}</p>
                        </section>

                        ${screenshots.length > 0 ? `
                            <section class="detail-section mc-panel">
                                <h2 class="detail-section-title">Screenshots</h2>
                                <div class="gallery-grid">
                                    ${screenshots.map((img, idx) => `
                                        <div class="gallery-item" data-img="${sanitizeText(img)}">
                                            <img src="${sanitizeText(img)}" alt="Screenshot ${idx + 1}">
                                        </div>
                                    `).join('')}
                                </div>
                            </section>
                        ` : ''}

                        <section class="detail-section mc-panel">
                            <h2 class="detail-section-title">Rate this Addon</h2>
                            ${ratingUrl ? `
                                <div class="rating-iframe-wrapper">
                                    <iframe src="${sanitizeText(ratingUrl)}" class="rating-iframe" title="Rate ${sanitizeText(name)}" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
                                </div>
                            ` : `<p style="color: var(--text-muted);">Ratings aren't available for this addon yet.</p>`}
                        </section>
                    </main>

                    <aside>
                        <div class="mc-panel" style="padding: 24px;">
                            <div style="margin-bottom: 20px; text-align:center;">
                                <a href="${sanitizeText(downloadUrl)}" class="mc-btn mc-btn-green" style="width: 100%;" download target="_blank" rel="noopener">
                                    Download .${sanitizeText(fileType)}
                                </a>
                                <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px;">After downloading, open the file with Minecraft to import it.</p>
                            </div>

                            <div style="font-size: 0.85rem; display: flex; flex-direction: column; gap: 8px;">
                                <div style="display:flex; justify-content:space-between;"><span>Version:</span><strong>${sanitizeText(version)}</strong></div>
                                <div style="display:flex; justify-content:space-between;"><span>Minecraft:</span><strong>${sanitizeText(mcVersion)}</strong></div>
                                <div style="display:flex; justify-content:space-between;"><span>File Type:</span><strong>.${sanitizeText(fileType)}</strong></div>
                            </div>

                            <button type="button" class="mc-btn mc-btn-stone" id="share-btn" style="width: 100%; margin-top: 20px;">
                                Share Link
                            </button>
                        </div>
                    </aside>
                </div>
            </div>
        `;

        DOM.appView.innerHTML = html;

        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                DOM.lightboxImg.src = item.dataset.img;
                DOM.lightbox.classList.add('active');
            });
        });

        document.getElementById('share-btn')?.addEventListener('click', () => {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
                showToast(`Copied link to ${name}!`);
            }
        });
    }

    function renderAboutView() {
        DOM.appView.innerHTML = `
            <div class="container" style="max-width: 800px;">
                <section class="mc-panel" style="padding: 32px; margin-top: 32px;">
                    <img src="https://mahi902.github.io/BIVA/assets/BIVA-8-12-2026.png" alt="BIVA Logo" style="height:48px; margin:0 auto 16px;">
                    <h2 class="detail-section-title" style="text-align:center; font-size:1.1rem;">OUR PHILOSOPHY</h2>
                    <p style="color: var(--text-secondary); line-height: 1.8; margin-bottom: 16px;">
                        BIVA is a platform dedicated to Bedrock Edition addons that complement standard Minecraft gameplay without altering its iconic aesthetic or survival identity.
                    </p>
                </section>
            </div>
        `;
    }

    function bindBrowseEvents() {
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                state.sortBy = e.target.value;
                renderBrowseView();
            });
        }

        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                state.selectedCategory = e.currentTarget.dataset.category;
                renderBrowseView();
            });
        });
    }

    function initGlobalEvents() {
        DOM.navSearchInput.addEventListener('input', debounce((e) => {
            state.searchQuery = e.target.value;
            DOM.navSearchClear.classList.toggle('hidden', !e.target.value);
            if (state.activeView !== 'browse') {
                window.location.hash = '#/browse';
            } else {
                renderBrowseView();
            }
        }, CONFIG.DEBOUNCE_MS));

        DOM.navSearchClear.addEventListener('click', () => {
            state.searchQuery = '';
            DOM.navSearchInput.value = '';
            DOM.navSearchClear.classList.add('hidden');
            if (state.activeView === 'browse') renderBrowseView();
        });

        DOM.themeToggle.addEventListener('click', () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', state.theme);
            localStorage.setItem('biva_theme', state.theme);
        });

        DOM.mobileToggle.addEventListener('click', () => {
            DOM.navMenu.classList.toggle('mobile-open');
        });

        DOM.lightboxClose.addEventListener('click', () => DOM.lightbox.classList.remove('active'));
        DOM.lightboxBackdrop.addEventListener('click', () => DOM.lightbox.classList.remove('active'));

        window.addEventListener('hashchange', handleRoute);
    }

    function init() {
        cacheDOM();
        document.documentElement.setAttribute('data-theme', state.theme);
        initGlobalEvents();
        fetchPacks();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
