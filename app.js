// nikkXmovie Premium Client Script

// Determine backend API URL dynamically based on where the app is being run from
const API_BASE_URL = (
  window.location.protocol === 'file:' || 
  (window.location.hostname === 'localhost' && window.location.port !== '3000') ||
  (window.location.hostname === '127.0.0.1' && window.location.port !== '3000')
) ? 'http://localhost:3000' : '';

let currentPage = 1;
let currentCategory = '';
let currentSearch = '';
let currentSearchCategory = 'all';
let hasNextPage = false;
let firstMovieOnPage = null;
let currentImdbId = null;
let currentMediaType = 'movie';
let currentSeason = 1;
let currentEpisode = 1;
let currentDirectStreamUrl = null;
let currentEpisodesList = [];
let currentMovieData = null;
let currentPlayingEpisodeIndex = -1;
let directStreamWatchdog = null;

// DOM Elements
const moviesGrid = document.getElementById('movies-grid');
const skeletonLoader = document.getElementById('skeleton-loader');
const pagination = document.getElementById('pagination');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageNumDisplay = document.getElementById('page-num-display');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const catButtons = document.querySelectorAll('.cat-btn');
const logo = document.querySelector('.logo');

// Modal Elements
const detailModal = document.getElementById('detail-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalSkeleton = document.getElementById('modal-skeleton');
const modalRealContent = document.getElementById('modal-real-content');
const movieDetailPoster = document.getElementById('movie-detail-poster');
const movieDetailTitle = document.getElementById('movie-detail-title');
const movieDetailPlot = document.getElementById('movie-detail-plot');
const movieSpecsBox = document.getElementById('movie-specs-box');
const movieScreenshots = document.getElementById('movie-screenshots');
const movieDownloads = document.getElementById('movie-downloads');
const screenshotsContainer = document.getElementById('screenshots-box-container');

// Video Player Elements
const playerBoxContainer = document.getElementById('player-box-container');
const videoPlayerIframe = document.getElementById('video-player-iframe');
const nativePlayerWrapper = document.getElementById('native-player-wrapper');
const nativeVideoPlayer = document.getElementById('native-video-player');
const iframePlayerWrapper = document.getElementById('iframe-player-wrapper');
const directServerBtn = document.getElementById('server-btn-direct');

// Video Player Loaders
const nativePlayerLoader = document.getElementById('native-player-loader');
const iframePlayerLoader = document.getElementById('iframe-player-loader');

function showNativeLoader() {
  if (nativePlayerLoader) nativePlayerLoader.style.display = 'flex';
}
function hideNativeLoader() {
  if (nativePlayerLoader) nativePlayerLoader.style.display = 'none';
}
function showIframeLoader() {
  if (iframePlayerLoader) iframePlayerLoader.style.display = 'flex';
}
function hideIframeLoader() {
  if (iframePlayerLoader) iframePlayerLoader.style.display = 'none';
}

// Intercept videoPlayerIframe src property changes to auto-manage iframe loader
if (videoPlayerIframe) {
  const originalSrcProp = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
  Object.defineProperty(videoPlayerIframe, 'src', {
    get() {
      return originalSrcProp.get.call(this);
    },
    set(val) {
      if (!val || val === '') {
        hideIframeLoader();
      } else {
        showIframeLoader();
      }
      originalSrcProp.set.call(this, val);
    }
  });

  // Hide loader when iframe finishes loading
  videoPlayerIframe.addEventListener('load', hideIframeLoader);
}

// Video Volume Booster (Web Audio API)
let audioCtx = null;
let gainNode = null;
let audioSource = null;

function boostVideoVolume(boostFactor = 2.5) {
  if (!nativeVideoPlayer) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      audioSource = audioCtx.createMediaElementSource(nativeVideoPlayer);
      audioSource.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      console.log('[Volume Booster] Initialized with 2.5x boost.');
    }
    gainNode.gain.value = boostFactor;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.error('[Volume Booster] Failed to initialize:', e);
  }
}

// Listen to native player events for loading/buffering loader
if (nativeVideoPlayer) {
  nativeVideoPlayer.addEventListener('waiting', showNativeLoader);
  nativeVideoPlayer.addEventListener('seeking', showNativeLoader);
  nativeVideoPlayer.addEventListener('loadstart', showNativeLoader);
  nativeVideoPlayer.addEventListener('playing', () => {
    hideNativeLoader();
    boostVideoVolume(2.5); // Auto boost to 250%
  });
  nativeVideoPlayer.addEventListener('canplay', hideNativeLoader);
  nativeVideoPlayer.addEventListener('seeked', hideNativeLoader);
  nativeVideoPlayer.addEventListener('error', hideNativeLoader);
}

// Hero elements
const heroBanner = document.getElementById('hero-banner');
const featuredTitle = document.getElementById('featured-title');
const featuredDesc = document.getElementById('featured-desc');
const featuredViewBtn = document.getElementById('featured-view-btn');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadMovies();
});

