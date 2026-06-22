/**
 * app.js — Main application entry point for perc.store
 * Initializes all modules and orchestrates the page
 */

import { initTerminal } from './terminal.js';
import { initSecurity } from './security.js';
import { initAuth } from './auth.js';

// ─── Initialize Everything ───
function init() {
  // Security
  initSecurity();

  // Terminal demo
  const terminalContainer = document.getElementById('terminal-container');
  if (terminalContainer) initTerminal(terminalContainer);

  // Authentication
  initAuth();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ══════════════════════════════════════════════════════
   HIGH-FPS PINK SNOW EFFECT
   ══════════════════════════════════════════════════════ */
function initSnowEffect() {
  const canvas = document.createElement('canvas');
  canvas.id = 'snow-canvas';
  document.body.prepend(canvas);
  
  const ctx = canvas.getContext('2d', { alpha: true });
  let width, height;
  
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  }
  window.addEventListener('resize', resize);
  resize();

  const particles = [];
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.5,
      d: Math.random() * 150,
      speedY: Math.random() * 1 + 0.5,
      speedX: Math.random() * 1 - 0.5
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(236, 72, 153, 0.4)'; // Brand pink
    ctx.beginPath();
    for (let i = 0; i < particles.length; i++) {
      let p = particles[i];
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, true);
    }
    ctx.fill();
    update();
    requestAnimationFrame(draw);
  }

  function update() {
    for (let i = 0; i < particles.length; i++) {
      let p = particles[i];
      p.y += p.speedY;
      p.x += p.speedX;
      
      if (p.y > height) {
        particles[i] = { x: Math.random() * width, y: 0, r: p.r, d: p.d, speedY: p.speedY, speedX: p.speedX };
      }
      if (p.x > width) p.x = 0;
      if (p.x < 0) p.x = width;
    }
  }
  draw();
}

/* ══════════════════════════════════════════════════════
   HOLOGRAPHIC 3D TILT EFFECT
   ══════════════════════════════════════════════════════ */
function initTiltEffect() {
  const cards = document.querySelectorAll('.product-card');
  cards.forEach(card => {
    card.classList.add('tilt');
    
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -5;
      const rotateY = ((x - centerX) / centerX) * 5;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = `perspective(1000px) rotateX(0) rotateY(0)`;
    });
  });
}

// Ensure effects run after init
document.addEventListener('DOMContentLoaded', () => {
  initSnowEffect();
  initTiltEffect();
});
