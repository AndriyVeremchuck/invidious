/**
 * Edge-to-Edge Fullscreen Cinema Controller with 3D Cover Flow Drum (Барабан)
 * - Proportional Responsive Design: MSI 40" / UltraWide / 4K / TV, Desktops, Tablets, Mobile Phones
 * - Real 3D Cover Flow animation with physical CSS transform glide & rotation
 * - Zero badge clutter: clean video imagery with 2px padding, rounded corners, duration & title overlay
 * - Multi-page parallel search (60-80 songs) sorted by max views descending
 * - Auto-clear search query when input closes / disappears
 * - Auto-advance with circular loop (end wraps to start)
 * - Restore last search query on restart / page reload
 * - Instant hide on Escape (0ms delay)
 * - 1.25s idle timeout
 */
(function () {
    'use strict';

    // Detect Android device / emulator
    var isAndroid = false;
    try {
        isAndroid = (typeof navigator !== 'undefined') && /android/i.test(navigator.userAgent || '');
        if (isAndroid) {
            if (document.documentElement) document.documentElement.classList.add('is-android');
            if (document.body) document.body.classList.add('is-android');
            window.addEventListener('DOMContentLoaded', function () {
                if (document.body) document.body.classList.add('is-android');
            });
        }
    } catch (e) {}

    // State Variables
    var videoList = [];            // Master circular list of videos (Search / Radio)
    var favoritesList = [];        // User saved favorite stations [{ videoId, title, author, views, lengthSeconds, authorVerified }]
    var drumMode = 'search';       // 'search' | 'favorites'
    var cardElements = [];         // Persistent DOM elements for 3D Cover Flow
    var currentIndex = 0;          // Index in active list of current center video
    var currentVideoId = '';
    var currentQuery = '';
    var searchPage = 1;
    var isLoadingMore = false;
    var hasMoreSearch = true;

    // Load persisted favorites from localStorage
    try {
        var savedFavs = localStorage.getItem('invidious_favorites');
        if (savedFavs) {
            favoritesList = JSON.parse(savedFavs);
            if (!Array.isArray(favoritesList)) favoritesList = [];
        }
    } catch (e) {
        favoritesList = [];
    }

    // Load persisted search list from localStorage
    try {
        var savedSearch = localStorage.getItem('invidious_last_search_results');
        if (savedSearch) {
            videoList = JSON.parse(savedSearch);
            if (!Array.isArray(videoList)) videoList = [];
        }
    } catch (e) {}

    // Load persisted drum mode
    try {
        var savedMode = localStorage.getItem('invidious_drum_mode');
        if (savedMode === 'favorites' || savedMode === 'search') {
            drumMode = savedMode;
        }
    } catch (e) {}

    // Panel Focus State: 'top' | 'bottom' | 'none'
    var activeZone = 'none';
    var lastActiveZone = 'bottom';
    try {
        var savedLastZone = localStorage.getItem('invidious_last_active_zone');
        if (savedLastZone === 'top' || savedLastZone === 'bottom') {
            lastActiveZone = savedLastZone;
        }
    } catch (e) {}
    var zoneHideTimeout = null;
    var isHoveringTop = false;
    var isHoveringBottom = false;

    function isItemInFavorites(videoId) {
        if (!videoId) return false;
        return favoritesList.some(function (v) { return v.videoId === videoId; });
    }

    function getActiveList() {
        if (drumMode === 'favorites') {
            return favoritesList;
        }
        // Відео, які перенесені в ізбране, не відображаються в барабані пошуку
        return videoList.filter(function (v) {
            return !isItemInFavorites(v.videoId);
        });
    }
    window.getActiveList = getActiveList;
    window.getCurrentVideoId = function () { return currentVideoId; };
    window.getCurrentIndex = function () { return currentIndex; };
    window.setCurrentIndex = function (idx) {
        currentIndex = idx;
        window.currentIndex = idx;
        updateDrumTransforms();
    };
    window.getVideoList = function () { return videoList; };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatSeconds(sec) {
        if (!sec || isNaN(sec)) return '';
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    // ==========================================
    // 1. Device Profile & Proportional Math
    // ==========================================
    function getDeviceProfile() {
        var w = window.innerWidth || 1920;
        var h = window.innerHeight || 1080;
        if (w >= 2560 || h >= 1400) {
            return 'ultrawide'; // MSI 40", 4K TV, 8K, 3440x1440, 5120x2160
        } else if (w >= 1280) {
            return 'desktop';   // Full HD 1080p, 2K 1440p laptops/monitors
        } else if (w >= 768) {
            return 'tablet';    // iPad, Tablets
        } else {
            return 'mobile';    // Smartphones
        }
    }

    function getSlotTransform(s, profile, winW) {
        profile = profile || getDeviceProfile();
        winW = winW || window.innerWidth || 1920;

        if (s === 0) {
            var centerZ = (profile === 'ultrawide' ? 120 : (profile === 'desktop' ? 95 : 70));
            var centerScale = (profile === 'ultrawide' ? 1.15 : (profile === 'desktop' ? 1.12 : 1.08));
            return { x: 0, z: centerZ, ry: 0, scale: centerScale, op: 1.0, zi: 50, visible: true };
        }

        var absS = Math.abs(s);
        var sign = s > 0 ? 1 : -1;

        // Dynamic step spacing proportional to screen width & +30% larger card dimensions
        var step;
        if (profile === 'ultrawide') {
            step = Math.min(1000, Math.max(600, winW * 0.26));
        } else if (profile === 'desktop') {
            step = Math.min(560, Math.max(340, winW * 0.26));
        } else if (profile === 'tablet') {
            step = Math.min(340, Math.max(210, winW * 0.30));
        } else { // mobile
            step = Math.min(260, Math.max(150, winW * 0.44));
        }

        // Друга картка (absS === 1) ближче до головної, третя (absS === 2) також зміщена до центру
        var xMultiplier = (absS === 1 ? 0.72 : (absS === 2 ? 1.40 : 2.06));
        var x = sign * step * xMultiplier;
        var z = (absS === 1 ? -45 : (absS === 2 ? -130 : -220));
        var ry = -sign * (absS === 1 ? 28 : (absS === 2 ? 44 : 56));
        var scale = (absS === 1 ? 0.92 : (absS === 2 ? 0.80 : 0.68));
        var op = (absS === 1 ? 0.82 : (absS === 2 ? 0.62 : 0.42));
        var zi = 50 - absS * 10;

        return { x: x, z: z, ry: ry, scale: scale, op: op, zi: zi, visible: true };
    }

    // ==========================================
    // 2. Panel Focus & Smart Search Selection
    // ==========================================
    function focusAndSelectSearch() {
        var searchInput = document.getElementById('searchbox');
        if (!searchInput) return;
        searchInput.focus();
        setTimeout(function () {
            try {
                if (searchInput.value && searchInput.value.length > 0) {
                    searchInput.select();
                    searchInput.setSelectionRange(0, searchInput.value.length);
                }
            } catch (e) {}
        }, 15);
    }

    function updateCounter() {
        var countEl = document.getElementById('cards-count-num');
        var countLabel = document.querySelector('.cards-count-label');
        if (!countEl) return;

        var currentList = getActiveList();
        if (drumMode === 'favorites') {
            if (countLabel) {
                countLabel.innerHTML = '⭐ Вибране: <span id="cards-count-num"><b>' + 
                    (favoritesList.length ? (currentIndex + 1) + ' / ' + favoritesList.length : 'порожньо') + '</b></span>';
            }
        } else {
            if (countLabel) {
                countLabel.innerHTML = 'Відео знайдено: <span id="cards-count-num"><b>' + 
                    (videoList.length ? (currentIndex + 1) + ' / ' + videoList.length : '0') + '</b></span>';
            }
        }
    }

    function setDrumMode(mode, onComplete) {
        if (mode !== 'search' && mode !== 'favorites') return;
        if (drumMode === mode && cardElements.length > 0) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }
        drumMode = mode;
        try {
            localStorage.setItem('invidious_drum_mode', mode);
        } catch (e) {}

        var currentList = getActiveList();
        var foundIdx = currentList.findIndex(function (v) { return v.videoId === currentVideoId; });
        currentIndex = (foundIdx >= 0) ? foundIdx : 0;

        initDrumCards();
        updateCounter();
        resetZoneTimer();
        if (typeof onComplete === 'function') onComplete();
    }
    window.setDrumMode = setDrumMode;

    function isCurrentInFavorites() {
        return isItemInFavorites(currentVideoId);
    }

    function updateFavBtnState() {
        // Floating button has been removed from screen per user request
    }

    function animateButtonIcon(btn, isFav) {
        if (!btn) return;
        var oldIcon = btn.querySelector('.card-fav-icon');
        if (oldIcon) {
            oldIcon.classList.remove('fly-up-in');
            oldIcon.classList.add('fly-up-out');
            setTimeout(function () {
                if (oldIcon.parentNode === btn) {
                    btn.removeChild(oldIcon);
                }
            }, 260);
        }
        var newIcon = document.createElement('span');
        newIcon.className = 'card-fav-icon fly-up-in';
        newIcon.textContent = isFav ? '−' : '+';
        btn.appendChild(newIcon);

        if (isFav) {
            btn.classList.add('is-fav');
            btn.setAttribute('title', 'Видалити з вибраного (Del або −)');
        } else {
            btn.classList.remove('is-fav');
            btn.setAttribute('title', 'Додати до вибраного (Ins або +)');
        }
    }

    function updateAllCardFavBtns() {
        var cardBtns = document.querySelectorAll('.card-fav-btn');
        cardBtns.forEach(function (btn) {
            var vId = btn.getAttribute('data-video-id');
            var isFav = isItemInFavorites(vId);
            var currentlyFav = btn.classList.contains('is-fav');
            if (currentlyFav !== isFav) {
                animateButtonIcon(btn, isFav);
            }
        });
    }

    function addToFavorites(item) {
        if (!item || !item.videoId) return;
        if (!isItemInFavorites(item.videoId)) {
            favoritesList.unshift(item);
            try {
                localStorage.setItem('invidious_favorites', JSON.stringify(favoritesList));
            } catch (e) {}
        }
        updateFavBtnState();
        updateAllCardFavBtns();
        
        var currentList = getActiveList();
        currentIndex = Math.max(0, Math.min(currentIndex, currentList.length - 1));
        initDrumCards();
        updateCounter();
        resetZoneTimer();
    }
    window.addToFavorites = addToFavorites;

    function removeFromFavorites(videoId) {
        if (!videoId) return;
        favoritesList = favoritesList.filter(function (v) { return v.videoId !== videoId; });
        try {
            localStorage.setItem('invidious_favorites', JSON.stringify(favoritesList));
        } catch (e) {}

        updateFavBtnState();
        updateAllCardFavBtns();
        
        var currentList = getActiveList();
        currentIndex = Math.max(0, Math.min(currentIndex, currentList.length - 1));
        initDrumCards();
        updateCounter();
        resetZoneTimer();
    }
    window.removeFromFavorites = removeFromFavorites;

    function showFavButton() {}
    function hideFavButton() {}

    function toggleCurrentFavorite() {
        var currentList = getActiveList();
        var item = currentList[currentIndex];
        if (!item || item.videoId !== currentVideoId) {
            item = videoList.find(function (v) { return v.videoId === currentVideoId; });
        }
        if (!item && currentVideoId) {
            var titleEl = document.getElementById('drum-now-playing-title');
            var rawTitle = titleEl ? titleEl.textContent.replace(/^▶\s*/, '') : document.title.replace(' - Invidious', '');
            item = {
                videoId: currentVideoId,
                title: rawTitle || 'Трек',
                author: '',
                views: '',
                lengthSeconds: 0,
                authorVerified: false
            };
        }
        if (!item) return;

        if (isItemInFavorites(item.videoId)) {
            removeFromFavorites(item.videoId);
        } else {
            addToFavorites(item);
        }
    }
    window.toggleCurrentFavorite = toggleCurrentFavorite;

    var isActivelyTyping = false;
    var typingTimer = null;

    function setZone(zone) {
        var contents = document.getElementById('contents');
        if (!contents) return;

        clearTimeout(zoneHideTimeout);
        var isOpeningBottom = (zone === 'bottom' && activeZone !== 'bottom');
        activeZone = zone;
        if (zone === 'top' || zone === 'bottom') {
            lastActiveZone = zone;
            try {
                localStorage.setItem('invidious_last_active_zone', zone);
            } catch (e) {}
        }

        contents.classList.remove('autohide-all', 'focus-top', 'focus-bottom');

        if (zone === 'top') {
            contents.classList.add('focus-top');
            focusAndSelectSearch();
        } else if (zone === 'bottom') {
            contents.classList.add('focus-bottom');

            // When drum appears, always center the currently playing video!
            if (isOpeningBottom) {
                var currentList = getActiveList();
                if (currentVideoId && currentList && currentList.length) {
                    var playingIdx = currentList.findIndex(function (v) { return v.videoId === currentVideoId; });
                    if (playingIdx >= 0) {
                        currentIndex = playingIdx;
                        updateDrumTransforms();
                        updateCounter();
                    }
                }
            }

            var searchInput = document.getElementById('searchbox');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
            }
        } else {
            // 'none' (Pure Cinema mode: video only, no HUD)
            contents.classList.add('autohide-all');
            var searchInput = document.getElementById('searchbox');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
            }
        }

        if (zone !== 'none') {
            resetZoneTimer();
        }
    }
    window.setZone = setZone;

    function resetZoneTimer() {
        clearTimeout(zoneHideTimeout);
        if (activeZone === 'none') return;

        // Затримка бездіяльності збільшена на 10%: з 1500ms до 1650ms (1.65 сек)
        var idleDelay = 1650;

        zoneHideTimeout = setTimeout(function () {
            // If user is actively typing in the searchbox, do not hide yet
            if (isActivelyTyping) {
                resetZoneTimer();
                return;
            }

            // If user cursor is hovering over drum cards or search bar, keep active
            if (isHoveringBottom || isHoveringTop) {
                resetZoneTimer();
                return;
            }

            var searchInput = document.getElementById('searchbox');
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
            }

            isHoveringTop = false;
            isHoveringBottom = false;
            setZone('none');
        }, idleDelay);
    }

    // ==========================================
    // 3. Play Video by ID
    // ==========================================
    function playVideoById(videoId, title) {
        if (!videoId) return;
        currentVideoId = videoId;
        window.currentVideoId = videoId;

        try {
            localStorage.setItem('invidious_last_played_id', videoId);
            if (title) localStorage.setItem('invidious_last_played_title', title);
        } catch (e) {}

        var origin = window.location.origin;
        var iframe = document.getElementById('main-player-iframe');
        if (iframe) {
            iframe.src = "https://www.youtube-nocookie.com/embed/" + videoId + "?autoplay=1&enablejsapi=1&rel=0&origin=" + encodeURIComponent(origin);
        }

        if (title) {
            document.title = title + " - Invidious";
        }

        if (window.history && window.history.replaceState) {
            var url = new URL(window.location);
            url.searchParams.set('v', videoId);
            window.history.replaceState({ videoId: videoId }, title || '', url.toString());
        }

        var currentList = getActiveList();
        var currentItem = currentList[currentIndex];
        var authorPart = (currentItem && currentItem.author) ? " • " + currentItem.author : "";
        var titleEl = document.getElementById('drum-now-playing-title');
        if (titleEl) {
            titleEl.textContent = title ? "▶ " + title + authorPart : "";
            titleEl.title = title ? title + authorPart : "";
        }

        updateFavBtnState();
    }
    window.playVideoById = playVideoById;

    // ==========================================
    // 4. 3D Cover Flow Carousel Engine (Smooth Persistent Elements)
    // ==========================================
    function createCardElement(item, idx) {
        var el = document.createElement('div');
        el.className = 'drum-card-slot';
        el.setAttribute('data-index', idx);

        var durationHtml = item.lengthSeconds ? '<div class="thumbnail-duration">' + formatSeconds(item.lengthSeconds) + '</div>' : '';
        var verifiedIcon = item.authorVerified ? '&nbsp;<i class="icon ion ion-md-checkmark-circle" style="font-size: 0.85em; opacity: 0.85;"></i>' : '';
        var metaSub = (item.author || item.views) ? '<div class="thumbnail-meta-sub">' + escapeHtml(item.author || '') + verifiedIcon + (item.views ? ' • ' + escapeHtml(item.views) : '') + '</div>' : '';

        el.innerHTML =
            '<div class="h-box video-card-box">' +
                '<div class="thumbnail-container">' +
                    '<img loading="lazy" class="thumbnail-img" src="/vi/' + item.videoId + '/mqdefault.jpg" alt="" onload="this.classList.add(\'is-loaded\')" onerror="this.classList.add(\'is-loaded\')" />' +
                    durationHtml +
                    '<div class="thumbnail-title-overlay">' +
                        '<p dir="auto" title="' + escapeHtml(item.title || '') + '">' + escapeHtml(item.title || '') + '</p>' +
                        metaSub +
                    '</div>' +
                '</div>' +
            '</div>';

        var img = el.querySelector('.thumbnail-img');
        if (img && img.complete) {
            img.classList.add('is-loaded');
        }

        el.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.onDrumCardClick(idx);
        };

        return el;
    }

    function initDrumCards() {
        var drumStage = document.getElementById('edge-cards-drum');
        if (!drumStage) return;

        drumStage.innerHTML = '';
        cardElements = [];

        var currentList = getActiveList();

        // If Favorites mode and list is empty: show beautiful empty card matching center card
        if (drumMode === 'favorites' && (!favoritesList || !favoritesList.length)) {
            var emptySlot = document.createElement('div');
            emptySlot.className = 'drum-card-slot slot-center';
            emptySlot.innerHTML =
                '<div class="h-box video-card-box empty-fav-card-box">' +
                    '<div class="empty-fav-icon">⭐</div>' +
                    '<div class="empty-fav-title">Список вибраного порожній</div>' +
                    '<div class="empty-fav-sub">Натисніть клавішу <b>Insert</b> або <b>+</b>, щоб додати трек до вибраного</div>' +
                '</div>';
            drumStage.appendChild(emptySlot);
            cardElements = [emptySlot];
            updateDrumTransforms();
            updateCounter();
            return;
        }

        if (!currentList || !currentList.length) {
            drumStage.innerHTML = '<div style="color:#94a3b8; font-size:1.4em; font-weight:600; text-align:center;">Відео не знайдено</div>';
            updateCounter();
            return;
        }

        // Create persistent DOM nodes for cards (чисті картинки без кружечків + / -)
        currentList.forEach(function (item, idx) {
            var el = createCardElement(item, idx);
            drumStage.appendChild(el);
            cardElements.push(el);
        });

        updateDrumTransforms();
        updateCounter();
    }

    // Безшовне додавання нових станцій у DOM без блимання та перетасування існуючих карток
    function appendItems(items) {
        if (!items || !items.length) return 0;
        var drumStage = document.getElementById('edge-cards-drum');
        var newValidItems = [];

        items.forEach(function (item) {
            if (!item || !item.videoId) return;
            if (item.type && item.type !== 'video') return;
            if (videoList.some(function (exist) { return exist.videoId === item.videoId; })) return;
            if (isItemInFavorites(item.videoId)) return;

            var vCount = (typeof item.viewCount === 'number') ? item.viewCount : (parseInt(item.viewCount, 10) || 0);
            newValidItems.push({
                videoId: item.videoId,
                title: item.title || '',
                author: item.author || '',
                views: item.viewCountText || (item.viewCount ? item.viewCount + ' переглядів' : ''),
                viewCountRaw: vCount,
                lengthSeconds: item.lengthSeconds || 0,
                authorVerified: item.authorVerified || false
            });
        });

        if (newValidItems.length === 0) return 0;

        // Сортуємо ТІЛЬКИ нову пачку між собою, не зміщуючи вже відображені станції
        newValidItems.sort(function (a, b) {
            return (b.viewCountRaw || 0) - (a.viewCountRaw || 0);
        });

        var currentActive = getActiveList();
        var startIdx = currentActive.length;

        newValidItems.forEach(function (v, i) {
            videoList.push(v);
            if (drumMode === 'search' && drumStage) {
                var el = createCardElement(v, startIdx + i);
                el.style.visibility = 'hidden';
                el.style.opacity = '0';
                drumStage.appendChild(el);
                cardElements.push(el);
            }
        });

        try {
            localStorage.setItem('invidious_last_search_results', JSON.stringify(videoList));
        } catch (e) {}

        if (drumMode === 'search') {
            updateDrumTransforms();
            updateCounter();
        }

        return newValidItems.length;
    }

    function updateDrumTransforms() {
        var currentList = getActiveList();

        if (drumMode === 'favorites' && (!favoritesList || !favoritesList.length)) {
            if (cardElements.length === 1) {
                var profile = getDeviceProfile();
                var centerT = getSlotTransform(0, profile, window.innerWidth || 1920);
                var el = cardElements[0];
                el.style.display = 'block';
                el.style.transform = 'translate3d(0, 0, ' + centerT.z + 'px) scale(' + centerT.scale + ')';
                el.style.opacity = '1';
                el.style.zIndex = '50';
                el.style.pointerEvents = 'auto';
            }
            updateCounter();
            var titleEl = document.getElementById('drum-now-playing-title');
            if (titleEl) {
                titleEl.textContent = "⭐ Список вибраних станцій порожній";
            }
            return;
        }

        if (!currentList || !currentList.length || !cardElements.length) return;

        var total = currentList.length;
        var profile = getDeviceProfile();
        var maxSlots = (profile === 'mobile' ? 1 : (profile === 'tablet' ? 2 : 3));
        var winW = window.innerWidth || 1920;

        cardElements.forEach(function (el, idx) {
            // Circular relative offset
            var diff = idx - currentIndex;
            while (diff > total / 2) diff -= total;
            while (diff < -total / 2) diff += total;

            var absDiff = Math.abs(diff);

            if (absDiff <= maxSlots) {
                var t = getSlotTransform(diff, profile, winW);
                el.style.visibility = 'visible';
                el.style.transform = 'translate3d(' + t.x + 'px, 0, ' + t.z + 'px) rotateY(' + t.ry + 'deg) scale(' + t.scale + ')';
                el.style.opacity = t.op;
                el.style.zIndex = t.zi;
                el.style.pointerEvents = 'auto';

                var cardBox = el.querySelector('.video-card-box');
                if (diff === 0) {
                    el.classList.add('slot-center');
                    if (cardBox) cardBox.classList.add('now-playing');
                } else {
                    el.classList.remove('slot-center');
                    if (cardBox) cardBox.classList.remove('now-playing');
                }
            } else if (absDiff <= maxSlots + 1) {
                var sign = diff > 0 ? 1 : -1;
                var tEdge = getSlotTransform(sign * maxSlots, profile, winW);
                el.style.visibility = 'visible';
                el.style.transform = 'translate3d(' + (tEdge.x + sign * (winW * 0.16)) + 'px, 0, ' + (tEdge.z - 110) + 'px) rotateY(' + (tEdge.ry + sign * 14) + 'deg) scale(0.55)';
                el.style.opacity = 0;
                el.style.zIndex = 0;
                el.style.pointerEvents = 'none';
                el.classList.remove('slot-center');
                var cardBoxEdge = el.querySelector('.video-card-box');
                if (cardBoxEdge) cardBoxEdge.classList.remove('now-playing');
            } else {
                el.style.visibility = 'hidden';
                el.style.opacity = 0;
                el.style.pointerEvents = 'none';
                el.classList.remove('slot-center');
                var cardBoxHidden = el.querySelector('.video-card-box');
                if (cardBoxHidden) cardBoxHidden.classList.remove('now-playing');
            }
        });

        // Update Top Counter
        updateCounter();

        // Update Bottom Title (Only Song Title and Author)
        var currentItem = currentList[currentIndex];
        var titleEl = document.getElementById('drum-now-playing-title');
        if (titleEl && currentItem) {
            var prefix = (currentItem.videoId === currentVideoId) ? "▶ " : "◎ ";
            var authorPart = currentItem.author ? " • " + currentItem.author : "";
            titleEl.textContent = prefix + (currentItem.title || "") + authorPart;
            titleEl.title = (currentItem.title || "") + authorPart;
        }
    }

    var lazyDrumUpdateTimer = null;
    function scheduleLazyDrumUpdate(delay) {
        clearTimeout(lazyDrumUpdateTimer);
        lazyDrumUpdateTimer = setTimeout(function () {
            initDrumCards();
            lazyDrumUpdateTimer = null;
        }, delay || 450);
    }

    // Rotate Drum left or right with 60 FPS CSS glide
    function rotateDrum(direction) {
        var currentList = getActiveList();
        if (!currentList || !currentList.length) return;

        // Поки користувач гортає, відкладаємо фонове перестворення DOM, щоб анімація не переривалась
        if (lazyDrumUpdateTimer) {
            scheduleLazyDrumUpdate(450);
        }

        // При першому поновленні / пробудженні барабана при натисканні вперед чи назад:
        // ставимо на перший раз саме ту картку, яка зараз грає, і НЕ зміщуємо на сусідню!
        if (activeZone !== 'bottom') {
            setZone('bottom');
            if (currentVideoId && currentList.length) {
                var playingIdx = currentList.findIndex(function (v) { return v.videoId === currentVideoId; });
                if (playingIdx >= 0) {
                    currentIndex = playingIdx;
                    updateDrumTransforms();
                    updateCounter();
                    resetZoneTimer();
                    return; // Зупиняємось на першому показі граючої картки!
                }
            }
            return;
        }

        // Барабан уже відкритий і видимий: переходимо вперед чи назад за бажанням користувача
        currentIndex = (currentIndex + direction) % currentList.length;
        if (currentIndex < 0) currentIndex += currentList.length;

        updateDrumTransforms();
        resetZoneTimer();

        // Dynamic infinite drum loading: When approaching the end in search mode (including PageDown jumps)
        if (drumMode === 'search' && hasMoreSearch && !isLoadingMore && (videoList.length - currentIndex <= 120)) {
            fetchMoreSearchPages();
        }
    }
    window.rotateDrum = rotateDrum;

    // Card click handler: Clicking center plays/pauses, clicking side rotates & plays
    window.onDrumCardClick = function (targetIdx) {
        var currentList = getActiveList();
        if (!currentList || !currentList.length) return;

        setZone('bottom');
        if (targetIdx === currentIndex) {
            var centerItem = currentList[currentIndex];
            if (centerItem) {
                if (centerItem.videoId !== currentVideoId) {
                    playVideoById(centerItem.videoId, centerItem.title);
                } else {
                    togglePlayPause();
                }
            }
        } else {
            currentIndex = targetIdx;
            updateDrumTransforms();

            var clickedItem = currentList[currentIndex];
            if (clickedItem) {
                playVideoById(clickedItem.videoId, clickedItem.title);
            }

            if (drumMode === 'search' && hasMoreSearch && !isLoadingMore && (videoList.length - currentIndex <= 25)) {
                fetchMoreSearchPages();
            }
        }
    };

    // Auto-advance: When song finishes, play next song; loop from last to first
    var lastAdvanceTime = 0;
    window.playNextVideo = function () {
        var currentList = getActiveList();
        if (!currentList || !currentList.length) return;
        var now = Date.now();
        if (now - lastAdvanceTime < 2500) return; // Prevent double trigger
        lastAdvanceTime = now;

        currentIndex = (currentIndex + 1) % currentList.length;
        updateDrumTransforms();

        var nextItem = currentList[currentIndex];
        if (nextItem && nextItem.videoId) {
            playVideoById(nextItem.videoId, nextItem.title);
        }
    };

    // ==========================================
    // 5. Multi-Page Parallel Search & Channel Resolution
    // ==========================================
    function fetchSingleSearchPage(q, pageNum) {
        var apiUrl = '/api/v1/search?q=' + encodeURIComponent(q) + '&page=' + pageNum;
        return fetch(apiUrl)
            .then(function (res) {
                if (!res.ok) return [];
                return res.json();
            })
            .catch(function () {
                return [];
            });
    }

    function resolveChannelVideos(channelQuery) {
        var clean = channelQuery.replace(/^(channel:|user:)/i, '').trim();
        var ucidPromise;
        if (clean.startsWith('UC') && clean.length === 24) {
            ucidPromise = Promise.resolve(clean);
        } else {
            ucidPromise = fetch('/api/v1/search?q=' + encodeURIComponent(clean) + '&type=channel')
                .then(function (res) { return res.json(); })
                .then(function (results) {
                    if (results && results.length && results[0].authorId) {
                        return results[0].authorId;
                    }
                    throw new Error('Channel not found');
                });
        }

        return ucidPromise.then(function (ucid) {
            return Promise.all([
                fetch('/api/v1/channels/' + ucid + '/videos?page=1').then(function (r) { return r.json(); }),
                fetch('/api/v1/channels/' + ucid + '/videos?page=2').then(function (r) { return r.json(); })
            ]).then(function (resps) {
                var videos = [];
                resps.forEach(function (data) {
                    var vList = (data && data.videos) ? data.videos : (Array.isArray(data) ? data : []);
                    videos = videos.concat(vList);
                });
                return videos;
            });
        });
    }

    var backgroundSearchTimeout = null;

    function scheduleBackgroundSearch(query) {
        clearTimeout(backgroundSearchTimeout);
        if (!query) return;

        var isChannelExplicit = query.startsWith('@') ||
                                query.toLowerCase().startsWith('channel:') ||
                                query.toLowerCase().startsWith('user:') ||
                                (query.startsWith('UC') && query.length === 24);
        if (isChannelExplicit) return;

        var isSpecificSong = query.indexOf('-') !== -1 ||
                             query.indexOf('feat') !== -1 ||
                             query.indexOf('ft.') !== -1 ||
                             query.split(/\s+/).length >= 5;

        function loadPagesBatch(startPage, maxPages, onComplete) {
            if (currentQuery !== query) return;
            if (startPage > maxPages) {
                if (onComplete) onComplete();
                return;
            }

            var p1 = startPage;
            var p2 = startPage + 1;
            var p3 = startPage + 2;
            var p4 = startPage + 3;
            searchPage = p4;

            Promise.all([
                fetchSingleSearchPage(query, p1),
                fetchSingleSearchPage(query, p2),
                fetchSingleSearchPage(query, p3),
                fetchSingleSearchPage(query, p4)
            ]).then(function (resps) {
                if (currentQuery !== query) return;
                var combined = [];
                resps.forEach(function (arr) {
                    if (Array.isArray(arr)) combined = combined.concat(arr);
                });

                if (!combined.length) {
                    if (onComplete) onComplete();
                    return;
                }

                appendItems(combined);

                backgroundSearchTimeout = setTimeout(function () {
                    loadPagesBatch(startPage + 4, maxPages, onComplete);
                }, 770);
            }).catch(function () {
                backgroundSearchTimeout = setTimeout(function () {
                    loadPagesBatch(startPage + 4, maxPages, onComplete);
                }, 1650);
            });
        }

        // Background fetch pages 9..25 (up to 350+ stations smoothly, +10% interval)
        backgroundSearchTimeout = setTimeout(function () {
            loadPagesBatch(9, 25, function () {
                // If query is broad / genre, also load complementary queries (radio, mix, live)
                if (!isSpecificSong && currentQuery === query) {
                    var relatedQueries = [query + ' radio', query + ' mix', query + ' live'];
                    var rIdx = 0;
                    function loadNextRelated() {
                        if (rIdx >= relatedQueries.length || currentQuery !== query) return;
                        var rQuery = relatedQueries[rIdx++];
                        Promise.all([
                            fetchSingleSearchPage(rQuery, 1),
                            fetchSingleSearchPage(rQuery, 2),
                            fetchSingleSearchPage(rQuery, 3),
                            fetchSingleSearchPage(rQuery, 4)
                        ]).then(function (rResps) {
                            if (currentQuery !== query) return;
                            var rCombined = [];
                            rResps.forEach(function (arr) {
                                if (Array.isArray(arr)) rCombined = rCombined.concat(arr);
                            });
                            appendItems(rCombined);
                            backgroundSearchTimeout = setTimeout(loadNextRelated, 880);
                        }).catch(function () {
                            backgroundSearchTimeout = setTimeout(loadNextRelated, 1320);
                        });
                    }
                    backgroundSearchTimeout = setTimeout(loadNextRelated, 880);
                }
            });
        }, 1320);
    }

    function fetchMoreSearchPages() {
        if (!currentQuery || !hasMoreSearch || isLoadingMore) return;
        isLoadingMore = true;
        var nextStart = searchPage + 1;
        var p1 = nextStart;
        var p2 = nextStart + 1;
        var p3 = nextStart + 2;
        var p4 = nextStart + 3;
        searchPage = p4;

        Promise.all([
            fetchSingleSearchPage(currentQuery, p1),
            fetchSingleSearchPage(currentQuery, p2),
            fetchSingleSearchPage(currentQuery, p3),
            fetchSingleSearchPage(currentQuery, p4)
        ]).then(function (resps) {
            isLoadingMore = false;
            var combined = [];
            resps.forEach(function (pageArr) {
                if (Array.isArray(pageArr)) combined = combined.concat(pageArr);
            });
            if (!combined.length) {
                if (searchPage >= 25) {
                    hasMoreSearch = false;
                }
                return;
            }
            appendItems(combined);
        }).catch(function () {
            isLoadingMore = false;
        });
    }

    window.performInlineSearch = function (query, clearPrevious) {
        if (!query || !query.trim()) return;
        query = query.trim();

        var drumStage = document.getElementById('edge-cards-drum');

        if (clearPrevious) {
            currentQuery = query;
            searchPage = 8;
            hasMoreSearch = true;
            isLoadingMore = false;
            try {
                localStorage.setItem('invidious_last_search_query', query);
            } catch (e) {}

            if (drumStage) {
                drumStage.style.transition = 'opacity 0.25s ease';
                drumStage.style.opacity = '0';
            }
        }

        // Preserve query in searchbox, blur and hide HUD into pure cinema mode
        var searchInput = document.getElementById('searchbox');
        if (searchInput) {
            searchInput.value = query;
            searchInput.blur();
        }
        setZone('none');

        var countEl = document.getElementById('cards-count-num');
        if (countEl) countEl.innerHTML = '<i>Пошук...</i>';

        // Check if query is explicitly a channel (@handle, channel:name, UC...)
        var isChannelExplicit = query.startsWith('@') ||
                                query.toLowerCase().startsWith('channel:') ||
                                query.toLowerCase().startsWith('user:') ||
                                (query.startsWith('UC') && query.length === 24);

        var fetchPromise;
        if (isChannelExplicit) {
            fetchPromise = resolveChannelVideos(query).catch(function () {
                // Fallback to standard search if channel resolution fails
                return Promise.all([
                    fetchSingleSearchPage(query, 1),
                    fetchSingleSearchPage(query, 2),
                    fetchSingleSearchPage(query, 3),
                    fetchSingleSearchPage(query, 4),
                    fetchSingleSearchPage(query, 5),
                    fetchSingleSearchPage(query, 6),
                    fetchSingleSearchPage(query, 7),
                    fetchSingleSearchPage(query, 8)
                ]).then(function (pagesResults) {
                    var c = [];
                    pagesResults.forEach(function (arr) { if (Array.isArray(arr)) c = c.concat(arr); });
                    return c;
                });
            });
        } else {
            // General query: fetch 8 pages in parallel (pages 1..8) -> up to 160 songs!
            fetchPromise = Promise.all([
                fetchSingleSearchPage(query, 1),
                fetchSingleSearchPage(query, 2),
                fetchSingleSearchPage(query, 3),
                fetchSingleSearchPage(query, 4),
                fetchSingleSearchPage(query, 5),
                fetchSingleSearchPage(query, 6),
                fetchSingleSearchPage(query, 7),
                fetchSingleSearchPage(query, 8)
            ]).then(function (pagesResults) {
                var c = [];
                pagesResults.forEach(function (arr) {
                    if (Array.isArray(arr)) c = c.concat(arr);
                });
                return c;
            });
        }

        fetchPromise.then(function (results) {
            var seen = {};
            var newVideos = [];

            (results || []).forEach(function (item) {
                if (!item || !item.videoId) return;
                if (item.type && item.type !== 'video') return;
                if (seen[item.videoId]) return;
                seen[item.videoId] = true;

                var vCount = (typeof item.viewCount === 'number') ? item.viewCount : (parseInt(item.viewCount, 10) || 0);
                newVideos.push({
                    videoId: item.videoId,
                    title: item.title || '',
                    author: item.author || '',
                    views: item.viewCountText || (item.viewCount ? item.viewCount + ' переглядів' : ''),
                    viewCountRaw: vCount,
                    lengthSeconds: item.lengthSeconds || 0,
                    authorVerified: item.authorVerified || false
                });
            });

            // Calculate query relevance score so exact matches always stay at the front
            var stopwords = ['feat', 'ft', 'vs', 'and', 'the', 'in', 'on', 'at', 'to', 'a', 'an', 'of', 'remix', 'mix', 'official', 'video', 'audio'];
            var queryWords = query.toLowerCase()
                .replace(/[^a-z0-9а-яіїєґ]/gi, ' ')
                .split(/\s+/)
                .filter(function (w) { return w.length > 2 && stopwords.indexOf(w) === -1; });

            if (queryWords.length > 0) {
                newVideos.forEach(function (v) {
                    var text = (v.title + ' ' + v.author).toLowerCase();
                    var matchCount = 0;
                    queryWords.forEach(function (w) {
                        if (text.indexOf(w) !== -1) matchCount++;
                    });
                    v.relevanceScore = matchCount;
                });

                var hasMatches = newVideos.some(function (v) { return v.relevanceScore > 0; });
                if (hasMatches) {
                    // Filter out distant irrelevant YouTube suggestions (score == 0)
                    newVideos = newVideos.filter(function (v) { return v.relevanceScore > 0; });
                }
            }

            // Сортування за максимумом переглядів по спадаючій (highest views first)
            newVideos.sort(function (a, b) {
                return (b.viewCountRaw || 0) - (a.viewCountRaw || 0);
            });

            if (newVideos.length === 0) {
                hasMoreSearch = false;
                if (clearPrevious) {
                    videoList = [];
                    initDrumCards();
                    if (countEl) countEl.innerHTML = '<b>0</b>';
                    if (drumStage) drumStage.style.opacity = '1';
                }
                return;
            }

            if (clearPrevious) {
                videoList = newVideos;
                drumMode = 'search';
                try {
                    localStorage.setItem('invidious_last_search_results', JSON.stringify(videoList));
                    localStorage.setItem('invidious_drum_mode', 'search');
                } catch (e) {}

                // Включаємо першу пісню зі списку: відсортовано за спаданням переглядів (перша з максимуму)
                currentIndex = 0;
                initDrumCards();

                if (drumStage) {
                    setTimeout(function () {
                        drumStage.style.opacity = '1';
                    }, 40);
                }

                // Автоматично запускаємо першу пісню (з максимумом переглядів)
                playVideoById(videoList[0].videoId, videoList[0].title);

                // Барабан залишається прихованим, доки юзер сам не ініціює дію
                updateCounter();

                // Автоматично фоном підвантажуємо розширені сторінки та радіо-мікси
                scheduleBackgroundSearch(query);
            } else {
                appendItems(newVideos);
            }
        }).catch(function (err) {
            console.error("Search error:", err);
            if (drumStage) drumStage.style.opacity = '1';
            if (countEl && videoList.length) {
                countEl.innerHTML = '<b>' + (currentIndex + 1) + ' / ' + videoList.length + '</b>';
            }
        });
    };

    // ==========================================
    // 6. Video Controls: Play/Pause, Fullscreen, Mute
    // ==========================================
    function sendIframeCommand(cmd, args) {
        var iframe = document.getElementById('main-player-iframe');
        if (!iframe || !iframe.contentWindow) return;
        try {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: cmd,
                args: args || ''
            }), '*');
        } catch (e) {}
    }

    function togglePlayPause() {
        var iframe = document.getElementById('main-player-iframe');
        if (!iframe || !iframe.contentWindow) return;
        try {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'pauseVideo',
                args: ''
            }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'playVideo',
                args: ''
            }), '*');
        } catch (e) {}
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(function () {});
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    }

    function toggleMute() {
        var iframe = document.getElementById('main-player-iframe');
        if (!iframe || !iframe.contentWindow) return;
        try {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'mute',
                args: ''
            }), '*');
        } catch (e) {}
    }

    // YouTube Iframe API callback
    window.onYouTubeIframeAPIReady = function () {
        try {
            new window.YT.Player('main-player-iframe', {
                events: {
                    'onStateChange': function (e) {
                        if (e.data === 0) { // ENDED
                            window.playNextVideo();
                        }
                    }
                }
            });
        } catch (e) {}
    };

    // YouTube iframe message listener
    window.addEventListener('message', function (event) {
        try {
            var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (!data) return;

            // Direct onStateChange event: info 0 = ENDED
            if (data.event === 'onStateChange' && (data.info === 0 || data.info === '0')) {
                window.playNextVideo();
                return;
            }

            // infoDelivery with playerState 0 = ENDED
            if (data.event === 'infoDelivery' && data.info) {
                var info = data.info;
                if (info.playerState === 0 || info.playerState === '0') {
                    window.playNextVideo();
                    return;
                }
                if (typeof info.currentTime === 'number' && typeof info.duration === 'number') {
                    if (info.duration > 3 && info.currentTime >= info.duration - 0.7) {
                        window.playNextVideo();
                        return;
                    }
                }
            }
        } catch (e) {}
    });

    setInterval(function () {
        var iframe = document.getElementById('main-player-iframe');
        if (!iframe || !iframe.contentWindow) return;
        try {
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
            sendIframeCommand('getPlayerState');
            sendIframeCommand('getCurrentTime');
            sendIframeCommand('getDuration');
        } catch (e) {}
    }, 1000);

    // ==========================================
    // 7. Event Handling & Keyboard Shortcuts
    // ==========================================
    var lastArrowKeyTime = 0;
    var lastPageKeyTime = 0;
    window.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        var searchInput = document.getElementById('searchbox');
        var isSearchFocused = searchInput && document.activeElement === searchInput;

        // Escape: ANY open window / HUD immediately disappears
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            clearTimeout(zoneHideTimeout);
            if (searchInput) {
                searchInput.blur();
            }
            var drumStage = document.getElementById('edge-cards-drum');
            if (drumStage) drumStage.blur();
            setZone('none');
            return;
        }

        // Ctrl+F / Cmd+F / F3 -> Open search HUD
        if (((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А')) || e.key === 'F3') {
            e.preventDefault();
            e.stopPropagation();
            setZone('top');
            return;
        }

        // If inside search input:
        if (isSearchFocused) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                searchInput.blur();
                setZone('bottom');
                setDrumMode('search');
                var drumStage = document.getElementById('edge-cards-drum');
                if (drumStage) drumStage.focus();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                searchInput.blur();
                setZone('bottom');
                setDrumMode('favorites');
                var drumStage = document.getElementById('edge-cards-drum');
                if (drumStage) drumStage.focus();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                var q = searchInput.value.trim();
                if (q) {
                    searchInput.blur();
                    window.performInlineSearch(q, true);
                }
                return;
            }
            resetZoneTimer();
            return;
        }

        // ArrowUp & ArrowDown: 3-Way Cycle between Search Bar, Search Drum, and Favorites Drum
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();

            if (activeZone === 'top') {
                if (searchInput) searchInput.blur();
                setZone('bottom');
                setDrumMode('favorites');
                var drumStage = document.getElementById('edge-cards-drum');
                if (drumStage) drumStage.focus();
            } else if (activeZone === 'bottom') {
                if (drumMode === 'favorites') {
                    setDrumMode('search');
                } else {
                    setZone('top');
                }
            } else {
                setZone('top');
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();

            if (activeZone === 'top') {
                if (searchInput) searchInput.blur();
                setZone('bottom');
                setDrumMode('search');
                var drumStage = document.getElementById('edge-cards-drum');
                if (drumStage) drumStage.focus();
            } else if (activeZone === 'bottom') {
                if (drumMode === 'search') {
                    setDrumMode('favorites');
                } else {
                    setZone('top');
                }
            } else {
                setZone('bottom');
                setDrumMode('search');
                var drumStage = document.getElementById('edge-cards-drum');
                if (drumStage) drumStage.focus();
            }
            return;
        }

        // Home: Jump to the beginning of the list
        if (e.key === 'Home') {
            e.preventDefault();
            e.stopPropagation();
            setZone('bottom');
            currentIndex = 0;
            updateDrumTransforms();
            updateCounter();
            resetZoneTimer();
            return;
        }

        // End: Jump to the end of the list
        if (e.key === 'End') {
            e.preventDefault();
            e.stopPropagation();
            setZone('bottom');
            var currentList = getActiveList();
            if (currentList && currentList.length) {
                currentIndex = currentList.length - 1;
                updateDrumTransforms();
                updateCounter();
                resetZoneTimer();
                if (drumMode === 'search' && hasMoreSearch && !isLoadingMore) {
                    fetchMoreSearchPages();
                }
            }
            return;
        }

        var nowKey = Date.now();
        // PageDown: Перегортання на 100 станцій вперед
        if (e.key === 'PageDown') {
            e.preventDefault();
            e.stopPropagation();
            if (nowKey - lastPageKeyTime < 264) return;
            lastPageKeyTime = nowKey;
            setZone('bottom');
            rotateDrum(100);
            return;
        }

        // PageUp: Перегортання на 100 станцій назад
        if (e.key === 'PageUp') {
            e.preventDefault();
            e.stopPropagation();
            if (nowKey - lastPageKeyTime < 264) return;
            lastPageKeyTime = nowKey;
            setZone('bottom');
            rotateDrum(-100);
            return;
        }

        // Insert or + / = : Add to favorites
        var isPlusKey = (e.key === 'Insert') ||
                        (e.key === '+') ||
                        (e.code === 'NumpadAdd') ||
                        (e.key === '=' && !e.shiftKey);
        if (isPlusKey) {
            e.preventDefault();
            e.stopPropagation();
            var currentList = getActiveList();
            var targetItem = currentList[currentIndex];
            if (!targetItem && currentVideoId) {
                targetItem = videoList.find(function (v) { return v.videoId === currentVideoId; });
            }
            if (targetItem) {
                addToFavorites(targetItem);
            }
            return;
        }

        // Delete / Del or - / _ / − : Remove from favorites
        var isMinusKey = (e.key === 'Delete') ||
                         (e.key === 'Del') ||
                         (e.key === '-') ||
                         (e.key === '−') ||
                         (e.code === 'NumpadSubtract') ||
                         (e.key === '_');
        if (isMinusKey) {
            e.preventDefault();
            e.stopPropagation();
            var currentList = getActiveList();
            var targetItem = currentList[currentIndex];
            if (!targetItem && currentVideoId) {
                targetItem = videoList.find(function (v) { return v.videoId === currentVideoId; });
            }
            if (targetItem) {
                removeFromFavorites(targetItem.videoId);
            }
            return;
        }

        // ArrowLeft / ArrowRight rotate 3D drum carousel
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            if (nowKey - lastArrowKeyTime < 83) return;
            lastArrowKeyTime = nowKey;
            rotateDrum(1);
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            if (nowKey - lastArrowKeyTime < 83) return;
            lastArrowKeyTime = nowKey;
            rotateDrum(-1);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            setZone('bottom');
            var currentList = getActiveList();
            var centerItem = currentList[currentIndex];
            if (centerItem && centerItem.videoId) {
                if (centerItem.videoId !== currentVideoId) {
                    playVideoById(centerItem.videoId, centerItem.title);
                } else {
                    togglePlayPause();
                }
            }
            return;
        }

        // Player Hotkeys (Space, K, F, M, F11)
        var keyLower = e.key.toLowerCase();
        if (e.key === ' ' || keyLower === 'k' || keyLower === 'л') {
            e.preventDefault();
            e.stopPropagation();
            togglePlayPause();
            return;
        }
        if (keyLower === 'f' || keyLower === 'а' || e.key === 'F11') {
            temporarilySuppressTriggers(1200);
            if (keyLower === 'f' || keyLower === 'а') {
                e.preventDefault();
                e.stopPropagation();
                toggleFullscreen();
                return;
            }
        }
        if (keyLower === 'm' || keyLower === 'ь') {
            e.preventDefault();
            e.stopPropagation();
            toggleMute();
            return;
        }

        // Typing any character outside search: automatically opens and types in searchbox
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (searchInput) {
                e.preventDefault();
                e.stopPropagation();
                setZone('top');
                searchInput.value = e.key; // Fresh new search
                searchInput.focus();
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                resetZoneTimer();
                return;
            }
        }
    }, true);

    // ==========================================
    // 8. Mouse Movement & Touch Gestures
    // ==========================================
    var suppressEdgeTriggers = false;
    var suppressTimer = null;
    function temporarilySuppressTriggers(ms) {
        suppressEdgeTriggers = true;
        clearTimeout(suppressTimer);
        suppressTimer = setTimeout(function () {
            suppressEdgeTriggers = false;
        }, ms || 1000);
    }

    document.addEventListener('fullscreenchange', function () {
        temporarilySuppressTriggers(1200);
        if (activeZone === 'none') {
            setZone('none');
        }
    });

    window.addEventListener('resize', function () {
        temporarilySuppressTriggers(800);
        updateDrumTransforms();
    });

    window.addEventListener('mousemove', function (e) {
        if (suppressEdgeTriggers) return;

        var winW = window.innerWidth || 1920;
        var winH = window.innerHeight || 1080;

        // Екран розбиваємо по висоті на 5 рівних частин:
        // 1/5 біля центра — це смуга від 40% до 60% висоти (Y від 0.40 * winH до 0.60 * winH)
        var centerTop = winH * 0.40;
        var centerBottom = winH * 0.60;
        var isInCenterFifth = (e.clientY >= centerTop && e.clientY <= centerBottom);

        if (activeZone === 'none') {
            // Елементи з'являються ТІЛЬКИ коли курсор увійшов в 1/5 біля центра!
            // З'являється те, що було останнім: пошук або барабан
            if (isInCenterFifth) {
                setZone(lastActiveZone || 'bottom');
                resetZoneTimer();
            }
        } else {
            // Коли елементи вже видимі: миша рухається — тримаємо їх відкритими
            var searchInput = document.getElementById('searchbox');
            var isTyping = searchInput && document.activeElement === searchInput;
            if (!isTyping) {
                resetZoneTimer();
            }
        }
    });

    // ==========================================
    // 9. Initialization on DOMContentLoaded
    // ==========================================
    document.addEventListener('DOMContentLoaded', function () {
        var navbar = document.querySelector('.navbar');
        var cardsBar = document.querySelector('.edge-cards-bar');
        var drumStage = document.getElementById('edge-cards-drum');
        var searchInput = document.getElementById('searchbox');
        var searchBtn = document.getElementById('searchbutton');

        // Cleanup any legacy floating button if present
        var legacyFavBtn = document.getElementById('floating-fav-btn');
        if (legacyFavBtn && legacyFavBtn.parentNode) {
            legacyFavBtn.parentNode.removeChild(legacyFavBtn);
        }

        if (searchInput) {
            searchInput.addEventListener('input', function () {
                isActivelyTyping = true;
                clearTimeout(typingTimer);
                typingTimer = setTimeout(function () {
                    isActivelyTyping = false;
                }, 2200);
                resetZoneTimer();
            });
            searchInput.addEventListener('keydown', function () {
                isActivelyTyping = true;
                clearTimeout(typingTimer);
                typingTimer = setTimeout(function () {
                    isActivelyTyping = false;
                }, 2200);
                resetZoneTimer();
            });
        }

        // Parse initial server-rendered cards if videoList was not cached
        var initialContainer = document.getElementById('initial-cards-data') || document.getElementById('edge-cards-track');
        if ((!videoList || !videoList.length) && initialContainer) {
            var rawCards = Array.from(initialContainer.querySelectorAll('.video-card-wrapper'));
            videoList = rawCards.map(function (card) {
                return {
                    videoId: card.getAttribute('data-video-id'),
                    title: card.getAttribute('data-video-title') || '',
                    author: card.getAttribute('data-video-author') || '',
                    views: card.getAttribute('data-video-views') || '',
                    lengthSeconds: parseInt(card.getAttribute('data-video-length') || '0', 10),
                    authorVerified: card.querySelector('.ion-md-checkmark-circle') !== null
                };
            }).filter(function (v) { return Boolean(v.videoId); });

            // Сортування від максимуму переглядів по спадаючій
            videoList.sort(function (a, b) {
                return (b.viewCountRaw || 0) - (a.viewCountRaw || 0);
            });
        }

        // Detect initial playing ID
        var urlParams = new URLSearchParams(window.location.search);
        var currentList = getActiveList();
        var initialId = urlParams.get('v') || (currentList.length ? currentList[0].videoId : '');

        var foundIdx = currentList.findIndex(function (v) { return v.videoId === initialId; });
        currentIndex = (foundIdx >= 0) ? foundIdx : 0;
        if (currentList.length) {
            currentVideoId = currentList[currentIndex].videoId;
        }

        // Підраховуємо і відображаємо кількість карток у першу чергу!
        updateCounter();
        initDrumCards();
        updateFavBtnState();

        // Hover handling with reliable inactivity timers
        if (navbar) {
            navbar.addEventListener('mouseenter', function () {
                isHoveringTop = true;
                setZone('top');
                resetZoneTimer();
            });
            navbar.addEventListener('mousemove', function () {
                resetZoneTimer();
            });
            navbar.addEventListener('mouseleave', function () {
                isHoveringTop = false;
                resetZoneTimer();
            });
        }

        if (cardsBar) {
            cardsBar.addEventListener('mouseenter', function () {
                isHoveringBottom = true;
                setZone('bottom');
                resetZoneTimer();
            });
            cardsBar.addEventListener('mousemove', function () {
                resetZoneTimer();
            });
            cardsBar.addEventListener('mouseleave', function () {
                isHoveringBottom = false;
                resetZoneTimer();
            });
        }
        var bottomPlayingBar = document.querySelector('.bottom-now-playing-bar') || document.querySelector('.cards-count-header');
        if (bottomPlayingBar) {
            bottomPlayingBar.addEventListener('mouseenter', function () {
                isHoveringBottom = true;
                setZone('bottom');
                resetZoneTimer();
            });
            bottomPlayingBar.addEventListener('mousemove', function () {
                resetZoneTimer();
            });
            bottomPlayingBar.addEventListener('mouseleave', function () {
                isHoveringBottom = false;
                resetZoneTimer();
            });
        }
        var topCounter = document.querySelector('.top-cards-counter');
        if (topCounter) {
            topCounter.addEventListener('mouseenter', function () {
                isHoveringBottom = true;
                setZone('bottom');
                resetZoneTimer();
            });
            topCounter.addEventListener('mousemove', function () {
                resetZoneTimer();
            });
            topCounter.addEventListener('mouseleave', function () {
                isHoveringBottom = false;
                resetZoneTimer();
            });
        }

        // Drag / Swipe / Wheel on Drum Stage
        if (drumStage) {
            var dragStartX = 0;
            var isDragging = false;

            drumStage.addEventListener('mouseenter', function () {
                isHoveringBottom = true;
                resetZoneTimer();
            });
            drumStage.addEventListener('mousemove', function () {
                isHoveringBottom = true;
                resetZoneTimer();
            });
            drumStage.addEventListener('mouseleave', function () {
                isHoveringBottom = false;
                resetZoneTimer();
            });

            drumStage.addEventListener('mousedown', function (e) {
                isHoveringBottom = true;
                dragStartX = e.clientX;
                isDragging = true;
                resetZoneTimer();
            });
            window.addEventListener('mouseup', function (e) {
                if (!isDragging) return;
                isDragging = false;
                resetZoneTimer();
                var diff = e.clientX - dragStartX;
                if (diff < -35) {
                    rotateDrum(1);
                } else if (diff > 35) {
                    rotateDrum(-1);
                }
            });

            drumStage.addEventListener('touchstart', function (e) {
                isHoveringBottom = true;
                resetZoneTimer();
                if (e.touches && e.touches[0]) {
                    dragStartX = e.touches[0].clientX;
                }
            }, { passive: true });
            drumStage.addEventListener('touchend', function (e) {
                resetZoneTimer();
                if (e.changedTouches && e.changedTouches[0]) {
                    var diff = e.changedTouches[0].clientX - dragStartX;
                    if (diff < -35) rotateDrum(1);
                    else if (diff > 35) rotateDrum(-1);
                }
            }, { passive: true });

            var lastWheelTime = 0;
            var wheelAccumulator = 0;
            var wheelResetTimer = null;
            drumStage.addEventListener('wheel', function (e) {
                e.preventDefault();
                isHoveringBottom = true;
                resetZoneTimer();

                var now = Date.now();
                var delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                wheelAccumulator += delta;

                clearTimeout(wheelResetTimer);
                wheelResetTimer = setTimeout(function () {
                    wheelAccumulator = 0;
                }, 154);

                if (Math.abs(wheelAccumulator) >= 33 && (now - lastWheelTime >= 88)) {
                    var dir = wheelAccumulator > 0 ? 1 : -1;
                    rotateDrum(dir);
                    wheelAccumulator = 0;
                    lastWheelTime = now;
                }
            }, { passive: false });
        }

        // Search Input listeners: Smart Omnibox Selection behavior
        if (searchInput) {
            var isMouseDownFocus = false;
            searchInput.addEventListener('mousedown', function () {
                if (document.activeElement !== searchInput) {
                    isMouseDownFocus = true;
                }
            });
            searchInput.addEventListener('mouseup', function (e) {
                if (isMouseDownFocus) {
                    isMouseDownFocus = false;
                    e.preventDefault();
                    searchInput.select();
                }
            });
            searchInput.addEventListener('focus', function () {
                setZone('top');
                setTimeout(function () {
                    try {
                        if (searchInput.value && searchInput.value.length > 0) {
                            searchInput.select();
                            searchInput.setSelectionRange(0, searchInput.value.length);
                        }
                    } catch (err) {}
                }, 15);
            });
            searchInput.addEventListener('input', function () {
                resetZoneTimer();
            });
            var searchForm = searchInput.closest('form');
            if (searchForm) {
                searchForm.addEventListener('submit', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var q = searchInput.value.trim();
                    if (q) window.performInlineSearch(q, true);
                });
            }
        }

        if (searchBtn && searchInput) {
            searchBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var q = searchInput.value.trim();
                if (q) window.performInlineSearch(q, true);
            });
        }

        // Restore last search query on page reload / restart
        var lastSearchQuery = urlParams.get('q');
        if (!lastSearchQuery) {
            try {
                lastSearchQuery = localStorage.getItem('invidious_last_search_query');
            } catch (e) {}
        }

        if (lastSearchQuery && lastSearchQuery.trim()) {
            lastSearchQuery = lastSearchQuery.trim();
            if (searchInput) searchInput.value = lastSearchQuery;
            currentQuery = lastSearchQuery;
        }

        // Only perform network search if videoList has NO cached items
        if (!videoList || !videoList.length) {
            if (lastSearchQuery) {
                window.performInlineSearch(lastSearchQuery, true);
            } else {
                setZone('none');
            }
        } else {
            // Already have cached cards loaded into memory and rendered cleanly at startup
            setZone('none');
        }
    });

})();