// Event Listeners Configuration
function setupEventListeners() {
  // Category tabs
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active states
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentCategory = btn.dataset.category;
      currentSearch = '';
      searchInput.value = '';
      currentPage = 1;
      
      // Update section header
      const catText = btn.textContent === 'Home' ? 'Latest Uploads' : btn.textContent;
      document.getElementById('section-title').innerHTML = `<i class="fa-solid fa-clapperboard"></i> ${catText}`;

      loadMovies();
    });
  });

  // Search trigger
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Logo home navigation
  logo.addEventListener('click', () => {
    catButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('.cat-btn[data-category=""]').classList.add('active');
    
    currentCategory = '';
    currentSearch = '';
    searchInput.value = '';
    currentPage = 1;
    document.getElementById('section-title').innerHTML = `<i class="fa-solid fa-clapperboard"></i> Latest Uploads`;
    
    loadMovies();
  });

  // Pagination triggers
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadMovies();
      scrollToMoviesSection();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (hasNextPage) {
      currentPage++;
      loadMovies();
      scrollToMoviesSection();
    }
  });

  // Modal closing triggers
  closeModalBtn.addEventListener('click', closeModal);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) {
      closeModal();
    }
  });

  // ESC key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailModal.classList.contains('open')) {
      closeModal();
    }
  });

  // Hero Featured View Button trigger
  featuredViewBtn.addEventListener('click', () => {
    if (firstMovieOnPage) {
      openDetailsModal(firstMovieOnPage.detailId, firstMovieOnPage.poster);
    }
  });

  // Server buttons click to switch sources
  const serverButtons = document.querySelectorAll('#player-servers .server-btn');
  serverButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all and add to clicked
      const btns = document.querySelectorAll('#player-servers .server-btn');
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.id === 'server-btn-direct') {
        // Direct Stream (Premium) now plays NetMirror!
        if (currentImdbId) {
          showPlayerToast('Loading Direct Stream (Premium)...');
          const fetchUrl = `${API_BASE_URL}/api/netmirror-stream?subjectid=${currentImdbId}&se=${currentMediaType === 'tv' ? currentSeason : 0}&ep=${currentMediaType === 'tv' ? currentEpisode : 0}&title=${encodeURIComponent(currentMovieData ? currentMovieData.title : '')}`;
          fetch(fetchUrl)
            .then(res => res.json())
            .then(data => {
              if (data.streamUrl) {
                iframePlayerWrapper.style.display = 'none';
                videoPlayerIframe.src = '';
                nativePlayerWrapper.style.display = 'block';
                nativeVideoPlayer.src = data.streamUrl.startsWith('/api/') ? API_BASE_URL + data.streamUrl : data.streamUrl;
                nativeVideoPlayer.load();
                nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
                startDirectStreamWatchdog();
              } else if (data.iframeUrl) {
                nativePlayerWrapper.style.display = 'none';
                nativeVideoPlayer.removeAttribute('src');
                nativeVideoPlayer.load();
                iframePlayerWrapper.style.display = 'block';
                videoPlayerIframe.src = data.iframeUrl.startsWith('/api/') ? API_BASE_URL + data.iframeUrl : data.iframeUrl;
              }
            })
            .catch(err => {
              console.error('Direct Stream (Premium) NetMirror load failed, falling back to original source:', err);
              // Fallback to original movie stream Url
              if (currentDirectStreamUrl) {
                iframePlayerWrapper.style.display = 'none';
                videoPlayerIframe.src = '';
                nativePlayerWrapper.style.display = 'block';
                nativeVideoPlayer.src = currentDirectStreamUrl;
                nativeVideoPlayer.load();
                nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
                startDirectStreamWatchdog();
              }
            });
        } else {
          // If no IMDb ID, fallback to original source
          iframePlayerWrapper.style.display = 'none';
          videoPlayerIframe.src = '';
          nativePlayerWrapper.style.display = 'block';
          if (currentDirectStreamUrl) {
            nativeVideoPlayer.src = currentDirectStreamUrl;
            nativeVideoPlayer.load();
            nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
            startDirectStreamWatchdog();
          }
        }
      } else {
        clearDirectStreamWatchdog();
        
        if (btn.id === 'server-btn-1') {
          // Server 1 now plays OkJatt!
          iframePlayerWrapper.style.display = 'none';
          videoPlayerIframe.src = '';
          nativePlayerWrapper.style.display = 'block';
          
          // Determine if it is a show episode or a movie
          const isShow = currentMediaType === 'tv';
          if (isShow && currentEpisodesList.length > 0) {
            const activeEp = currentEpisodesList[currentPlayingEpisodeIndex !== -1 ? currentPlayingEpisodeIndex : 0];
            if (activeEp) {
              showPlayerToast(`Loading Server 1 Episode: ${activeEp.title}...`);
              const epId = activeEp.url.split('?id=')[1] || btoa(activeEp.url);
              const fetchUrl = `${API_BASE_URL}/api/episode-stream?id=${epId}`;
              fetch(fetchUrl)
                .then(res => res.json())
                .then(data => {
                  if (data.streamUrl) {
                    nativeVideoPlayer.src = data.streamUrl.startsWith('/api/') ? API_BASE_URL + data.streamUrl : data.streamUrl;
                    nativeVideoPlayer.load();
                    nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
                    startDirectStreamWatchdog();
                  }
                })
                .catch(err => console.error('Failed to load Server 1 OkJatt episode stream:', err));
            }
          } else {
            // Play Movie
            if (currentDirectStreamUrl) {
              showPlayerToast('Loading Server 1 Movie...');
              nativeVideoPlayer.src = currentDirectStreamUrl;
              nativeVideoPlayer.load();
              nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
              startDirectStreamWatchdog();
            }
          }
        } else {
          // Servers 2, 3, 4 (Iframe embeds)
          nativePlayerWrapper.style.display = 'none';
          nativeVideoPlayer.pause();
          nativeVideoPlayer.removeAttribute('src');
          nativeVideoPlayer.load();
          iframePlayerWrapper.style.display = 'block';

          if (currentImdbId) {
            let prefix = btn.dataset.srcPrefix;
            if (currentMediaType === 'tv') {
              if (prefix.includes('multiembed.mov')) {
                videoPlayerIframe.src = `${prefix}${currentImdbId}&s=${currentSeason}&e=${currentEpisode}`;
              } else {
                prefix = prefix.replace('/movie/', '/tv/');
                videoPlayerIframe.src = `${prefix}${currentImdbId}/${currentSeason}/${currentEpisode}`;
              }
            } else {
              videoPlayerIframe.src = `${prefix}${currentImdbId}`;
            }
          }
        }
      }
    });
  });

  // Aspect ratio switcher triggers
  const aspectButtons = document.querySelectorAll('#player-aspects .aspect-btn');
  aspectButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active states
      aspectButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const aspect = btn.dataset.aspect;
      applyPlayerAspectRatio(aspect);
    });
  });

  // Episode Navigation Event Listeners
  document.getElementById('ep-prev-btn').addEventListener('click', () => {
    if (currentPlayingEpisodeIndex > 0) {
      const prevIndex = currentPlayingEpisodeIndex - 1;
      const ep = currentEpisodesList[prevIndex];
      playEpisode(ep.url, ep.title);
    }
  });

  document.getElementById('ep-next-btn').addEventListener('click', () => {
    if (currentPlayingEpisodeIndex !== -1 && currentPlayingEpisodeIndex < currentEpisodesList.length - 1) {
      const nextIndex = currentPlayingEpisodeIndex + 1;
      const ep = currentEpisodesList[nextIndex];
      playEpisode(ep.url, ep.title);
    } else if (currentPlayingEpisodeIndex === -1 && currentEpisodesList.length > 0) {
      const ep = currentEpisodesList[0];
      playEpisode(ep.url, ep.title);
    }
  });

  // Brightness Slider Control Listener
  const brightnessSlider = document.getElementById('player-brightness-slider');
  const brightnessLabel = document.getElementById('brightness-value-label');
  if (brightnessSlider && brightnessLabel) {
    brightnessSlider.addEventListener('input', (e) => {
      const value = e.target.value;
      brightnessLabel.textContent = `${value}%`;
      const valDecimal = value / 100;
      nativePlayerWrapper.style.filter = `brightness(${valDecimal})`;
      iframePlayerWrapper.style.filter = `brightness(${valDecimal})`;
    });
  }

  // Auto-play next episode when current episode ends
  nativeVideoPlayer.addEventListener('ended', () => {
    if (currentEpisodesList.length > 0 && currentPlayingEpisodeIndex !== -1 && currentPlayingEpisodeIndex < currentEpisodesList.length - 1) {
      showPlayerToast('Episode finished. Autoplay next episode in 3 seconds...');
      setTimeout(() => {
        const nextIndex = currentPlayingEpisodeIndex + 1;
        const nextEp = currentEpisodesList[nextIndex];
        
        const epBtns = document.querySelectorAll('.episode-item-btn');
        if (epBtns.length > nextIndex) {
          epBtns.forEach(b => b.classList.remove('active'));
          epBtns[nextIndex].classList.add('active');
        }
        
        playEpisode(nextEp.url, nextEp.title);
      }, 3000);
    }
  });

  // Native Video Player error handler to assist debugging
  nativeVideoPlayer.addEventListener('error', () => {
    // Only handle error if direct stream is currently selected/active
    const activeBtn = document.querySelector('#player-servers .server-btn.active');
    if (!activeBtn || activeBtn.id !== 'server-btn-direct') {
      return;
    }

    // Only handle error if the modal is actually open and video has a valid direct source attribute
    const rawSrc = nativeVideoPlayer.getAttribute('src');
    if (!detailModal.classList.contains('open') || !rawSrc || rawSrc === '' || nativeVideoPlayer.src === window.location.href) {
      return;
    }

    const err = nativeVideoPlayer.error;
    let message = 'Unknown playback error.';
    if (err) {
      switch (err.code) {
        case 1: message = 'Playback aborted by user/client request.'; break;
        case 2: message = 'Network error while loading video stream.'; break;
        case 3: message = 'Video decoding failed. The format or codec (like AC3/DTS audio) is not supported by your browser.'; break;
        case 4: message = 'Video stream source format not supported.'; break;
      }
      console.error(`Native video error [Code ${err.code}]: ${message}`, err);
      
      // Stop further loading and error events on the native player immediately
      nativeVideoPlayer.removeAttribute('src');
      try {
        nativeVideoPlayer.load();
      } catch(e) {}

      // Keep external player container visible so the user can still click it if the browser fails
      const extPlayerContainer = document.getElementById('external-player-container');
      if (extPlayerContainer) {
        // Keep it visible
      }

      // Tell user to play in VLC/MX Player or switch manually instead of auto-switching
      const isFormatError = err.code === 3 || err.code === 4;
      if (isFormatError) {
        showPlayerToast('Format not supported by browser. Play in VLC/MX Player or choose Server 1.');
      } else {
        showPlayerToast('Playback failed. Try VLC/MX Player or switch to Server 1/2/3/4.');
      }
    }
  });

  // Floating player audio trigger toggle
  const floatingAudioTrigger = document.getElementById('player-floating-audio-trigger');
  const floatingAudioMenu = document.getElementById('player-floating-audio-menu');
  if (floatingAudioTrigger && floatingAudioMenu) {
    floatingAudioTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      floatingAudioMenu.classList.toggle('open');
    });
    
    document.addEventListener('click', () => {
      floatingAudioMenu.classList.remove('open');
    });
  }
}

