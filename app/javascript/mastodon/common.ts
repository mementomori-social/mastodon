import { setupLinkListeners } from './utils/links';

export function start() {
  setupLinkListeners();
}

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  opacity: number;
}

interface ConfettiPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  speed: number;
  opacity: number;
  wobble: number;
}

function animate(
  ctx: CanvasRenderingContext2D,
  snowflakes: Snowflake[],
  canvas: HTMLCanvasElement,
  maxFlakes: number,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Add new snowflake if we haven't reached the maximum
  if (snowflakes.length < maxFlakes && Math.random() < 0.05) {
    // 5% chance each frame to add a new flake
    snowflakes.push({
      x: Math.random() * canvas.width,
      y: 0, // Start from top
      radius: Math.random() * 7 + 3,
      speed: Math.random() * 0.5 + 0.3,
      opacity: Math.random() * 0.6 + 0.4,
    });
  }

  snowflakes.forEach((flake) => {
    // Draw snowflake shape
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      ctx.moveTo(flake.x, flake.y);
      ctx.lineTo(
        flake.x + Math.cos((Math.PI * 2 * i) / 6) * flake.radius,
        flake.y + Math.sin((Math.PI * 2 * i) / 6) * flake.radius,
      );
    }
    ctx.strokeStyle = `rgba(255, 255, 255, ${flake.opacity})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Update position with gentler movement
    flake.x += Math.sin(flake.y / 50) * 0.3;
    flake.y += flake.speed * 0.5;

    if (flake.y > canvas.height) {
      flake.y = 0;
      flake.x = Math.random() * canvas.width;
    }
  });

  requestAnimationFrame(() => {
    animate(ctx, snowflakes, canvas, maxFlakes);
  });
}

function animateConfetti(
  ctx: CanvasRenderingContext2D,
  confetti: ConfettiPiece[],
  canvas: HTMLCanvasElement,
  maxPieces: number,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Add new confetti if we haven't reached the maximum
  if (confetti.length < maxPieces && Math.random() < 0.05) {
    const colors = [
      '#ff4444',
      '#44ff44',
      '#4444ff',
      '#ffff44',
      '#ff44ff',
      '#44ffff',
    ]; // Brighter colors
    const color =
      colors[Math.floor(Math.random() * colors.length)] ?? '#ff4444';
    confetti.push({
      x: Math.random() * canvas.width,
      y: 0,
      width: Math.random() * 10 + 8,
      height: Math.random() * 6 + 2,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      color,
      speed: Math.random() * 2 + 0.4,
      opacity: Math.random() * 0.4 + 0.6,
      wobble: Math.random() * 2 * Math.PI,
    });
  }

  confetti.forEach((piece) => {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rotation);

    // Add 3D-like effect with gradient
    const gradient = ctx.createLinearGradient(
      -piece.width / 2,
      0,
      piece.width / 2,
      0,
    );
    gradient.addColorStop(0, piece.color);
    gradient.addColorStop(0.5, piece.color);
    gradient.addColorStop(1, shadeColor(piece.color, -20)); // Darker shade

    ctx.fillStyle = gradient;
    ctx.globalAlpha = piece.opacity;

    // Draw rectangular confetti
    ctx.fillRect(
      -piece.width / 2,
      -piece.height / 2,
      piece.width,
      piece.height,
    );

    ctx.restore();

    // More dynamic movement
    piece.wobble += 0.05;
    piece.x += Math.sin(piece.wobble) * 1.5; // Wider side-to-side
    piece.y += piece.speed;
    piece.rotation += piece.rotationSpeed;

    // Reset when out of view
    if (piece.y > canvas.height) {
      piece.y = -20; // Start slightly above viewport
      piece.x = Math.random() * canvas.width;
      piece.wobble = Math.random() * 2 * Math.PI;
    }
  });

  requestAnimationFrame(() => {
    animateConfetti(ctx, confetti, canvas, maxPieces);
  });
}

// Helper function to darken colors for 3D effect
function shadeColor(color: string, percent: number) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

document.addEventListener('DOMContentLoaded', () => {
  // Check if reduced motion is enabled (browser setting or Mastodon setting)
  // The html element has 'no-reduce-motion' class when animations are allowed
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const mastodonReducedMotion =
    !document.documentElement.classList.contains('no-reduce-motion');

  if (prefersReducedMotion || mastodonReducedMotion) {
    return; // Don't create snow effect if reduced motion is preferred
  }

  const currentDate = new Date();
  const isNewYearsEve =
    currentDate.getMonth() === 11 && currentDate.getDate() === 31;
  const isChristmasSeason =
    currentDate.getMonth() === 11 &&
    currentDate.getDate() >= 8 &&
    currentDate.getDate() <= 31;

  if (isChristmasSeason || isNewYearsEve) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('snow');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '100%';
    wrapper.style.height = '80px';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9999';
    wrapper.style.maskImage =
      'linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 35px)';
    wrapper.style.transition = 'opacity 0.3s ease-in-out';

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    canvas.width = window.innerWidth * 2;
    canvas.height = 160;

    wrapper.appendChild(canvas);
    document.body.appendChild(wrapper);

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    // Adjust max flakes based on viewport width
    const getMaxFlakes = () => {
      return window.innerWidth <= 800 ? 25 : 50;
    };

    // Declare arrays in higher scope
    const snowflakes: Snowflake[] = [];
    const confetti: ConfettiPiece[] = [];

    if (isNewYearsEve) {
      const maxConfetti = window.innerWidth <= 800 ? 35 : 70;
      animateConfetti(ctx, confetti, canvas, maxConfetti);
    } else {
      const maxFlakes = getMaxFlakes();
      animate(ctx, snowflakes, canvas, maxFlakes);
    }

    // Update maxFlakes on resize
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth * 2;
      canvas.height = 160;
      const maxFlakes = getMaxFlakes();

      // Now snowflakes is accessible here
      if (!isNewYearsEve && snowflakes.length > maxFlakes) {
        snowflakes.length = maxFlakes;
      }
    });

    window.addEventListener('scroll', () => {
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;

      if (scrollTop > 100) {
        wrapper.style.opacity = String(
          Math.max(0, 1 - (scrollTop - 100) / 200),
        );
      } else {
        wrapper.style.opacity = '1';
      }
    });
  }
});

// On mobile the top and bottom bars slide away while scrolling down
const AUTOHIDE_MAX_WIDTH = 890;
const AUTOHIDE_FROM_TOP = 500;

let lastScrollTop = 0;

function scrollHandler() {
  const scrollTop = window.scrollY;
  const { classList } = document.body;

  if (window.innerWidth > AUTOHIDE_MAX_WIDTH || scrollTop < AUTOHIDE_FROM_TOP) {
    classList.remove('scroll-up', 'scroll-down');
    lastScrollTop = scrollTop;
    return;
  }

  const scrollingDown = scrollTop > lastScrollTop;

  classList.toggle('scroll-down', scrollingDown);
  classList.toggle('scroll-up', !scrollingDown);
  lastScrollTop = scrollTop;
}

window.addEventListener('scroll', scrollHandler, { passive: true });

window.addEventListener('click', () => {
  document.body.classList.remove('scroll-down');
});
