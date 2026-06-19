// The favourite heart as a single SVG, used when the heart option is on: the
// heart itself (grey outline when not favourited, solid pink when favourited)
// plus a burst of a ring and two confetti waves shown only while it animates.
// Laid out in the heart's 24-unit viewBox; CSS makes the icon overflow visible
// so the confetti can spill past it.
import type { IconProp } from './icon';

const CX = 12;
const CY = 12;
const SCALE = 0.288; // confetti radii, in the heart's 24-unit viewBox
const GLOW_R = 22.7; // hover glow, roughly 36px at the icon's rendered size

// Two confetti waves, offset in angle, size and colour.
const WAVE_1_COLORS = ['#ff8ac5', '#66c8f5', '#f5c542', '#71d4c2', '#cc8ef5'];
const WAVE_2_COLORS = ['#9b8af5', '#7ed9c3', '#f59ec5', '#66c8f5', '#ffb347'];

const confetti = (
  baseAngle: number,
  radius: number,
  size: number,
  colors: string[],
) =>
  Array.from({ length: colors.length }, (_, i) => {
    const angle = (i / colors.length) * Math.PI * 2 + baseAngle;
    return {
      cx: +(CX + Math.cos(angle) * radius * SCALE).toFixed(2),
      cy: +(CY + Math.sin(angle) * radius * SCALE).toFixed(2),
      r: +(size * SCALE).toFixed(2),
      fill: colors[i],
    };
  });

const WAVE_1 = confetti(-0.3, 68, 4.5, WAVE_1_COLORS);
const WAVE_2 = confetti(-0.3 + 0.38, 82, 2.8, WAVE_2_COLORS);

const HEART_OUTLINE =
  'M16.5 3C19.538 3 22 5.5 22 9c0 7-7.5 11-10 12.5C9.5 20 2 16 2 9c0-3.5 2.5-6 5.5-6C9.36 3 11 4 12 5c1-1 2.64-2 4.5-2zm-3.566 15.604a26.953 26.953 0 0 0 2.42-1.701C18.335 14.533 20 11.943 20 9c0-2.36-1.537-4-3.5-4c-1.076 0-2.24.57-3.086 1.414L12 7.828l-1.414-1.414C9.74 5.57 8.576 5 7.5 5C5.56 5 4 6.656 4 9c0 2.944 1.666 5.533 4.645 7.903c.745.592 1.54 1.145 2.421 1.7c.299.189.595.37.934.572c.339-.202.635-.383.934-.571z';
const HEART_FILL =
  'M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z';

export const FavouriteHeart: IconProp = (props) => (
  <svg viewBox='0 0 24 24' {...props}>
    <circle className='favourite-glow' cx={CX} cy={CY} r={GLOW_R} />
    <circle
      className='favourite-burst__ring favourite-burst__ring--heart'
      cx={CX}
      cy={CY}
      r={+(40 * SCALE).toFixed(2)}
    />
    <g className='favourite-burst__confetti favourite-burst__confetti--1'>
      {WAVE_1.map((dot, i) => (
        <circle key={i} cx={dot.cx} cy={dot.cy} r={dot.r} fill={dot.fill} />
      ))}
    </g>
    <g className='favourite-burst__confetti favourite-burst__confetti--2'>
      {WAVE_2.map((dot, i) => (
        <circle key={i} cx={dot.cx} cy={dot.cy} r={dot.r} fill={dot.fill} />
      ))}
    </g>
    <path
      className='favourite-burst__heart favourite-burst__heart--outline'
      d={HEART_OUTLINE}
    />
    <path
      className='favourite-burst__heart favourite-burst__heart--fill'
      d={HEART_FILL}
    />
  </svg>
);