function scrollToMoviesSection() {
  document.querySelector('.movies-section').scrollIntoView({ behavior: 'smooth' });
}

function performSearch() {
  const query = searchInput.value.trim();
  const searchCat = document.getElementById('search-category') ? document.getElementById('search-category').value : 'all';
  if (query) {
    currentSearch = query;
    currentCategory = '';
    currentPage = 1;
    currentSearchCategory = searchCat;

    // Deselect category buttons
    catButtons.forEach(b => b.classList.remove('active'));

    document.getElementById('section-title').innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Search Results for: "${query}" (${searchCat === 'all' ? 'All Categories' : searchCat})`;
    loadMovies(searchCat);
  }
}

// Load Movies list from Express Server API
async function loadMovies(searchCat = 'all') {
  currentSearchCategory = searchCat;
  showLoader();
  try {
    const url = `${API_BASE_URL}/api/movies?page=${currentPage}&s=${encodeURIComponent(currentSearch)}&category=${currentCategory}&search_category=${currentSearchCategory}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 503) {
        // Render or backend spinning up
        moviesGrid.innerHTML = `
          <div class="no-results error-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <h3>Server is Spinning Up</h3>
            <p>The scraper backend is starting up. This can take up to 60 seconds on free hosting. Retrying in 5 seconds...</p>
          </div>
        `;
        setTimeout(loadMovies, 5000);
        return;
      }
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();

    if (data.movies && data.movies.length > 0) {
      renderMovies(data.movies);
      hasNextPage = data.hasNextPage;
      firstMovieOnPage = data.movies[0];
      
      // Dynamically update hero banner background and content on page 1
      if (currentPage === 1 && !currentSearch) {
        updateHeroBanner(firstMovieOnPage);
      }
    } else {
      moviesGrid.innerHTML = `
        <div class="no-results">
          <i class="fa-solid fa-face-frown"></i>
          <h3>No Movies Found</h3>
          <p>We couldn't find anything matching your request. Please try another search or category.</p>
        </div>
      `;
      hasNextPage = false;
      firstMovieOnPage = null;
    }

    updatePaginationDisplay();
  } catch (error) {
    console.error('Failed to load movies:', error);
    moviesGrid.innerHTML = `
      <div class="no-results error-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Connection Error</h3>
        <p>Something went wrong while connecting to the scraper backend server. Please try again later.</p>
      </div>
    `;
    hasNextPage = false;
  } finally {
    hideLoader();
  }
}

function updateHeroBanner(movie) {
  if (movie) {
    // If it has poster, apply as background gradient image
    heroBanner.style.backgroundImage = `linear-gradient(90deg, rgba(7, 6, 11, 0.95) 0%, rgba(7, 6, 11, 0.5) 100%), url(${movie.poster})`;
    heroBanner.style.backgroundSize = 'cover';
    heroBanner.style.backgroundPosition = 'center 20%';
    featuredTitle.textContent = movie.title;
    featuredDesc.textContent = `Now streaming in full high-definition. Access complete download mirrors, screenshots, and audio track details.`;
    featuredViewBtn.style.display = 'inline-flex';
  } else {
    // Default hero style
    heroBanner.style.backgroundImage = 'none';
    featuredTitle.textContent = 'Explore Premium Cinema & Anime';
    featuredDesc.textContent = 'Stream and download the latest high-quality Bollywood, Hollywood, South Indian movies, and Web series. Zero redirects on searches, hidden origin links, absolute privacy.';
    featuredViewBtn.style.display = 'none';
  }
}

