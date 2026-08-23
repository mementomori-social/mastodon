// The favourite star as a single SVG: the star itself (outline when not
// favourited, solid when favourited) plus a burst of a ring, spark rays and
// balls shown only while it animates. Laid out in the star's 0 -960 960 960
// viewBox; CSS makes the icon overflow visible so the burst can spill past it.
import type { IconProp } from './icon';

const CX = 480;
const CY = -480;
const POINTS = 7;
const SCALE = 11.52; // burst radii, in the star's 960-unit viewBox
const GLOW_R = 910; // hover glow, roughly 36px at the icon's rendered size

// Spark rays just outside the star.
const RAYS = Array.from({ length: POINTS }, (_, i) => {
  const angle = (i / POINTS) * Math.PI * 2;
  return {
    x1: +(CX + Math.cos(angle) * 16 * SCALE).toFixed(1),
    y1: +(CY + Math.sin(angle) * 16 * SCALE).toFixed(1),
    x2: +(CX + Math.cos(angle) * 30 * SCALE).toFixed(1),
    y2: +(CY + Math.sin(angle) * 30 * SCALE).toFixed(1),
  };
});

// Balls fly out past the rays; every third one is a deeper orange.
const BALLS = Array.from({ length: POINTS }, (_, i) => {
  const angle = (i / POINTS) * Math.PI * 2;
  return {
    cx: +(CX + Math.cos(angle) * 60 * SCALE).toFixed(1),
    cy: +(CY + Math.sin(angle) * 60 * SCALE).toFixed(1),
    r: i % 3 === 0 ? 34 : 28,
    deep: i % 3 === 0,
  };
});

const STAR_FILL =
  'm212.086-50.607 70.652-305.306L45.52-561.305l312.871-26.696L480-876.176l121.609 288.175 312.871 26.696-237.218 205.392 71.217 305.306L480-213.173 212.086-50.607Z';
const STAR_OUTLINE =
  'm330.955-216.328 149.066-89 149.066 90.023-40.305-168.391 131.217-114.347-172.956-14.87L480-671.869l-67.043 158.521-172.956 14.305 131.427 113.796-40.473 168.919ZM212.086-50.608l70.652-305.305L45.52-561.305l312.645-26.579L480-876.176l121.835 288.292 312.645 26.579-237.218 205.392 71.217 305.306L480-213.173 212.086-50.607ZM480-433.87Z';

export const FavouriteStar: IconProp = (props) => (
  <svg viewBox='0 -960 960 960' {...props}>
    <circle className='favourite-glow' cx={CX} cy={CY} r={GLOW_R} />
    <circle className='favourite-burst__ring' cx={CX} cy={CY} r='230' />
    <g className='favourite-burst__rays'>
      {RAYS.map((ray, i) => (
        <line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} />
      ))}
    </g>
    <g className='favourite-burst__balls'>
      {BALLS.map((ball, i) => (
        <circle
          key={i}
          cx={ball.cx}
          cy={ball.cy}
          r={ball.r}
          fill={ball.deep ? '#ff9500' : undefined}
        />
      ))}
    </g>
    <path
      className='favourite-burst__star favourite-burst__star--outline'
      d={STAR_OUTLINE}
    />
    <path
      className='favourite-burst__star favourite-burst__star--fill'
      d={STAR_FILL}
    />
  </svg>
);
