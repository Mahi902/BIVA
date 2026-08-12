/**
 * BIVA — Better Immersive Vanilla Addons
 * Modern Static Single Page Application Engine
 */

(function () {
    'use strict';

    // --- Configuration & Flexible Schema Mapping ---
    const CONFIG = {
        DATA_URL: 'https://mahi902.github.io/BIVA/packs.json',
        LOCAL_FALLBACK_URL: './packs.json',
        DEBOUNCE_MS: 200,
        ITEMS_PER_PAGE: 24
    };

    /**
     * Flexible Property Adapter.
     * Prevents site breakdown if packs.json field keys change in future schema updates.
     */
    const SchemaAdapter = {
        getId: item => item.id || item.uuid || item.slug || '',
        getName: item => item.name || item.title || 'Untitled Addon',
        getDescription: item => item.description || item.summary || 'No description provided.',
        getCreator: item => item.creator || item.author || 'Unknown Creator',
        getCreatorUrl: item => item.creatorUrl || item.creator_url || item.authorUrl || '',
        getCategory: item => item.category || 'Utility',
        getType: item => item.type || item.fileType || 'mcaddon',
        getVersion: item => item.version || '1.0.0',
        getMcVersion: item => item.mcVersion || item.minecraft_version || item.mc_version || '1.20+',
        getRating: item => parseFloat(item.rating || item.stars || 0),
        getRatingUrl: item => item.ratingUrl || item.rating_url || '',
        getDownloadUrl: item => item.download || item.downloadUrl || item.download_url || '#',
        getThumbnail: item => item.thumbnail || item.icon || item.image || '',
        getScreenshots: item => Array.isArray(item.screenshots) ? item.screenshots : (item.gallery || []),
        getChangelog: item => item.changelog || '',
        getTags: item => Array.isArray(item.tags) ? item.tags : [],
        isFeatured: item => Boolean(item.featured || item.is_featured),
        getUpdatedDate: item => item.updatedDate || item.updated_at || item.releaseDate || ''
    };

    // --- Application State ---
    const state = {
        packs: [],
        categories: new Set(),
        searchQuery: '',
        selectedCategory: 'All',
        sortBy: 'recommended',
        activeView: 'browse', // 'browse', 'pack', 'about'
        activePackId: null,
        loading: true,
        error: null,
        theme: localStorage.getItem('biva_theme') || 'dark'
    };

    // --- DOM Cache ---
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

    // --- Helper Utility Functions ---
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

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        DOM.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // --- Data Fetching Engine ---
    async function fetchPacks() {
        state.loading = true;
        state.error = null;
        renderLoadingState();

        try {
            let response;
            try {
                response = await fetch(CONFIG.DATA_URL, { cache: 'no-cache' });
                if (!response.ok) throw new Error('Remote JSON load failed');
            } catch (err) {
                // Fallback to local file if GitHub Pages URL fails during offline/dev
                response = await fetch(CONFIG.LOCAL_FALLBACK_URL);
            }

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                throw new Error('Invalid data structure received from database.');
            }

            state.packs = data;
            
            // Dynamically collect unique categories
            state.categories.clear();
            state.categories.add('All');
            data.forEach(pack => {
                const cat = SchemaAdapter.getCategory(pack);
                if (cat) state.categories.add(cat);
            });

            state.loading = false;
            handleRoute(); // Render current active route
        } catch (error) {
            console.error('BIVA Fetch Error:', error);
            state.loading = false;
            state.error = 'Couldn\'t load the addon library. Please check your connection.';
            renderErrorState();
        }
    }

    // --- Router & Hash Handling ---
    function handleRoute() {
        const hash = window.location.hash || '#/';
        
        // Reset Mobile Menu if open
        DOM.navMenu.classList.remove('mobile-open');

        if (hash.startsWith('#/pack/')) {
            const packId = hash.replace('#/pack/', '').trim();
            state.activeView = 'pack';
            state.activePackId = packId;
            renderPackDetailView(packId);
        } else if (hash.startsWith('#/categories')) {
            state.activeView = 'browse';
            renderBrowseView(true); // Focus categories
        } else if (hash.startsWith('#/about')) {
            state.activeView = 'about';
            renderAboutView();
        } else { // Default '#/' or '#/browse'
            state.activeView = 'browse';
            renderBrowseView();
        }

        updateActiveNavLinks(hash);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateActiveNavLinks(hash) {
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href === hash || (hash === '#/' && href === '#/browse')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // --- Search & Filtering Processing ---
    function getFilteredPacks() {
        return state.packs.filter(pack => {
            const query = state.searchQuery.toLowerCase().trim();
            
            // Category Match
            const categoryMatch = (state.selectedCategory === 'All') || 
                (SchemaAdapter.getCategory(pack).toLowerCase() === state.selectedCategory.toLowerCase());

            if (!categoryMatch) return false;
            if (!query) return true;

            // Multi-field Search Match
            const name = SchemaAdapter.getName(pack).toLowerCase();
            const desc = SchemaAdapter.getDescription(pack).toLowerCase();
            const creator = SchemaAdapter.getCreator(pack).toLowerCase();
            const cat = SchemaAdapter.getCategory(pack).toLowerCase();
            const type = SchemaAdapter.getType(pack).toLowerCase();
            const tags = SchemaAdapter.getTags(pack).join(' ').toLowerCase();
            const mcVer = SchemaAdapter.getMcVersion(pack).toLowerCase();

            return name.includes(query) || 
                   desc.includes(query) || 
                   creator.includes(query) || 
                   cat.includes(query) || 
                   type.includes(query) || 
                   tags.includes(query) ||
                   mcVer.includes(query);
        }).sort((a, b) => {
            if (state.sortBy === 'newest') {
                return new Date(SchemaAdapter.getUpdatedDate(b) || 0) - new Date(SchemaAdapter.getUpdatedDate(a) || 0);
            } else if (state.sortBy === 'rating') {
                return SchemaAdapter.getRating(b) - SchemaAdapter.getRating(a);
            } else if (state.sortBy === 'alphabetical') {
                return SchemaAdapter.getName(a).localeCompare(SchemaAdapter.getName(b));
            }
            // Recommended default: Featured first, then rating
            return (SchemaAdapter.isFeatured(b) ? 1 : 0) - (SchemaAdapter.isFeatured(a) ? 1 : 0);
        });
    }

    // --- View Renderers ---

    // 1. Loading View
    function renderLoadingState() {
        DOM.appView.innerHTML = `
            <div class="container">
                <div class="empty-state">
                    <div class="pixel-block grass" style="width: 40px; height: 40px; margin-bottom: 16px;"></div>
                    <h2 class="empty-title">Loading Addon Library...</h2>
                    <p class="empty-desc">Fetching the latest vanilla-friendly Bedrock creations.</p>
                </div>
                <div class="addon-grid">
                    ${Array(8).fill(0).map(() => `<div class="skeleton skeleton-card"></div>`).join('')}
                </div>
            </div>
        `;
    }

    // 2. Error View
    function renderErrorState() {
        DOM.appView.innerHTML = `
            <div class="container">
                <div class="error-state">
                    <div class="empty-icon">⚠️</div>
                    <h2 class="empty-title">Connection Failure</h2>
                    <p class="empty-desc">${sanitizeText(state.error)}</p>
                    <button type="button" class="btn btn-primary" id="retry-btn">
                        ↻ Retry Connection
                    </button>
                </div>
            </div>
        `;
        document.getElementById('retry-btn')?.addEventListener('click', fetchPacks);
    }

    // 3. Main Browse / Homepage View
    function renderBrowseView(focusCategories = false) {
        if (state.loading) return;

        const filteredPacks = getFilteredPacks();
        const featuredPacks = state.packs.filter(p => SchemaAdapter.isFeatured(p));

        const html = `
            <!-- Hero Section -->
            <section class="hero">
                <div class="hero-content">
                    <span class="hero-badge">🌿 100% Minecraft Bedrock</span>
                    <h1 class="hero-title">Better Immersive Vanilla Addons</h1>
                    <p class="hero-motto">“Enhancing Minecraft, without losing the vanilla experience.”</p>
                    <div class="hero-actions">
                        <a href="#browse-section" class="btn btn-primary">Browse Addons</a>
                        <a href="#/about" class="btn btn-secondary">Learn Philosophy</a>
                    </div>
                </div>
            </section>

            <div class="container" id="browse-section">
                <!-- Search & Filter Controls -->
                <div class="browse-toolbar">
                    <div class="search-bar-hero">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input type="text" id="main-search-input" placeholder="Search addons, worlds, creators, tags..." value="${sanitizeText(state.searchQuery)}">
                        ${state.searchQuery ? `<button type="button" class="clear-btn" id="main-search-clear">&times;</button>` : ''}
                    </div>

                    <!-- Category Chips -->
                    <div class="category-chips" role="tablist" aria-label="Addon Categories">
                        ${Array.from(state.categories).map(cat => `
                            <button type="button" class="chip ${state.selectedCategory === cat ? 'active' : ''}" data-category="${sanitizeText(cat)}">
                                ${sanitizeText(cat)}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Featured Addons Section (Shown when no search is active) -->
                ${(!state.searchQuery && state.selectedCategory === 'All' && featuredPacks.length > 0) ? `
                    <section class="featured-section">
                        <div class="section-title-wrapper">
                            <span class="pixel-block grass"></span>
                            <h2 class="section-title">Featured Addons</h2>
                        </div>
                        <div class="featured-grid">
                            ${featuredPacks.map(pack => renderFeaturedCard(pack)).join('')}
                        </div>
                    </section>
                ` : ''}

                <!-- Browse Header -->
                <div class="browse-controls">
                    <span class="results-count">
                        Showing <strong>${filteredPacks.length}</strong> ${filteredPacks.length === 1 ? 'addon' : 'addons'}
                    </span>
                    <div class="sort-wrapper">
                        <label for="sort-select" class="meta-label">Sort by:</label>
                        <select id="sort-select" class="sort-select">
                            <option value="recommended" ${state.sortBy === 'recommended' ? 'selected' : ''}>Recommended</option>
                            <option value="newest" ${state.sortBy === 'newest' ? 'selected' : ''}>Recently Updated</option>
                            <option value="rating" ${state.sortBy === 'rating' ? 'selected' : ''}>Highest Rated</option>
                            <option value="alphabetical" ${state.sortBy === 'alphabetical' ? 'selected' : ''}>Alphabetical</option>
                        </select>
                    </div>
                </div>

                <!-- Main Addon Cards Grid -->
                ${filteredPacks.length > 0 ? `
                    <div class="addon-grid">
                        ${filteredPacks.map(pack => renderAddonCard(pack)).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-icon">🔍</div>
                        <h2 class="empty-title">No Addons Found</h2>
                        <p class="empty-desc">We couldn't find anything matching "${sanitizeText(state.searchQuery)}". Try clearing filters or searching for another term.</p>
                        <button type="button" class="btn btn-secondary" id="reset-search-btn">Clear All Filters</button>
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

    // Render Featured Card
    function renderFeaturedCard(pack) {
        const id = SchemaAdapter.getId(pack);
        const name = SchemaAdapter.getName(pack);
        const desc = SchemaAdapter.getDescription(pack);
        const thumb = SchemaAdapter.getThumbnail(pack);
        const cat = SchemaAdapter.getCategory(pack);

        return `
            <div class="featured-card" onclick="window.location.hash='#/pack/${id}'">
                <span class="featured-badge-tag">Featured</span>
                <img src="${sanitizeText(thumb)}" alt="${sanitizeText(name)}" class="featured-banner" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 fill=%22%23202923%22><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23a3b8aa%22>No Preview</text></svg>'">
                <div class="featured-content">
                    <h3 class="addon-title" style="font-size:1.3rem; margin-bottom:6px;">${sanitizeText(name)}</h3>
                    <p class="addon-desc" style="-webkit-line-clamp: 3; margin-bottom:16px;">${sanitizeText(desc)}</p>
                    <div class="card-footer-meta">
                        <span class="tag">${sanitizeText(cat)}</span>
                        <span class="btn btn-secondary" style="padding:4px 12px; font-size:0.8rem;">Explore &rarr;</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Render Standard Addon Card
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
            <article class="addon-card" onclick="window.location.hash='#/pack/${id}'" tabIndex="0" aria-label="${sanitizeText(name)} by ${sanitizeText(creator)}">
                <div class="card-media">
                    <img src="${sanitizeText(thumb)}" alt="${sanitizeText(name)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 fill=%22%23202923%22><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23a3b8aa%22>No Preview</text></svg>'">
                </div>
                <div class="card-body">
                    <div class="card-header-row">
                        <div>
                            <h3 class="addon-title">${sanitizeText(name)}</h3>
                            <span class="addon-creator">by ${sanitizeText(creator)}</span>
                        </div>
                    </div>
                    <p class="addon-desc">${sanitizeText(desc)}</p>
                    <div class="card-footer-meta">
                        <div class="rating-badge">
                            ★ <span>${rating > 0 ? rating.toFixed(1) : 'N/A'}</span>
                        </div>
                        <div class="meta-tags">
                            <span class="tag">${sanitizeText(cat)}</span>
                            <span class="tag">.${sanitizeText(type)}</span>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    // 4. Addon Detail Screen View
    function renderPackDetailView(packId) {
        const pack = state.packs.find(p => SchemaAdapter.getId(p) === packId);

        if (!pack) {
            DOM.appView.innerHTML = `
                <div class="container">
                    <div class="empty-state">
                        <div class="empty-icon">🧱</div>
                        <h2 class="empty-title">Addon Not Found</h2>
                        <p class="empty-desc">The requested addon ID "${sanitizeText(packId)}" doesn't exist in our catalog.</p>
                        <a href="#/browse" class="btn btn-primary">Return to Discovery</a>
                    </div>
                </div>
            `;
            return;
        }

        const name = SchemaAdapter.getName(pack);
        const creator = SchemaAdapter.getCreator(pack);
        const creatorUrl = SchemaAdapter.getCreatorUrl(pack);
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
        const changelog = SchemaAdapter.getChangelog(pack);
        const tags = SchemaAdapter.getTags(pack);

        // Format download label
        let downloadLabel = `Download .${fileType}`;
        if (fileType.toLowerCase() === 'mcpack') downloadLabel = 'Download .mcpack';
        if (fileType.toLowerCase() === 'mcaddon') downloadLabel = 'Download .mcaddon';
        if (fileType.toLowerCase() === 'mcworld') downloadLabel = 'Download .mcworld';

        const html = `
            <div class="detail-container">
                <div class="back-btn-wrapper">
                    <a href="#/browse" class="btn btn-secondary">&larr; Back to Addons</a>
                </div>

                <!-- Addon Banner Header -->
                <header class="detail-header">
                    <img src="${sanitizeText(thumb)}" alt="${sanitizeText(name)}" class="detail-icon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 fill=%22%23202923%22></svg>'">
                    <div class="detail-title-area">
                        <h1>${sanitizeText(name)}</h1>
                        <div class="detail-meta-line">
                            <span>by ${creatorUrl ? `<a href="${sanitizeText(creatorUrl)}" target="_blank" rel="noopener" style="text-decoration:underline; font-weight:700;">${sanitizeText(creator)}</a>` : `<strong>${sanitizeText(creator)}</strong>`}</span>
                            <span>•</span>
                            <span class="rating-badge">★ ${rating > 0 ? rating.toFixed(1) : 'Unrated'}</span>
                            <span>•</span>
                            <span class="tag">${sanitizeText(cat)}</span>
                        </div>
                    </div>
                    <a href="${sanitizeText(downloadUrl)}" class="btn btn-primary" download target="_blank" rel="noopener">
                        ${sanitizeText(downloadLabel)}
                    </a>
                </header>

                <div class="detail-body-layout">
                    <!-- Main Content Column -->
                    <main>
                        <!-- Description -->
                        <section class="detail-section">
                            <h2 class="detail-section-title">About this Addon</h2>
                            <p style="white-space: pre-line; color: var(--text-secondary); line-height: 1.7;">
                                ${sanitizeText(desc)}
                            </p>
                        </section>

                        <!-- Screenshots Gallery (Only render if present) -->
                        ${screenshots.length > 0 ? `
                            <section class="detail-section">
                                <h2 class="detail-section-title">Screenshots & Media</h2>
                                <div class="gallery-grid">
                                    ${screenshots.map((imgUrl, idx) => `
                                        <div class="gallery-item" data-img="${sanitizeText(imgUrl)}" data-caption="${sanitizeText(name)} screenshot ${idx + 1}">
                                            <img src="${sanitizeText(imgUrl)}" alt="Screenshot ${idx + 1}" loading="lazy">
                                        </div>
                                    `).join('')}
                                </div>
                            </section>
                        ` : ''}

                        <!-- Changelog Section (Optional) -->
                        ${changelog ? `
                            <section class="detail-section">
                                <h2 class="detail-section-title">Changelog</h2>
                                <p style="white-space: pre-line; color: var(--text-secondary); font-size: 0.9rem;">
                                    ${sanitizeText(changelog)}
                                </p>
                            </section>
                        ` : ''}

                        <!-- Embedded Rating Section -->
                        <section class="detail-section">
                            <h2 class="detail-section-title">Rate this Addon</h2>
                            ${ratingUrl ? `
                                <div class="rating-iframe-wrapper">
                                    <iframe src="${sanitizeText(ratingUrl)}" class="rating-iframe" title="Rate ${sanitizeText(name)}" sandbox="allow-scripts allow-forms allow-same-origin" loading="lazy"></iframe>
                                </div>
                            ` : `
                                <p style="color: var(--text-muted); font-size: 0.9rem;">Ratings aren't available for this addon yet.</p>
                            `}
                        </section>
                    </main>

                    <!-- Sidebar Metadata Panel -->
                    <aside>
                        <div class="sidebar-box">
                            <div class="download-box" style="margin-bottom: 24px;">
                                <a href="${sanitizeText(downloadUrl)}" class="btn btn-primary" style="width: 100%;" download target="_blank" rel="noopener">
                                    ${sanitizeText(downloadLabel)}
                                </a>
                                <p class="download-notice">After downloading, open the file with Minecraft Bedrock Edition to automatically import it.</p>
                            </div>

                            <div class="meta-table">
                                <div class="meta-row">
                                    <span class="meta-label">Version</span>
                                    <span class="meta-value">${sanitizeText(version)}</span>
                                </div>
                                <div class="meta-row">
                                    <span class="meta-label">MC Compatibility</span>
                                    <span class="meta-value">${sanitizeText(mcVersion)}</span>
                                </div>
                                <div class="meta-row">
                                    <span class="meta-label">File Extension</span>
                                    <span class="meta-value">.${sanitizeText(fileType)}</span>
                                </div>
                                <div class="meta-row">
                                    <span class="meta-label">Category</span>
                                    <span class="meta-value">${sanitizeText(cat)}</span>
                                </div>
                            </div>

                            ${tags.length > 0 ? `
                                <div style="margin-top: 16px;">
                                    <span class="meta-label" style="display:block; margin-bottom:8px;">Tags</span>
                                    <div class="meta-tags">
                                        ${tags.map(tag => `<span class="tag">#${sanitizeText(tag)}</span>`).join('')}
                                    </div>
                                </div>
                            ` : ''}

                            <button type="button" class="btn btn-secondary" id="share-btn" style="width: 100%; margin-top: 20px;">
                                🔗 Share Addon
                            </button>
                        </div>
                    </aside>
                </div>
            </div>
        `;

        DOM.appView.innerHTML = html;

        // Bind Detail View Interactions
        bindDetailEvents(name);
    }

    // 5. About Philosophy View
    function renderAboutView() {
        DOM.appView.innerHTML = `
            <div class="container" style="max-width: 800px;">
                <section class="detail-section" style="margin-top: 32px;">
                    <div style="text-align:center; margin-bottom: 24px;">
                        <span class="pixel-block grass" style="width:48px; height:48px;"></span>
                        <h1 style="font-size: 2.2rem; margin-top:12px;">About BIVA</h1>
                        <p class="hero-motto">“Enhancing Minecraft, without losing the vanilla experience.”</p>
                    </div>

                    <h2 class="detail-section-title">Our Philosophy</h2>
                    <p style="color: var(--text-secondary); line-height: 1.8; margin-bottom: 20px;">
                        Minecraft Bedrock is an incredible sandbox, but many modern modpacks overcomplicate the core loop with unfitting mechanics, cluttered interfaces, or unvanilla aesthetics.
                    </p>
                    <p style="color: var(--text-secondary); line-height: 1.8; margin-bottom: 20px;">
                        <strong>BIVA (Better Immersive Vanilla Addons)</strong> is a curated platform built specifically to index high-quality Bedrock Edition addons that expand the game while respecting Mojang's original visual design, progression pacing, and charm.
                    </p>

                    <h2 class="detail-section-title" style="margin-top:32px;">Features</h2>
                    <ul style="color: var(--text-secondary); padding-left: 20px; line-height: 1.8;">
                        <li>Carefully indexed <code>.mcaddon</code>, <code>.mcpack</code>, and <code>.mcworld</code> files.</li>
                        <li>Direct creator attribution and download links.</li>
                        <li>Lightweight, privacy-respecting client with zero bloat.</li>
                    </ul>
                </section>
            </div>
        `;
    }

    // --- Event Bindings ---

    function bindBrowseEvents() {
        const mainInput = document.getElementById('main-search-input');
        const mainClear = document.getElementById('main-search-clear');
        const sortSelect = document.getElementById('sort-select');
        const resetBtn = document.getElementById('reset-search-btn');

        if (mainInput) {
            mainInput.addEventListener('input', debounce((e) => {
                state.searchQuery = e.target.value;
                syncSearchInputs(e.target.value);
                renderBrowseView();
            }, CONFIG.DEBOUNCE_MS));
        }

        if (mainClear) {
            mainClear.addEventListener('click', () => {
                state.searchQuery = '';
                syncSearchInputs('');
                renderBrowseView();
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                state.sortBy = e.target.value;
                renderBrowseView();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                state.searchQuery = '';
                state.selectedCategory = 'All';
                syncSearchInputs('');
                renderBrowseView();
            });
        }

        // Category Chip Click Handler
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                state.selectedCategory = e.currentTarget.dataset.category;
                renderBrowseView();
            });
        });
    }

    function bindDetailEvents(packName) {
        // Screenshot Lightbox Click Handlers
        document.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const imgUrl = item.dataset.img;
                const caption = item.dataset.caption;
                openLightbox(imgUrl, caption);
            });
        });

        // Share Button Clipboard API
        document.getElementById('share-btn')?.addEventListener('click', () => {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
                showToast(`Copied link to ${packName}!`);
            }
        });
    }

    function syncSearchInputs(value) {
        if (DOM.navSearchInput && DOM.navSearchInput !== document.activeElement) {
            DOM.navSearchInput.value = value;
        }
        if (DOM.navSearchClear) {
            DOM.navSearchClear.classList.toggle('hidden', !value);
        }
    }

    // --- Lightbox Functionality ---
    function openLightbox(url, caption) {
        DOM.lightboxImg.src = url;
        DOM.lightboxCaption.textContent = caption || '';
        DOM.lightbox.classList.add('active');
        DOM.lightbox.focus();
    }

    function closeLightbox() {
        DOM.lightbox.classList.remove('active');
        DOM.lightboxImg.src = '';
    }

    // --- Global Setup & Event Listeners ---
    function initGlobalEvents() {
        // Nav Search Input Synchronization
        DOM.navSearchInput.addEventListener('input', debounce((e) => {
            state.searchQuery = e.target.value;
            if (state.activeView !== 'browse') {
                window.location.hash = '#/browse';
            } else {
                renderBrowseView();
            }
        }, CONFIG.DEBOUNCE_MS));

        DOM.navSearchClear.addEventListener('click', () => {
            state.searchQuery = '';
            syncSearchInputs('');
            if (state.activeView === 'browse') renderBrowseView();
        });

        // Theme Toggle Handler
        DOM.themeToggle.addEventListener('click', () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', state.theme);
            localStorage.setItem('biva_theme', state.theme);
        });

        // Mobile Menu Drawer Handler
        DOM.mobileToggle.addEventListener('click', () => {
            const isExpanded = DOM.mobileToggle.getAttribute('aria-expanded') === 'true';
            DOM.mobileToggle.setAttribute('aria-expanded', !isExpanded);
            DOM.navMenu.classList.toggle('mobile-open');
        });

        // Lightbox Modal Keyboard & Click Events
        DOM.lightboxClose.addEventListener('click', closeLightbox);
        DOM.lightboxBackdrop.addEventListener('click', closeLightbox);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && DOM.lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });

        // Hash Routing Listener
        window.addEventListener('hashchange', handleRoute);
    }

    // --- Application Initialization ---
    function init() {
        cacheDOM();
        
        // Restore stored theme preference
        document.documentElement.setAttribute('data-theme', state.theme);
        
        initGlobalEvents();
        fetchPacks();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