// Render cards inside Grid
function renderMovies(movies) {
  moviesGrid.innerHTML = '';
  
  movies.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    
    // Check if poster is empty, fallback placeholder
    const posterSrc = movie.poster || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=300';

    card.innerHTML = `
      <div class="poster-wrapper">
        <img src="${posterSrc}" alt="${movie.title}" loading="lazy">
        <div class="card-hover-overlay">
          <div class="play-icon-glow">
            <i class="fa-solid fa-play"></i>
          </div>
        </div>
      </div>
      <div class="movie-info">
        <div class="movie-title" title="${movie.title}">${movie.title}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      openDetailsModal(movie.detailId, posterSrc);
    });

    moviesGrid.appendChild(card);
  });
}

// Show details modal and scrape specific page
async function openDetailsModal(detailId, posterUrl) {
  // Reset modal display states
  detailModal.classList.add('open');
  modalSkeleton.style.display = 'grid';
  modalRealContent.style.display = 'none';
  document.body.style.overflow = 'hidden'; // Lock background scroll

  // Push state to browser history for Android Back Button modal close support
  history.pushState({ modalOpen: true }, '', '#movie-details');

  try {
    const response = await fetch(`${API_BASE_URL}/api/movie-details?id=${detailId}`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || `HTTP ${response.status}`);
    }
    const movie = await response.json();
    currentMovieData = movie; // Store globally
    
    // Initial populate of quality/audio controls based on default release title
    updateQualityAndAudioSelectorsForPlaying(movie.title);

    // Populate Details
    movieDetailPoster.src = posterUrl || (movie.screenshots && movie.screenshots[0]) || '';
    movieDetailPoster.alt = movie.title;
    movieDetailTitle.textContent = movie.title;
    
    // Synopsis
    movieDetailPlot.textContent = movie.plot || 'No synopsis found for this release.';

    // Technical specifications info block HTML
    if (movie.infoHtml) {
      movieSpecsBox.style.display = 'block';
      movieSpecsBox.innerHTML = movie.infoHtml;
    } else {
      movieSpecsBox.style.display = 'none';
    }

    // Screenshots list
    movieScreenshots.innerHTML = '';
    if (movie.screenshots && movie.screenshots.length > 0) {
      screenshotsContainer.style.display = 'block';
      movie.screenshots.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Movie Screenshot';
        img.loading = 'lazy';
        // Add full screen zoom view click handler
        img.addEventListener('click', () => {
          window.open(src, '_blank');
        });
        movieScreenshots.appendChild(img);
      });
    } else {
      screenshotsContainer.style.display = 'none';
    }

    // Determine if it is a TV show/Anime series
    const lowerTitle = movie.title.toLowerCase();
    const isShow = currentCategory === 'tv-show' || 
                   currentCategory === 'web-series' || 
                   currentCategory === 'anime' ||
                   lowerTitle.includes('season') || 
                   /\bs\d+/i.test(lowerTitle) ||
                   /\bep\d+/i.test(lowerTitle) ||
                   lowerTitle.includes('complete') ||
                   lowerTitle.includes('added');

    // Reset iframe buttons display style back to visible
    const allServerBtns = document.querySelectorAll('#player-servers .server-btn');
    allServerBtns.forEach(btn => {
      if (btn.id !== 'server-btn-direct') {
        btn.style.display = 'inline-block';
      }
    });

    // Dynamic Download Links listing
    movieDownloads.innerHTML = '';
    if (movie.downloads && movie.downloads.length > 0) {
      movie.downloads.forEach(dwd => {
        const item = document.createElement('div');
        item.className = 'dwd-item';
        
        const isSample = dwd.title.toLowerCase().includes('sample');

        if (!isSample) {
          const resolvedDwdUrl = dwd.url.startsWith('/api/') ? API_BASE_URL + dwd.url : dwd.url;
          let streamPlayUrl = dwd.url;
          if (dwd.url.includes('/api/download')) {
            streamPlayUrl = dwd.url.replace('/api/download', '/api/stream-play');
          }
          const absoluteStreamPlayUrl = streamPlayUrl.startsWith('/api/') ? window.location.origin + streamPlayUrl : streamPlayUrl;
          const intentUrl = `intent:${absoluteStreamPlayUrl}#Intent;action=android.intent.action.VIEW;type=video/*;end`;

          item.innerHTML = `
            <div class="dwd-lbl" title="${dwd.title}">${dwd.title}</div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <button class="play-ep-btn" data-url="${streamPlayUrl}" data-title="${dwd.title}" style="padding: 8px 12px; font-size: 13px;">
                <i class="fa-solid fa-circle-play"></i> Play Online
              </button>
              <a href="${intentUrl}" class="play-vlc-btn" style="padding: 8px 12px; font-size: 13px; background: linear-gradient(135deg, #ff9900, #ff5500); color: white; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; box-shadow: 0 2px 8px rgba(255, 85, 0, 0.3);">
                <i class="fa-solid fa-up-right-from-square"></i> Play in VLC/MX
              </a>
              <a href="${resolvedDwdUrl}" class="dwd-btn-action" target="_blank" style="padding: 8px 12px; font-size: 13px;">
                <i class="fa-solid fa-circle-down"></i> Download
              </a>
            </div>
          `;
          
          // Attach Play handler
          const playBtn = item.querySelector('.play-ep-btn');
          playBtn.addEventListener('click', () => {
            const epUrl = playBtn.dataset.url;
            const epTitle = playBtn.dataset.title;
            playEpisode(epUrl, epTitle);
          });
        } else {
          const resolvedDwdUrl = dwd.url.startsWith('/api/') ? API_BASE_URL + dwd.url : dwd.url;
          item.innerHTML = `
            <div class="dwd-lbl" title="${dwd.title}">${dwd.title}</div>
            <a href="${resolvedDwdUrl}" class="dwd-btn-action" target="_blank">
              <i class="fa-solid fa-circle-down"></i> Download Sample
            </a>
          `;
        }
        movieDownloads.appendChild(item);
      });
    } else {
      movieDownloads.innerHTML = `
        <div class="no-links-msg">
          <i class="fa-solid fa-circle-xmark"></i>
          <span>No download links could be parsed for this release.</span>
        </div>
      `;
    }

    let hasEpisodes = movie.downloads && movie.downloads.some(d => d.isEpisode);
    
    if (!hasEpisodes && isShow && movie.downloads && movie.downloads.length > 0) {
      let numEpisodes = 12; // default fallback
      const allEpMatch = movie.title.match(/all episodes/i);
      if (allEpMatch) {
        numEpisodes = 24;
      } else {
        const epAddedMatch = movie.title.match(/(?:ep|episode)\s*[-–]?\s*(\d+)\s+added/i);
        const epRangeMatch = movie.title.match(/(?:ep|episode)\s*[-–]?\s*(\d+)\s*to\s*(\d+)\s+added/i);
        if (epRangeMatch) {
          numEpisodes = parseInt(epRangeMatch[2]);
        } else if (epAddedMatch) {
          numEpisodes = parseInt(epAddedMatch[1]);
        }
      }
      
      let season = 1;
      const sMatch = movie.title.match(/season\s*(\d+)/i);
      if (sMatch) {
        season = parseInt(sMatch[1]);
      }
      
      const virtualDownloads = [];
      for (let i = 1; i <= numEpisodes; i++) {
        virtualDownloads.push({
          title: `Episode ${i} [Season ${season}]`,
          url: `virtual-ep-s${season}-e${i}`,
          isEpisode: true
        });
      }
      movie.downloads = [...virtualDownloads, ...movie.downloads];
      hasEpisodes = true;
    }

    // Save current episodes list (include all actual episode links + all non-sample downloads if it is a show)
    currentEpisodesList = [];
    if (movie.downloads) {
      currentEpisodesList = movie.downloads.filter(d => (d.isEpisode || isShow) && !d.title.toLowerCase().includes('sample'));
    }

    // Toggle Episode Navigation Bar
    const epNavBar = document.getElementById('episode-nav-bar');
    if (currentEpisodesList.length > 1) {
      epNavBar.style.display = 'flex';
      currentPlayingEpisodeIndex = -1;
      updateEpisodeNavButtons();
    } else {
      epNavBar.style.display = 'none';
    }

    // Set up Video Player
    let hasPlayer = false;
    let streamOnline = movie.streamUrl ? true : false;

    // Configure Player (Direct Stream)
    directServerBtn.style.display = 'inline-block';
    if ((movie.streamUrl && streamOnline) || hasEpisodes) {
      const resolvedStreamUrl = movie.streamUrl ? (movie.streamUrl.startsWith('/api/') ? API_BASE_URL + movie.streamUrl : movie.streamUrl) : '';
      currentDirectStreamUrl = resolvedStreamUrl;
      hasPlayer = true;
      if (resolvedStreamUrl && !resolvedStreamUrl.includes('/api/netmirror-stream')) {
        nativeVideoPlayer.src = resolvedStreamUrl;
        nativeVideoPlayer.load();
        nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
      }
    } else {
      currentDirectStreamUrl = null;
      nativeVideoPlayer.removeAttribute('src');
      nativeVideoPlayer.load();
    }

    if (movie.imdbId || hasEpisodes) {
      if (movie.imdbId) {
        currentImdbId = movie.imdbId;
        
        // Determine if it is a show
        const lowerTitle = movie.title.toLowerCase();
        const isShow = currentCategory === 'tv-show' || 
                       currentCategory === 'web-series' || 
                       lowerTitle.includes('season') || 
                       /\bs\d+/i.test(lowerTitle) ||
                       /\bep\d+/i.test(lowerTitle) ||
                       lowerTitle.includes('complete');
                       
        currentMediaType = isShow ? 'tv' : 'movie';
      } else {
        currentImdbId = null;
        currentMediaType = 'tv';
      }
      hasPlayer = true;
    } else if (!movie.streamUrl || !streamOnline) {
      currentImdbId = null;
    }

    if (hasPlayer) {
      playerBoxContainer.style.display = 'block';
      
      // Set active player state based on availability
      const btns = document.querySelectorAll('#player-servers .server-btn');
      btns.forEach(btn => btn.classList.remove('active'));
      
      if (currentEpisodesList.length > 0) {
        // Default to Direct Stream (Premium) and auto-play the first episode
        directServerBtn.classList.add('active');
        playEpisode(currentEpisodesList[0].url, currentEpisodesList[0].title);
      } else if (movie.streamUrl && streamOnline) {
        // Direct stream default (user preference)
        directServerBtn.classList.add('active');
        if (movie.streamUrl.includes('/api/netmirror-stream')) {
          const resolvedStreamUrl = movie.streamUrl.startsWith('/api/') ? API_BASE_URL + movie.streamUrl : movie.streamUrl;
          fetch(resolvedStreamUrl)
            .then(res => res.json())
            .then(data => {
              if (data.streamUrl) {
                iframePlayerWrapper.style.display = 'none';
                videoPlayerIframe.src = '';
                nativePlayerWrapper.style.display = 'block';
                nativeVideoPlayer.src = data.streamUrl.startsWith('/api/') ? API_BASE_URL + data.streamUrl : data.streamUrl;
                nativeVideoPlayer.load();
                nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
                startDirectStreamWatchdog();
              } else if (data.iframeUrl) {
                nativePlayerWrapper.style.display = 'none';
                nativeVideoPlayer.removeAttribute('src');
                nativeVideoPlayer.load();
                iframePlayerWrapper.style.display = 'block';
                videoPlayerIframe.src = data.iframeUrl.startsWith('/api/') ? API_BASE_URL + data.iframeUrl : data.iframeUrl;
              }
            })
            .catch(err => console.error('Failed to load NetMirror movie stream:', err));
        } else {
          iframePlayerWrapper.style.display = 'none';
          videoPlayerIframe.src = '';
          nativePlayerWrapper.style.display = 'block';
          if (currentDirectStreamUrl) {
            nativeVideoPlayer.src = currentDirectStreamUrl;
            nativeVideoPlayer.load();
            nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
          }
          startDirectStreamWatchdog();
        }
      } else if (currentImdbId) {
        // Fallback to first available iframe server
        const firstIframeBtn = document.querySelector('.server-btn[data-src-prefix]');
        if (firstIframeBtn) {
          firstIframeBtn.classList.add('active');
          let prefix = firstIframeBtn.dataset.srcPrefix;
          if (currentMediaType === 'tv') {
            prefix = prefix.replace('/movie/', '/tv/');
          }
          videoPlayerIframe.src = `${prefix}${currentImdbId}`;
        }
        nativePlayerWrapper.style.display = 'none';
        iframePlayerWrapper.style.display = 'block';
      } else {
        // Missing IMDb ID and direct stream is down/offline, but show contains play online episodes!
        nativePlayerWrapper.style.display = 'block';
        iframePlayerWrapper.style.display = 'none';
        videoPlayerIframe.src = '';
        nativeVideoPlayer.removeAttribute('src');
        nativeVideoPlayer.load();
        
        // Hide iframe server buttons since IMDb is missing
        const iframeBtns = document.querySelectorAll('#player-servers .server-btn[data-src-prefix]');
        iframeBtns.forEach(btn => {
          btn.style.display = 'none';
        });
      }
    } else {
      playerBoxContainer.style.display = 'none';
      nativePlayerWrapper.style.display = 'none';
      iframePlayerWrapper.style.display = 'none';
    }

    // Populate Quality & Audio options for movies
    if (currentEpisodesList.length === 0) {
      populateQualityOptions(movie.downloads, false);
      populateAudioOptions(movie.downloads);
    } else {
      document.getElementById('player-quality-container').style.display = 'none';
      document.getElementById('player-audio-container').style.display = 'none';
    }

    // Switch display from skeleton to real content
    modalSkeleton.style.display = 'none';
    modalRealContent.style.display = 'block';
  } catch (error) {
    console.error('Failed to load movie details:', error);
    closeModal();
    alert(`Failed to load movie details: ${error.message}`);
  }
}

