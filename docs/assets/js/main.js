/**
 * 監視ちゃん紹介サイト - モダンJavaScript with Anime.js
 */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    initHeroAnimations();
    initNavigation();
    initFeatureTimeline();
    initGallery();
    initAccordion();
    initScrollAnimations();
    initLazyLoading();
  });

  /**
   * ヒーローセクションのアニメーション
   */
  function initHeroAnimations() {
    // タイトルアニメーション
    anime({
      targets: '.hero h1',
      opacity: [0, 1],
      translateY: [-50, 0],
      scale: [0.8, 1],
      duration: 1200,
      easing: 'easeOutExpo'
    });

    // サブタイトルアニメーション
    anime({
      targets: '.hero-subtitle',
      opacity: [0, 1],
      translateY: [30, 0],
      duration: 1000,
      delay: 300,
      easing: 'easeOutExpo'
    });

    // ボタンアニメーション
    anime({
      targets: '.hero-buttons .btn',
      opacity: [0, 1],
      translateY: [20, 0],
      scale: [0.9, 1],
      duration: 800,
      delay: anime.stagger(150, {start: 600}),
      easing: 'easeOutExpo'
    });

    // ヒーロー画像アニメーション
    anime({
      targets: '.hero-image',
      opacity: [0, 1],
      translateY: [100, 0],
      scale: [0.95, 1],
      rotate: ['-2deg', '0deg'],
      duration: 1500,
      delay: 900,
      easing: 'easeOutExpo'
    });

    // ボタンホバーエフェクト
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', function() {
        anime({
          targets: this,
          scale: 1.05,
          duration: 300,
          easing: 'easeOutQuad'
        });
      });

      btn.addEventListener('mouseleave', function() {
        anime({
          targets: this,
          scale: 1,
          duration: 300,
          easing: 'easeOutQuad'
        });
      });
    });
  }

  /**
   * ナビゲーション制御
   */
  function initNavigation() {
    const navbar = document.querySelector('.navbar');
    const navbarToggle = document.querySelector('.navbar-toggle');
    const navbarNav = document.querySelector('.navbar-nav');
    const navLinks = document.querySelectorAll('.navbar-nav a');

    // スクロール時のナビゲーションスタイル
    let lastScroll = 0;
    window.addEventListener('scroll', debounce(function() {
      const currentScroll = window.pageYOffset;

      if (currentScroll > 100) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }

      lastScroll = currentScroll;

      // アクティブセクションのハイライト
      updateActiveSection();
    }, 10));

    // スムーススクロール
    navLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        const href = this.getAttribute('href');

        if (href.startsWith('#')) {
          e.preventDefault();
          const targetId = href.substring(1);
          const targetElement = document.getElementById(targetId);

          if (targetElement) {
            const navbarHeight = navbar.offsetHeight;
            const targetPosition = targetElement.offsetTop - navbarHeight;

            anime({
              targets: 'html, body',
              scrollTop: targetPosition,
              duration: 1000,
              easing: 'easeInOutQuad'
            });

            if (navbarNav.classList.contains('active')) {
              navbarNav.classList.remove('active');
            }
          }
        }
      });
    });

    // ハンバーガーメニュー
    if (navbarToggle) {
      navbarToggle.addEventListener('click', function() {
        navbarNav.classList.toggle('active');

        // アニメーション
        const spans = this.querySelectorAll('span');
        if (navbarNav.classList.contains('active')) {
          anime({
            targets: spans[0],
            rotate: '45deg',
            translateY: 8,
            duration: 300
          });
          anime({
            targets: spans[1],
            opacity: 0,
            duration: 300
          });
          anime({
            targets: spans[2],
            rotate: '-45deg',
            translateY: -8,
            duration: 300
          });
        } else {
          anime({
            targets: spans[0],
            rotate: '0deg',
            translateY: 0,
            duration: 300
          });
          anime({
            targets: spans[1],
            opacity: 1,
            duration: 300
          });
          anime({
            targets: spans[2],
            rotate: '0deg',
            translateY: 0,
            duration: 300
          });
        }
      });

      document.addEventListener('click', function(e) {
        if (!navbar.contains(e.target)) {
          navbarNav.classList.remove('active');
        }
      });
    }

    function updateActiveSection() {
      const sections = document.querySelectorAll('section[id]');
      const scrollPosition = window.scrollY + navbar.offsetHeight + 100;

      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute('id');
        const correspondingLink = document.querySelector(`.navbar-nav a[href="#${sectionId}"]`);

        if (correspondingLink) {
          if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
            navLinks.forEach(link => link.classList.remove('active'));
            correspondingLink.classList.add('active');
          }
        }
      });
    }
  }

  /**
   * 機能タイムラインのアニメーション
   */
  function initFeatureTimeline() {
    const featureItems = document.querySelectorAll('.feature-item');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          const item = entry.target;
          const card = item.querySelector('.feature-card');
          const image = item.querySelector('.feature-image');
          const dot = item;

          // タイムライン登場アニメーション
          anime({
            targets: item,
            opacity: [0, 1],
            translateX: item.classList.contains('feature-item:nth-child(even)') ? [100, 0] : [-100, 0],
            duration: 1000,
            delay: 200,
            easing: 'easeOutExpo'
          });

          // カードアニメーション
          anime({
            targets: card,
            opacity: [0, 1],
            translateY: [50, 0],
            scale: [0.9, 1],
            duration: 800,
            delay: 400,
            easing: 'easeOutExpo'
          });

          // 画像アニメーション
          anime({
            targets: image,
            opacity: [0, 1],
            scale: [0.8, 1],
            rotate: ['-5deg', '0deg'],
            duration: 1000,
            delay: 600,
            easing: 'easeOutExpo'
          });

          // ナンバーアニメーション
          const number = item.querySelector('.feature-number');
          anime({
            targets: number,
            scale: [0, 1],
            rotate: ['180deg', '0deg'],
            duration: 800,
            delay: 300,
            easing: 'easeOutElastic(1, .6)'
          });

          observer.unobserve(item);
        }
      });
    }, {
      threshold: 0.2
    });

    featureItems.forEach(item => observer.observe(item));

    // ホバーエフェクト
    featureItems.forEach(item => {
      const card = item.querySelector('.feature-card');
      const image = item.querySelector('.feature-image');

      card.addEventListener('mouseenter', function() {
        anime({
          targets: this,
          translateY: -10,
          duration: 400,
          easing: 'easeOutQuad'
        });
      });

      card.addEventListener('mouseleave', function() {
        anime({
          targets: this,
          translateY: 0,
          duration: 400,
          easing: 'easeOutQuad'
        });
      });

      if (image) {
        image.addEventListener('mouseenter', function() {
          anime({
            targets: this,
            scale: 1.05,
            rotate: '2deg',
            duration: 600,
            easing: 'easeOutQuad'
          });
        });

        image.addEventListener('mouseleave', function() {
          anime({
            targets: this,
            scale: 1,
            rotate: '0deg',
            duration: 600,
            easing: 'easeOutQuad'
          });
        });
      }
    });
  }

  /**
   * ギャラリーとLightbox
   */
  function initGallery() {
    const galleryTabs = document.querySelectorAll('.gallery-tab');
    const galleryItems = document.querySelectorAll('.gallery-item');
    let lightbox = document.querySelector('.lightbox');

    if (!lightbox) {
      lightbox = createLightbox();
      document.body.appendChild(lightbox);
    }

    const lightboxImage = lightbox.querySelector('.lightbox-image');
    const lightboxClose = lightbox.querySelector('.lightbox-close');
    const lightboxPrev = lightbox.querySelector('.lightbox-prev');
    const lightboxNext = lightbox.querySelector('.lightbox-next');

    let currentImageIndex = 0;
    let currentCategory = 'all';
    let visibleImages = [];

    // タブ切り替えアニメーション
    galleryTabs.forEach(tab => {
      tab.addEventListener('click', function() {
        const category = this.dataset.category;
        currentCategory = category;

        galleryTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');

        // タブアニメーション
        anime({
          targets: this,
          scale: [0.95, 1],
          duration: 300,
          easing: 'easeOutQuad'
        });

        filterGalleryItems(category);
      });
    });

    // ギャラリーアイテムクリック
    galleryItems.forEach((item, index) => {
      item.addEventListener('click', function() {
        updateVisibleImages();
        const visibleIndex = visibleImages.indexOf(item);
        if (visibleIndex !== -1) {
          openLightbox(visibleIndex);
        }
      });

      // ホバーエフェクト
      item.addEventListener('mouseenter', function() {
        anime({
          targets: this,
          translateY: -10,
          duration: 400,
          easing: 'easeOutQuad'
        });
      });

      item.addEventListener('mouseleave', function() {
        anime({
          targets: this,
          translateY: 0,
          duration: 400,
          easing: 'easeOutQuad'
        });
      });
    });

    // Lightboxコントロール
    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }

    if (lightboxPrev) {
      lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
    }

    if (lightboxNext) {
      lightboxNext.addEventListener('click', () => navigateLightbox(1));
    }

    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (!lightbox.classList.contains('active')) return;

      switch(e.key) {
        case 'Escape':
          closeLightbox();
          break;
        case 'ArrowLeft':
          navigateLightbox(-1);
          break;
        case 'ArrowRight':
          navigateLightbox(1);
          break;
      }
    });

    function filterGalleryItems(category) {
      galleryItems.forEach((item, index) => {
        const itemCategory = item.dataset.category;
        const shouldShow = category === 'all' || itemCategory === category;

        if (shouldShow) {
          item.style.display = 'block';
          anime({
            targets: item,
            opacity: [0, 1],
            scale: [0.8, 1],
            duration: 600,
            delay: index * 50,
            easing: 'easeOutExpo'
          });
        } else {
          anime({
            targets: item,
            opacity: 0,
            scale: 0.8,
            duration: 300,
            easing: 'easeOutQuad',
            complete: function() {
              item.style.display = 'none';
            }
          });
        }
      });
      updateVisibleImages();
    }

    function updateVisibleImages() {
      visibleImages = Array.from(galleryItems).filter(item => {
        return item.style.display !== 'none' &&
               (currentCategory === 'all' || item.dataset.category === currentCategory);
      });
    }

    function openLightbox(index) {
      currentImageIndex = index;
      const img = visibleImages[index].querySelector('img');
      lightboxImage.src = img.src;
      lightboxImage.alt = img.alt;
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Lightbox登場アニメーション
      anime({
        targets: lightbox,
        opacity: [0, 1],
        duration: 400,
        easing: 'easeOutQuad'
      });

      anime({
        targets: lightboxImage,
        opacity: [0, 1],
        scale: [0.8, 1],
        duration: 600,
        easing: 'easeOutExpo'
      });
    }

    function closeLightbox() {
      anime({
        targets: lightbox,
        opacity: 0,
        duration: 300,
        easing: 'easeOutQuad',
        complete: function() {
          lightbox.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }

    function navigateLightbox(direction) {
      currentImageIndex += direction;

      if (currentImageIndex < 0) {
        currentImageIndex = visibleImages.length - 1;
      } else if (currentImageIndex >= visibleImages.length) {
        currentImageIndex = 0;
      }

      const img = visibleImages[currentImageIndex].querySelector('img');

      anime({
        targets: lightboxImage,
        opacity: [1, 0],
        scale: [1, 0.9],
        duration: 200,
        easing: 'easeOutQuad',
        complete: function() {
          lightboxImage.src = img.src;
          lightboxImage.alt = img.alt;

          anime({
            targets: lightboxImage,
            opacity: [0, 1],
            scale: [0.9, 1],
            duration: 400,
            easing: 'easeOutExpo'
          });
        }
      });
    }

    function createLightbox() {
      const lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.innerHTML = `
        <div class="lightbox-content">
          <button class="lightbox-close" aria-label="閉じる">&times;</button>
          <img class="lightbox-image" src="" alt="">
          <button class="lightbox-nav lightbox-prev" aria-label="前へ">&#10094;</button>
          <button class="lightbox-nav lightbox-next" aria-label="次へ">&#10095;</button>
        </div>
      `;
      return lb;
    }

    updateVisibleImages();
  }

  /**
   * アコーディオン
   */
  function initAccordion() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
      header.addEventListener('click', function() {
        const accordionItem = this.parentElement;
        const accordionContent = accordionItem.querySelector('.accordion-content');
        const isActive = accordionItem.classList.contains('active');

        if (isActive) {
          accordionItem.classList.remove('active');
          anime({
            targets: accordionContent,
            maxHeight: 0,
            duration: 400,
            easing: 'easeInOutQuad'
          });
        } else {
          accordionItem.classList.add('active');
          const height = accordionContent.scrollHeight;
          anime({
            targets: accordionContent,
            maxHeight: height,
            duration: 400,
            easing: 'easeInOutQuad'
          });
        }
      });
    });
  }

  /**
   * スクロールアニメーション
   */
  function initScrollAnimations() {
    const fadeElements = document.querySelectorAll('.fade-in');

    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          anime({
            targets: entry.target,
            opacity: [0, 1],
            translateY: [30, 0],
            duration: 800,
            easing: 'easeOutExpo'
          });
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    fadeElements.forEach(element => {
      observer.observe(element);
    });

    // セクションタイトルのアニメーション
    const sectionTitles = document.querySelectorAll('.section-title');
    sectionTitles.forEach(title => {
      const titleObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const h2 = entry.target.querySelector('h2');
            const p = entry.target.querySelector('p');

            anime({
              targets: h2,
              opacity: [0, 1],
              translateY: [-20, 0],
              duration: 800,
              easing: 'easeOutExpo'
            });

            anime({
              targets: p,
              opacity: [0, 1],
              translateY: [20, 0],
              duration: 800,
              delay: 200,
              easing: 'easeOutExpo'
            });

            titleObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });

      titleObserver.observe(title);
    });

    // 技術スタックアニメーション
    const techItems = document.querySelectorAll('.tech-item');
    const techObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const items = document.querySelectorAll('.tech-item');
          anime({
            targets: items,
            opacity: [0, 1],
            translateY: [50, 0],
            scale: [0.8, 1],
            duration: 800,
            delay: anime.stagger(100),
            easing: 'easeOutExpo'
          });
          techObserver.disconnect();
        }
      });
    }, { threshold: 0.2 });

    if (techItems.length > 0) {
      techObserver.observe(techItems[0]);
    }
  }

  /**
   * 画像の遅延読み込み
   */
  function initLazyLoading() {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');

    if ('loading' in HTMLImageElement.prototype) {
      return;
    }

    const imageObserver = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          img.classList.remove('lazy');

          anime({
            targets: img,
            opacity: [0, 1],
            duration: 600,
            easing: 'easeOutQuad'
          });

          imageObserver.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => {
      imageObserver.observe(img);
    });
  }

  /**
   * デバウンス関数
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

})();
