// api/wallpaper.js — Vercel Serverless Function
// Generates calendar wallpaper PNG on the fly using @vercel/og (Satori + Resvg)
import { ImageResponse } from 'next/og'; 


export const config = { runtime: 'edge' };

// iPhone screen resolutions
const MODELS = {
  iphone_16_pro:   { w: 1206, h: 2622 },
  iphone_16:       { w: 1179, h: 2556 },
  iphone_15_pro:   { w: 1179, h: 2556 },
  iphone_15:       { w: 1179, h: 2556 },
  iphone_14_pro:   { w: 1179, h: 2556 },
  iphone_14:       { w: 1170, h: 2532 },
  iphone_13_pro:   { w: 1170, h: 2532 },
  iphone_13:       { w: 1170, h: 2532 },
  iphone_se:       { w: 750,  h: 1334 },
};

// Color themes: [bg, pastColor, todayColor, futureColor, textColor]
const THEMES = {
  graphite_orange: ['#111111', '#ff8c4299', '#ff8c42', '#2a2a2a', '#ffffff'],
  graphite_yellow: ['#111111', '#e8ff4799', '#e8ff47', '#2a2a2a', '#ffffff'],
  graphite_green:  ['#111111', '#4fffb099', '#4fffb0', '#2a2a2a', '#ffffff'],
  graphite_blue:   ['#111111', '#47b8ff99', '#47b8ff', '#2a2a2a', '#ffffff'],
  graphite_red:    ['#111111', '#ff474799', '#ff4747', '#2a2a2a', '#ffffff'],
  graphite_pink:   ['#111111', '#ff47c899', '#ff47c8', '#2a2a2a', '#ffffff'],
  white_orange:    ['#f5f5f5', '#ff8c4299', '#ff8c42', '#e0e0e0', '#111111'],
  white_yellow:    ['#f5f5f5', '#c8a80099', '#c8a800', '#e0e0e0', '#111111'],
  white_blue:      ['#f5f5f5', '#3b82f699', '#3b82f6', '#e0e0e0', '#111111'],
  white_green:     ['#f5f5f5', '#22c55e99', '#22c55e', '#e0e0e0', '#111111'],
  black_white:     ['#000000', '#ffffff99', '#ffffff', '#333333', '#ffffff'],
  pure_white:      ['#ffffff', '#88888899', '#333333', '#eeeeee', '#111111'],
};

const MONTHS = {
  uk: ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'],
  ru: ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  pl: ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'],
  de: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
};

const WEEKDAYS = {
  uk: ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'],
  ru: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
  en: ['Mo','Tu','We','Th','Fr','Sa','Su'],
  pl: ['Pn','Wt','Śr','Cz','Pt','So','Nd'],
  de: ['Mo','Di','Mi','Do','Fr','Sa','So'],
};

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

function getDaysInYear(year) {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

function getDateInTimezone(tzOffset) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + tzOffset * 3600000);
}