function closeModal() {
  detailModal.classList.remove('open');
  document.body.style.overflow = 'auto'; // Restore background scroll
  
  // Reset quality selector
  const qContainer = document.getElementById('player-quality-container');
  if (qContainer) qContainer.style.display = 'none';
  const qOptions = document.getElementById('player-quality-options');
  if (qOptions) qOptions.innerHTML = '';

  // Reset audio selector
  const aContainer = document.getElementById('player-audio-container');
  if (aContainer) aContainer.style.display = 'none';
  const aOptions = document.getElementById('player-audio-options');
  if (aOptions) aOptions.innerHTML = '';

  // Reset brightness UI
  const brightnessSlider = document.getElementById('player-brightness-slider');
  const brightnessLabel = document.getElementById('brightness-value-label');
  if (brightnessSlider && brightnessLabel) {
    brightnessSlider.value = 100;
    brightnessLabel.textContent = '100%';
    nativePlayerWrapper.style.filter = 'none';
    iframePlayerWrapper.style.filter = 'none';
  }

  // Reset video player state to stop background audio playback
  clearDirectStreamWatchdog();
  videoPlayerIframe.src = '';
  nativeVideoPlayer.pause();
  nativeVideoPlayer.src = '';
  currentImdbId = null;

  // Reset aspect ratio UI state
  const aspectButtons = document.querySelectorAll('#player-aspects .aspect-btn');
  aspectButtons.forEach(btn => btn.classList.remove('active'));
  const fitBtn = document.querySelector('#player-aspects .aspect-btn[data-aspect="fit"]');
  if (fitBtn) fitBtn.classList.add('active');
  applyPlayerAspectRatio('fit');

  // If closed manually and hash exists, go back in history to clear hash
  if (window.location.hash === '#movie-details') {
    history.back();
  }
}

// Global popstate event handler for browser / Android Back Button modal close support
window.addEventListener('popstate', (event) => {
  if (detailModal.classList.contains('open')) {
    detailModal.classList.remove('open');
    document.body.style.overflow = 'auto';
    videoPlayerIframe.src = '';
    nativeVideoPlayer.pause();
    nativeVideoPlayer.src = '';
    currentImdbId = null;
  }
});

function applyPlayerAspectRatio(aspect) {
  const wrappers = [nativePlayerWrapper, iframePlayerWrapper];
  const ratioClasses = ['ratio-16-9', 'ratio-21-9', 'ratio-4-3', 'ratio-stretch', 'ratio-zoom'];
  
  wrappers.forEach(wrapper => {
    if (wrapper) {
      ratioClasses.forEach(cls => wrapper.classList.remove(cls));
      if (aspect !== 'fit') {
        wrapper.classList.add(`ratio-${aspect}`);
      }
    }
  });

  if (nativeVideoPlayer) {
    if (aspect === 'stretch') {
      nativeVideoPlayer.style.objectFit = 'fill';
    } else if (aspect === 'zoom') {
      nativeVideoPlayer.style.objectFit = 'cover';
    } else {
      nativeVideoPlayer.style.objectFit = 'contain';
    }
  }
}

function showLoader() {
  moviesGrid.style.display = 'none';
  skeletonLoader.style.display = 'grid';
  pagination.style.display = 'none';
}

function hideLoader() {
  skeletonLoader.style.display = 'none';
  moviesGrid.style.display = 'grid';
  pagination.style.display = 'flex';
}

