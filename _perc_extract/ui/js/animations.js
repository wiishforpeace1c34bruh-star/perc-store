/**
 * animations.js — Scroll animations, micro-interactions, cursor effects
 * Pure vanilla JS — no dependencies
 */

// ─── Scroll Reveal (Intersection Observer) ───

const revealedElements = new WeakSet();

/**
 * Initialize scroll-triggered reveal animations.
 * Elements with [data-animate] will fade/slide in when scrolled into view.
 * Supported values: 'fade-up', 'fade-in', 'slide-left', 'slide-right', 'scale-in'
 */
export function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !revealedElements.has(entry.target)) {
        revealedElements.add(entry.target);
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('revealed');
        }, parseInt(delay));
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -60px 0px'
  });

  document.querySelectorAll('[data-animate]').forEach(el => {
    observer.observe(el);
  });

  return observer;
}


// ─── Stagger Animation for Grids ───

/**
 * Apply staggered reveal to children of a container.
 * @param {string} containerSelector - CSS selector for the container
 * @param {number} staggerMs - Delay between each child (default: 100ms)
 */
export function initStaggerReveal(containerSelector, staggerMs = 100) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !revealedElements.has(entry.target)) {
        revealedElements.add(entry.target);
        const children = entry.target.querySelectorAll('[data-stagger-child]');
        children.forEach((child, i) => {
          setTimeout(() => {
            child.classList.add('revealed');
          }, i * staggerMs);
        });
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll(containerSelector).forEach(el => {
    observer.observe(el);
  });
}


// ─── Cursor Glow Effect ───

/**
 * Add a glowing pink radial gradient that follows the cursor on hover.
 * @param {string} selector - CSS selector for elements to apply effect to
 */
export function initCursorGlow(selector) {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty('--glow-x', `${x}px`);
      el.style.setProperty('--glow-y', `${y}px`);
    });

    el.addEventListener('mouseleave', () => {
      el.style.removeProperty('--glow-x');
      el.style.removeProperty('--glow-y');
    });
  });
}


// ─── Animated Counters ───

/**
 * Animate number counters from 0 to target value.
 * Elements with [data-count-to="123"] will animate on scroll.
 */
export function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !revealedElements.has(entry.target)) {
        revealedElements.add(entry.target);
        const target = parseInt(entry.target.dataset.countTo) || 0;
        const suffix = entry.target.dataset.countSuffix || '';
        const duration = parseInt(entry.target.dataset.countDuration) || 2000;
        animateCount(entry.target, 0, target, duration, suffix);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count-to]').forEach(el => {
    el.textContent = '0' + (el.dataset.countSuffix || '');
    observer.observe(el);
  });
}

function animateCount(el, start, end, duration, suffix) {
  const startTime = performance.now();
  const range = end - start;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + range * eased);

    el.textContent = current.toLocaleString() + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}


// ─── Typewriter Effect ───

/**
 * Typewriter text animation.
 * @param {HTMLElement} el - Element to type into
 * @param {string} text - Text to type
 * @param {number} speed - Ms per character (default: 50)
 * @returns {Promise} Resolves when typing is complete
 */
export function typewriter(el, text, speed = 50) {
  return new Promise(resolve => {
    let i = 0;
    el.textContent = '';
    el.classList.add('typing');

    function type() {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed + (Math.random() * 20 - 10));
      } else {
        el.classList.remove('typing');
        resolve();
      }
    }

    type();
  });
}


// ─── Parallax Floating Elements ───

/**
 * Add subtle parallax movement to floating background elements.
 * @param {string} selector - CSS selector for parallax elements
 * @param {number} intensity - Movement intensity (default: 0.02)
 */
export function initParallax(selector, intensity = 0.02) {
  const elements = document.querySelectorAll(selector);
  if (elements.length === 0) return;

  let mouseX = 0, mouseY = 0;
  let targetX = 0, targetY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function update() {
    targetX += (mouseX - targetX) * 0.05;
    targetY += (mouseY - targetY) * 0.05;

    elements.forEach((el, i) => {
      const depth = parseFloat(el.dataset.parallaxDepth) || (i + 1) * 0.5;
      const moveX = targetX * intensity * depth * 100;
      const moveY = targetY * intensity * depth * 100;
      el.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });

    requestAnimationFrame(update);
  }

  update();
}


// ─── Smooth Section Scroll ───

/**
 * Enable smooth scrolling for anchor links.
 */
export function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}


// ─── Magnetic Button Effect ───

/**
 * Add a subtle magnetic pull effect to buttons on hover.
 * @param {string} selector - CSS selector for buttons
 */
export function initMagneticButtons(selector) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translate(0, 0)';
      btn.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      setTimeout(() => { btn.style.transition = ''; }, 300);
    });
  });
}


// ─── Initialize All Animations ───

export function initAnimations() {
  initScrollReveal();
  initStaggerReveal('[data-stagger]');
  initCursorGlow('[data-glow]');
  initCounters();
  initSmoothScroll();
  initMagneticButtons('.btn-magnetic');
  initParallax('[data-parallax]');
}