export default function handler(req) {
  const { searchParams } = new URL(req.url);

  const model        = searchParams.get('model') || 'iphone_15_pro';
  const style        = searchParams.get('style') || 'dots';
  const calSize      = searchParams.get('calendar_size') || 'standard';
  const weekendMode  = searchParams.get('weekend_mode') || 'weekends_only';
  const opacity      = parseInt(searchParams.get('opacity') || '0');
  const theme        = searchParams.get('theme') || 'graphite_orange';
  const lang         = searchParams.get('lang') || 'uk';
  const tz           = parseFloat(searchParams.get('timezone') || '2');
  const footer       = searchParams.get('footer') || 'days_left_percent_left';

  const { w, h } = MODELS[model] || MODELS['iphone_15_pro'];
  const [bg, pastCol, todayCol, futureCol, textCol] = THEMES[theme] || THEMES['graphite_orange'];

  const now = getDateInTimezone(tz);
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const day = now.getDate();
  const dayOfYear = getDayOfYear(now);
  const daysInYear = getDaysInYear(year);
  const daysLeft = daysInYear - dayOfYear;
  const percentLeft = Math.round((daysLeft / daysInYear) * 100);
  const percentPassed = 100 - percentLeft;

  const months = MONTHS[lang] || MONTHS['uk'];
  const weekdays = WEEKDAYS[lang] || WEEKDAYS['uk'];

  // Determine size multipliers
  const sizeMap = { small: 0.75, standard: 1, large: 1.3 };
  const scale = sizeMap[calSize] || 1;

  // --- Build calendar grid ---
  // We'll render each month as a small block
  const totalCells = [];
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const firstDay = new Date(year, m, 1).getDay(); // 0=Sun
    // Convert to Mon-first: 0=Mon ... 6=Sun
    const offset = (firstDay + 6) % 7;

    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    totalCells.push({ month: m, cells, daysInMonth, offset });
  }

  // Base font size based on screen width and scale
  const basePx = Math.round((w / 30) * scale);
  const dotSize = Math.max(8, Math.round(basePx * 0.55));
  const gap = Math.max(4, Math.round(dotSize * 0.35));

  // Footer text
  let footerText = '';
  if (footer === 'days_left') footerText = `${daysLeft} днів залишилось`;
  else if (footer === 'days_passed') footerText = `${dayOfYear} днів пройдено`;
  else if (footer === 'percent_left') footerText = `${percentLeft}% залишилось`;
  else if (footer === 'percent_passed') footerText = `${percentPassed}% пройдено`;
  else if (footer === 'days_left_percent_left') footerText = `${daysLeft} днів · ${percentLeft}% залишилось`;

  // Background with opacity
  const bgOpacity = opacity / 100;
  const bgStyle = bgOpacity > 0
    ? { background: `rgba(0,0,0,${1 - bgOpacity})` }
    : { background: bg };

  // Helper: is weekend?
  function isWeekend(m, d) {
    const dow = new Date(year, m, d).getDay();
    return dow === 0 || dow === 6;
  }

  function getDayState(m, d) {
    if (m < month) return 'past';
    if (m > month) return 'future';
    if (d < day) return 'past';
    if (d === day) return 'today';
    return 'future';
  }

  function getColor(state, m, d) {
    if (state === 'today') return todayCol;
    if (state === 'past') {
      if (weekendMode !== 'none' && isWeekend(m, d)) return todayCol + '66';
      return pastCol;
    }
    if (weekendMode === 'all' && isWeekend(m, d)) return futureCol + 'aa';
    return futureCol;
  }

  function renderCell(m, d, state) {
    const color = getColor(state, m, d);
    const isToday = state === 'today';

    if (style === 'numbers' || style === 'numbers_bold') {
      return (
        <div style={{
          width: `${dotSize + 6}px`,
          height: `${dotSize + 6}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${Math.round(dotSize * 0.7)}px`,
          fontWeight: style === 'numbers_bold' ? '700' : '400',
          color: color,
          borderRadius: isToday ? '50%' : '0',
          background: isToday ? color + '20' : 'transparent',
        }}>{d}</div>
      );
    }

    if (style === 'squares' || style === 'squares_rounded') {
      return (
        <div style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          borderRadius: style === 'squares_rounded' ? `${Math.round(dotSize * 0.25)}px` : '2px',
          background: state === 'future' ? 'transparent' : color,
          border: state === 'future' ? `1px solid ${futureCol}` : 'none',
          transform: isToday ? 'scale(1.2)' : 'none',
        }} />
      );
    }

    if (style === 'lines') {
      return (
        <div style={{
          width: `${Math.round(dotSize * 0.25)}px`,
          height: `${dotSize}px`,
          borderRadius: '2px',
          background: state === 'future' ? futureCol : color,
          transform: isToday ? 'scaleY(1.3)' : 'none',
        }} />
      );
    }

    if (style === 'bars') {
      return (
        <div style={{
          width: `${dotSize + 4}px`,
          height: `${Math.round(dotSize * 0.5)}px`,
          borderRadius: '3px',
          background: state === 'future' ? futureCol : color,
        }} />
      );
    }

    // dots / dots_mini (default)
    const sz = style === 'dots_mini' ? Math.round(dotSize * 0.7) : dotSize;
    return (
      <div style={{
        width: `${sz}px`,
        height: `${sz}px`,
        borderRadius: '50%',
        background: state === 'future' ? 'transparent' : color,
        border: state === 'future' ? `1px solid ${futureCol}` : 'none',
        transform: isToday ? 'scale(1.25)' : 'none',
      }} />
    );
  }

  const monthFontSize = Math.round(basePx * 0.45);
  const footerFontSize = Math.round(w * 0.035);
  const yearFontSize = Math.round(w * 0.08);

  const image = (
    <div style={{
      width: `${w}px`,
      height: `${h}px`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      ...bgStyle,
    }}>
      {/* Year */}
      <div style={{
        fontSize: `${yearFontSize}px`,
        fontWeight: '700',
        color: textCol,
        marginBottom: `${Math.round(h * 0.04)}px`,
        opacity: 0.15,
        letterSpacing: '0.1em',
      }}>{year}</div>

      {/* Months grid: 3 columns x 4 rows */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: `${Math.round(w * 0.05)}px`,
        padding: `0 ${Math.round(w * 0.06)}px`,
      }}>
        {totalCells.map(({ month: m, cells, daysInMonth }) => (
          <div key={m} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: `${Math.round(gap * 0.5)}px`,
          }}>
            {/* Month name */}
            <div style={{
              fontSize: `${monthFontSize}px`,
              fontWeight: '600',
              color: m === month ? todayCol : textCol,
              opacity: m === month ? 1 : 0.4,
              marginBottom: `${Math.round(gap * 0.5)}px`,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>{months[m]}</div>

            {/* Calendar grid */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: `${gap}px`,
            }}>
              {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
                <div key={row} style={{ display: 'flex', gap: `${gap}px`, alignItems: 'center' }}>
                  {cells.slice(row * 7, row * 7 + 7).map((d, col) => (
                    <div key={col} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {d === null
                        ? <div style={{ width: `${dotSize}px`, height: `${dotSize}px` }} />
                        : renderCell(m, d, getDayState(m, d))
                      }
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {footer !== 'none' && (
        <div style={{
          marginTop: `${Math.round(h * 0.05)}px`,
          fontSize: `${footerFontSize}px`,
          color: textCol,
          opacity: 0.5,
          letterSpacing: '0.06em',
          fontWeight: '300',
        }}>{footerText}</div>
      )}
    </div>
  );

  return new ImageResponse(image, {
    width: w,
    height: h,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'image/png',
    },
  });
}