function updatePaginationDisplay() {
  pageNumDisplay.textContent = `Page ${currentPage}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = !hasNextPage;
}

// Custom Glassmorphic Toast Notification for Player
function showPlayerToast(message) {
  // Check if there is an existing toast, remove it
  const existingToast = document.getElementById('player-toast-notification');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'player-toast-notification';
  toast.innerHTML = `<i class="fa-solid fa-circle-info" style="color: #00f2fe; margin-right: 8px;"></i>${message}`;
  
  // Apply beautiful glassmorphic CSS styles
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: 'rgba(18, 16, 28, 0.85)',
    backdropFilter: 'blur(10px)',
    '-webkit-backdrop-filter': 'blur(10px)',
    color: '#f3f3f5',
    padding: '12px 24px',
    borderRadius: '30px',
    border: '1px solid rgba(130, 87, 229, 0.4)',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(130, 87, 229, 0.2)',
    zIndex: '9999',
    fontSize: '0.9rem',
    fontWeight: '500',
    fontFamily: "'Outfit', sans-serif",
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: '0'
  });

  document.body.appendChild(toast);

  // Trigger animation (reflow + style update)
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 10);

  // Remove toast after 3.5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// Populate quality options and audio languages selector dynamically
function updateQualityAndAudioSelectorsForPlaying(currentTitle) {
  const qualityContainer = document.getElementById('player-quality-container');
  const qualityOptions = document.getElementById('player-quality-options');
  const audioContainer = document.getElementById('player-audio-container');
  const audioOptions = document.getElementById('player-audio-options');

  if (!qualityContainer || !qualityOptions || !audioContainer || !audioOptions) return;

  // Reset display
  qualityContainer.style.display = 'none';
  qualityOptions.innerHTML = '';
  audioContainer.style.display = 'none';
  audioOptions.innerHTML = '';

  if (!currentMovieData || !currentMovieData.downloads || currentMovieData.downloads.length === 0) return;

  // Extract episode number/id if any (e.g. "Episode 1", "Ep 01")
  let epMatch = currentTitle.match(/(?:ep|episode)\s*[-–]?\s*(\d+)/i);
  let epNum = epMatch ? epMatch[1] : null;

  // Filter downloads that match this episode (or match all if it's a single movie)
  const validDownloads = currentMovieData.downloads.filter(d => {
    if (d.title.toLowerCase().includes('sample')) return false;
    if (epNum) {
      const match = d.title.match(/(?:ep|episode)\s*[-–]?\s*(\d+)/i);
      return match && match[1] === epNum;
    }
    return true;
  });

  // 1. Group & parse qualities
  const qualities = [];
  validDownloads.forEach(d => {
    const titleLower = d.title.toLowerCase();
    let qLabel = null;
    if (titleLower.includes('2160p') || titleLower.includes('4k')) qLabel = '4K (2160p)';
    else if (titleLower.includes('1080p')) qLabel = '1080p (FHD)';
    else if (titleLower.includes('720p')) qLabel = '720p (HD)';
    else if (titleLower.includes('480p')) qLabel = '480p (SD)';
    else if (titleLower.includes('540p')) qLabel = '540p';

    if (qLabel && !qualities.some(q => q.label === qLabel)) {
      qualities.push({ label: qLabel, url: d.url, title: d.title });
    }
  });

  const order = ['4K (2160p)', '1080p (FHD)', '720p (HD)', '540p', '480p (SD)'];
  qualities.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));

  if (qualities.length > 1) {
    qualityContainer.style.display = 'block';
    qualities.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'quality-btn';
      btn.textContent = q.label;
      if (q.title === currentTitle) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        qualityOptions.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        let streamPlayUrl = q.url;
        if (q.url.includes('/api/download')) {
          streamPlayUrl = q.url.replace('/api/download', '/api/stream-play');
        }
        playEpisode(streamPlayUrl, q.title);
      });
      qualityOptions.appendChild(btn);
    });
  }

  // 2. Group & parse audio languages
  const audios = [];
  validDownloads.forEach(d => {
    const titleLower = d.title.toLowerCase();
    let langLabel = null;
    if (titleLower.includes('dual audio') || (titleLower.includes('hindi') && titleLower.includes('english'))) {
      langLabel = 'Dual Audio [Hindi+Eng]';
    } else if (titleLower.includes('hindi')) {
      langLabel = 'Hindi';
    } else if (titleLower.includes('english') || titleLower.includes('eng')) {
      langLabel = 'English';
    } else if (titleLower.includes('tamil')) {
      langLabel = 'Tamil';
    } else if (titleLower.includes('telugu')) {
      langLabel = 'Telugu';
    } else if (titleLower.includes('japanese') || titleLower.includes('jap')) {
      langLabel = 'Japanese';
    }

    if (langLabel && !audios.some(a => a.label === langLabel)) {
      audios.push({ label: langLabel, url: d.url, title: d.title });
    }
  });

  const floatingAudioContainer = document.getElementById('player-floating-audio-container');
  const floatingAudioMenu = document.getElementById('player-floating-audio-menu');
  if (floatingAudioContainer && floatingAudioMenu) {
    floatingAudioContainer.style.display = 'none';
    floatingAudioMenu.innerHTML = '';
  }

  if (audios.length > 1) {
    audioContainer.style.display = 'block';
    if (floatingAudioContainer && floatingAudioMenu) {
      floatingAudioContainer.style.display = 'block';
    }
    
    audios.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'audio-btn';
      btn.textContent = a.label;
      if (a.title === currentTitle) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        audioOptions.querySelectorAll('.audio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        let streamPlayUrl = a.url;
        if (a.url.includes('/api/download')) {
          streamPlayUrl = a.url.replace('/api/download', '/api/stream-play');
        }
        playEpisode(streamPlayUrl, a.title);
      });
      audioOptions.appendChild(btn);

      // Populate floating player dropdown menu
      if (floatingAudioMenu) {
        const item = document.createElement('div');
        item.className = 'player-floating-audio-item';
        if (a.title === currentTitle) {
          item.classList.add('active');
        }
        item.innerHTML = `<span>${a.label}</span> <i class="fa-solid fa-check check-icon"></i>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          floatingAudioMenu.querySelectorAll('.player-floating-audio-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          floatingAudioMenu.classList.remove('open');
          
          let streamPlayUrl = a.url;
          if (a.url.includes('/api/download')) {
            streamPlayUrl = a.url.replace('/api/download', '/api/stream-play');
          }
          playEpisode(streamPlayUrl, a.title);
        });
        floatingAudioMenu.appendChild(item);
      }
    });
  } else {
    // If it's a single file dual audio, show helpful information
    const isDualAudioFile = currentTitle.toLowerCase().includes('dual audio') || 
                            currentTitle.toLowerCase().includes('multi audio') ||
                            currentTitle.toLowerCase().includes('hindi') && (currentTitle.toLowerCase().includes('english') || currentTitle.toLowerCase().includes('tamil') || currentTitle.toLowerCase().includes('telugu')) ||
                            currentMovieData.title.toLowerCase().includes('dual audio') ||
                            currentMovieData.title.toLowerCase().includes('multi audio');
    if (isDualAudioFile) {
      audioContainer.style.display = 'block';
      audioOptions.innerHTML = `<span style="font-size: 13px; color: #aaa; line-height: 1.4;"><i class="fa-solid fa-circle-info"></i> Dual Audio tracks are natively selectable in VLC / MX Player. Click <strong>"Play in VLC/MX"</strong> below to choose audio language.</span>`;
    }
  }
}

// Play Episode on-demand handler
async function playEpisode(epUrl, epTitle) {
  // Update quality and audio selector buttons for the playing stream
  updateQualityAndAudioSelectorsForPlaying(epTitle);

  // Update currently playing index
  const idx = currentEpisodesList.findIndex(d => d.url === epUrl);
  if (idx !== -1) {
    currentPlayingEpisodeIndex = idx;
  } else {
    currentPlayingEpisodeIndex = currentEpisodesList.findIndex(d => d.title === epTitle);
  }
  updateEpisodeNavButtons();

  showPlayerToast(`Loading Episode: ${epTitle}...`);
  
  // Parse Season and Episode
  let season = 1;
  let episode = 1;
  
  if (epUrl.startsWith('virtual-ep-')) {
    const parts = epUrl.split('-');
    season = parseInt(parts[2].replace('s', ''));
    episode = parseInt(parts[3].replace('e', ''));
    
    const activeServerBtn = document.querySelector('#player-servers .server-btn.active');
    const serverId = activeServerBtn ? activeServerBtn.id : '';
    if (serverId === 'server-btn-direct') {
      showPlayerToast('Direct stream unavailable for virtual links. Switching to Server 1...');
      const server1Btn = document.querySelector('#player-servers .server-btn[data-src-prefix]');
      if (server1Btn) {
        server1Btn.click();
        setTimeout(() => playEpisode(epUrl, epTitle), 100);
        return;
      }
    }
  } else {
    const sMatch = epTitle.match(/s(\d+)|season\s*(\d+)/i);
    if (sMatch) {
      season = parseInt(sMatch[1] || sMatch[2]);
    }
    const eMatch = epTitle.match(/ep(\d+)|episode\s*(\d+)/i);
    if (eMatch) {
      episode = parseInt(eMatch[1] || eMatch[2]);
    }
  }
  
  currentSeason = season;
  currentEpisode = episode;

  console.log(`[Player] Playing Episode: Season ${season}, Episode ${episode}`);
  
  // Ensure player container is visible
  playerBoxContainer.style.display = 'block';
  
  // Smooth scroll to video player
  document.getElementById('player-box-container').scrollIntoView({ behavior: 'smooth' });

  const directBtn = document.getElementById('server-btn-direct');
  if (directBtn && !epUrl.startsWith('virtual-ep-')) {
    const allBtns = document.querySelectorAll('#player-servers .server-btn');
    allBtns.forEach(b => b.classList.remove('active'));
    directBtn.classList.add('active');
  }

  const activeServerBtn = document.querySelector('#player-servers .server-btn.active');
  const serverId = activeServerBtn ? activeServerBtn.id : '';

  if (serverId === 'server-btn-direct' || serverId === 'server-btn-1') {
    try {
      let fetchUrl = '';
      if (serverId === 'server-btn-direct') {
        if (currentImdbId) {
          fetchUrl = `${API_BASE_URL}/api/netmirror-stream?subjectid=${currentImdbId}&se=${season}&ep=${episode}&title=${encodeURIComponent(currentMovieData ? currentMovieData.title : '')}`;
        } else if (epUrl.includes('/api/netmirror-stream')) {
          fetchUrl = epUrl;
        } else {
          const epId = epUrl.split('?id=')[1] || btoa(epUrl);
          fetchUrl = `${API_BASE_URL}/api/episode-stream?id=${epId}`;
        }
      } else {
        // server-btn-1 (OkJatt)
        const epId = epUrl.split('?id=')[1] || btoa(epUrl);
        fetchUrl = `${API_BASE_URL}/api/episode-stream?id=${epId}`;
      }
      
      const res = await fetch(fetchUrl.startsWith('http') ? fetchUrl : API_BASE_URL + fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data.iframeUrl) {
        nativePlayerWrapper.style.display = 'none';
        nativeVideoPlayer.removeAttribute('src');
        nativeVideoPlayer.load();
        
        // Hide external player container when playing via iframe URL
        const extPlayerContainer = document.getElementById('external-player-container');
        if (extPlayerContainer) extPlayerContainer.style.display = 'none';
        
        iframePlayerWrapper.style.display = 'block';
        const resolvedIframeUrl = data.iframeUrl.startsWith('/api/') ? API_BASE_URL + data.iframeUrl : data.iframeUrl;
        videoPlayerIframe.src = resolvedIframeUrl;
      } else if (data.streamUrl) {
        // Direct stream codec and container compatibility warning
        const isH265 = data.streamUrl.toLowerCase().includes('h265') || data.streamUrl.toLowerCase().includes('hevc');
        const isMkv = data.streamUrl.toLowerCase().includes('.mkv') || data.streamUrl.toLowerCase().includes('/bt/');
        if (isH265 || isMkv) {
          showPlayerToast('Tip: Use Play in VLC/MX Player if browser fails to load this format.');
        }

        iframePlayerWrapper.style.display = 'none';
        videoPlayerIframe.src = '';
        nativePlayerWrapper.style.display = 'block';
        const resolvedStreamUrl = data.streamUrl.startsWith('/api/') ? API_BASE_URL + data.streamUrl : data.streamUrl;
        nativeVideoPlayer.src = resolvedStreamUrl;

        // Show and configure external player button
        const extPlayerContainer = document.getElementById('external-player-container');
        const extPlayerBtn = document.getElementById('external-player-btn');
        if (extPlayerContainer && extPlayerBtn) {
          extPlayerContainer.style.display = 'flex';
          const absoluteStreamUrl = resolvedStreamUrl.startsWith('http') ? resolvedStreamUrl : window.location.origin + resolvedStreamUrl;
          extPlayerBtn.href = `intent:${absoluteStreamUrl}#Intent;action=android.intent.action.VIEW;type=video/*;end`;
        }

        nativeVideoPlayer.load();
        nativeVideoPlayer.play().catch(e => console.log('Autoplay blocked:', e));
      } else {
        throw new Error('Stream URL empty');
      }
    } catch (err) {
      console.error('Failed to load direct stream:', err);
      const extPlayerContainer = document.getElementById('external-player-container');
      if (extPlayerContainer) extPlayerContainer.style.display = 'none';
      showPlayerToast('Stream offline. Try playing in VLC/MX Player or switch server.');
    }
  } else if (currentImdbId) {
    let prefix = activeServerBtn.dataset.srcPrefix;
    let iframeSrc = '';
    
    if (currentMediaType === 'tv') {
      if (prefix.includes('multiembed.mov')) {
        iframeSrc = `${prefix}${currentImdbId}&s=${season}&e=${episode}`;
      } else {
        prefix = prefix.replace('/movie/', '/tv/');
        iframeSrc = `${prefix}${currentImdbId}/${season}/${episode}`;
      }
    } else {
      iframeSrc = `${prefix}${currentImdbId}`;
    }
    
    nativePlayerWrapper.style.display = 'none';
    nativeVideoPlayer.pause();

    // Hide external player container when playing fallback servers
    const extPlayerContainer = document.getElementById('external-player-container');
    if (extPlayerContainer) extPlayerContainer.style.display = 'none';
    
    iframePlayerWrapper.style.display = 'block';
    videoPlayerIframe.src = iframeSrc;
  } else {
    showPlayerToast('IMDb ID missing. Please play in VLC / MX Player.');
    const directBtn = document.getElementById('server-btn-direct');
    if (directBtn) {
      const btns = document.querySelectorAll('#player-servers .server-btn');
      btns.forEach(b => b.classList.remove('active'));
      directBtn.classList.add('active');
    }
  }
}

// Update Episode Navigation Buttons disabled/enabled states and playing label
function updateEpisodeNavButtons() {
  const prevBtn = document.getElementById('ep-prev-btn');
  const nextBtn = document.getElementById('ep-next-btn');
  const currentLabel = document.getElementById('ep-current-label');
  
  if (!prevBtn || !nextBtn || !currentLabel) return;
  
  if (currentPlayingEpisodeIndex === -1) {
    prevBtn.disabled = true;
    nextBtn.disabled = currentEpisodesList.length === 0;
    currentLabel.textContent = `Select an episode to play`;
  } else {
    prevBtn.disabled = currentPlayingEpisodeIndex === 0;
    nextBtn.disabled = currentPlayingEpisodeIndex === currentEpisodesList.length - 1;
    const currentEp = currentEpisodesList[currentPlayingEpisodeIndex];
    currentLabel.textContent = `Playing: ${currentEp.title.replace(/\[.*?\]|\(.*?\)/g, '').trim()}`;
  }
}

// Populate Stream Quality Options dynamically from parsed download links
function populateQualityOptions(downloads, isEpisode = false) {
  const container = document.getElementById('player-quality-container');
  const optionsDiv = document.getElementById('player-quality-options');
  if (!container || !optionsDiv) return;
  
  optionsDiv.innerHTML = '';
  
  if (!downloads || downloads.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  let qualityLinks = [];
  if (isEpisode) {
    qualityLinks = downloads.filter(d => d.title.toLowerCase().includes('play') || d.title.toLowerCase().includes('episode') || d.isEpisode);
  } else {
    qualityLinks = downloads.filter(d => {
      const title = d.title.toLowerCase();
      return !title.includes('sample') && !title.includes('zip') && (
        title.includes('480p') || title.includes('720p') || title.includes('1080p') || title.includes('2160p') || 
        title.includes('4k') || title.includes('hdr') || title.includes('webrip') || title.includes('hd') || 
        title.includes('mkv') || title.includes('mp4')
      );
    });
  }
  
  if (qualityLinks.length <= 1) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  
  const seenLabels = new Set();
  qualityLinks.forEach((link, idx) => {
    let label = '720p';
    const titleLower = link.title.toLowerCase();
    const match = link.title.match(/\b(480p|720p|1080p|2160p|4k)\b/i);
    
    if (match) {
      label = match[0].toLowerCase();
    } else if (titleLower.includes('fhd') || titleLower.includes('full hd') || titleLower.includes('1080')) {
      label = '1080p';
    } else if (titleLower.includes('sd') || titleLower.includes('normal') || titleLower.includes('low') || titleLower.includes('480')) {
      label = '480p';
    } else if (titleLower.includes('hd') || titleLower.includes('720')) {
      label = '720p';
    } else {
      label = '720p';
    }
    
    // Dynamic mapping for generic duplicate links (e.g. mapping first HD to 720p, second HD to 1080p, etc.)
    if (seenLabels.has(label)) {
      if (label === '720p') {
        label = '1080p';
      } else if (label === '1080p') {
        label = '480p';
      } else {
        label = `${label} (Mirror)`;
      }
    }
    
    seenLabels.add(label);
    const displayLabel = label.toUpperCase();
    
    const btn = document.createElement('button');
    btn.className = 'quality-btn';
    btn.textContent = displayLabel;
    if (idx === 0) btn.classList.add('active');
    
    btn.addEventListener('click', async () => {
      const qBtns = optionsDiv.querySelectorAll('.quality-btn');
      qBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      showPlayerToast(`Switching quality to ${displayLabel}...`);
      
      try {
        let streamApiUrl = '';
        if (link.url.includes('/api/stream-play') || link.url.includes('/api/download')) {
          const urlParams = new URLSearchParams(link.url.split('?')[1]);
          const id = urlParams.get('id');
          streamApiUrl = `${API_BASE_URL}/api/stream-play?id=${id}`;
        } else {
          const id = btoa(link.url);
          const res = await fetch(`${API_BASE_URL}/api/episode-stream?id=${id}`);
          if (!res.ok) throw new Error('Failed to resolve episode stream');
          const data = await res.json();
          streamApiUrl = data.streamUrl;
        }
        
        if (streamApiUrl) {
          currentDirectStreamUrl = streamApiUrl.startsWith('/api/') ? API_BASE_URL + streamApiUrl : streamApiUrl;
          
          const directBtn = document.getElementById('server-btn-direct');
          if (directBtn) {
            // Show Direct button in case it was hidden
            directBtn.style.display = 'inline-block';
            directBtn.click();
          }
        } else {
          showPlayerToast('Failed to load this quality stream.');
        }
      } catch (err) {
        console.error('Error switching quality:', err);
        showPlayerToast('Quality stream offline or unavailable.');
      }
    });
    
    optionsDiv.appendChild(btn);
  });
}

// Populate Audio Dub / Language selector dynamically from parsed download links
function populateAudioOptions(downloads) {
  const container = document.getElementById('player-audio-container');
  const optionsDiv = document.getElementById('player-audio-options');
  if (!container || !optionsDiv) return;
  
  optionsDiv.innerHTML = '';
  
  if (!downloads || downloads.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  const audioMap = new Map();
  downloads.forEach(d => {
    const titleLower = d.title.toLowerCase();
    let lang = 'Hindi';
    if (titleLower.includes('punjabi')) lang = 'Punjabi';
    else if (titleLower.includes('english')) lang = 'English';
    else if (titleLower.includes('tamil')) lang = 'Tamil';
    else if (titleLower.includes('telugu')) lang = 'Telugu';
    else if (titleLower.includes('dual')) lang = 'Dual Audio';
    else if (titleLower.includes('multi')) lang = 'Multi Audio';
    
    if (!audioMap.has(lang)) {
      audioMap.set(lang, d);
    }
  });
  
  if (audioMap.size <= 1) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  
  let isFirst = true;
  audioMap.forEach((link, lang) => {
    const btn = document.createElement('button');
    btn.className = 'audio-btn';
    btn.textContent = lang;
    if (isFirst) {
      btn.classList.add('active');
      isFirst = false;
    }
    
    btn.addEventListener('click', async () => {
      const aBtns = optionsDiv.querySelectorAll('.audio-btn');
      aBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      showPlayerToast(`Switching audio language to ${lang}...`);
      
      try {
        let streamApiUrl = '';
        if (link.url.includes('/api/stream-play') || link.url.includes('/api/download')) {
          const urlParams = new URLSearchParams(link.url.split('?')[1]);
          const id = urlParams.get('id');
          streamApiUrl = `${API_BASE_URL}/api/stream-play?id=${id}`;
        } else {
          const id = btoa(link.url);
          const res = await fetch(`${API_BASE_URL}/api/episode-stream?id=${id}`);
          if (!res.ok) throw new Error('Failed to resolve audio stream');
          const data = await res.json();
          streamApiUrl = data.streamUrl;
        }
        
        if (streamApiUrl) {
          currentDirectStreamUrl = streamApiUrl.startsWith('/api/') ? API_BASE_URL + streamApiUrl : streamApiUrl;
          const directBtn = document.getElementById('server-btn-direct');
          if (directBtn) {
            directBtn.style.display = 'inline-block';
            directBtn.click();
          }
        } else {
          showPlayerToast('Failed to load this language stream.');
        }
      } catch (err) {
        console.error('Error switching audio track:', err);
        showPlayerToast('Language stream offline or unavailable.');
      }
    });
    
    optionsDiv.appendChild(btn);
  });
}

function clearDirectStreamWatchdog() {
  if (directStreamWatchdog) {
    clearTimeout(directStreamWatchdog);
    directStreamWatchdog = null;
  }
}

function startDirectStreamWatchdog() {
  clearDirectStreamWatchdog();
  directStreamWatchdog = setTimeout(() => {
    const activeBtn = document.querySelector('#player-servers .server-btn.active');
    if (activeBtn && activeBtn.id === 'server-btn-direct' && nativeVideoPlayer.paused) {
      console.log('[Watchdog] Direct stream buffering timeout (180s) reached.');
      showPlayerToast('Tip: If stream is buffering slowly, you can manually switch to Server 1/2/3/4.');
    }
  }, 180000); // 180 seconds buffering switch time
}

// Hook up native video playback watchdog clear states
if (typeof nativeVideoPlayer !== 'undefined' && nativeVideoPlayer) {
  nativeVideoPlayer.addEventListener('playing', clearDirectStreamWatchdog);
  nativeVideoPlayer.addEventListener('pause', clearDirectStreamWatchdog);
}
