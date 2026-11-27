import type { SVGProps } from "react";

/**
 * Set de iconos inline (trazo 1.5, 18×18 por defecto), estilo lineal como el de
 * la app original. Sin dependencias ni fuentes de iconos: cero requests.
 */
export type IconName =
  | "search"
  | "home"
  | "inbox"
  | "settings"
  | "plus"
  | "chevron-down"
  | "chevron-right"
  | "chevron-left"
  | "dots"
  | "trash"
  | "star"
  | "star-filled"
  | "clock"
  | "share"
  | "comment"
  | "grip"
  | "check"
  | "x"
  | "copy"
  | "link"
  | "type"
  | "heading1"
  | "heading2"
  | "heading3"
  | "list-bulleted"
  | "list-numbered"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "database"
  | "table"
  | "board"
  | "list"
  | "filter"
  | "sort"
  | "calendar"
  | "user"
  | "panel"
  | "sun"
  | "moon"
  | "image"
  | "arrow-up"
  | "arrow-down"
  | "lock"
  | "template"
  | "upload"
  | "play"
  | "pause"
  | "stop"
  | "skip-back"
  | "skip-forward"
  | "repeat"
  | "volume"
  | "timer"
  | "mindmap"
  | "book"
  | "download"
  | "dock"
  | "target"
  | "sliders"
  | "folder"
  | "file"
  | "paperclip"
  | "timeline"
  | "minus"
  | "zoom";

const P: Record<IconName, React.ReactNode> = {
  minus: <path d="M4 9h10" />,
  zoom: (
    <>
      <circle cx="8.2" cy="8.2" r="5.2" />
      <path d="M12.2 12.2 16 16" />
      <path d="M6.2 8.2h4M8.2 6.2v4" />
    </>
  ),
  search: (
    <>
      <circle cx="8.2" cy="8.2" r="5.2" />
      <path d="M12.2 12.2 16 16" />
    </>
  ),
  home: (
    <>
      <path d="M3.2 9.4 9 3.8a1.5 1.5 0 0 1 2 0l5.8 5.6" />
      <path d="M4.8 8.6V15a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1V8.6" />
    </>
  ),
  inbox: (
    <>
      <path d="M2.8 9.5h3l1 2h4.4l1-2h3" />
      <path d="M4.6 3.8h6.8l2.4 2.8v7.6a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V5.2a1.4 1.4 0 0 1 1-1.4Z" />
    </>
  ),
  settings: (
    <>
      <path d="M2.8 5.5h6M13.2 5.5h2M2.8 12.5h2M9.2 12.5h6" />
      <circle cx="10.6" cy="5.5" r="1.8" />
      <circle cx="6.6" cy="12.5" r="1.8" />
    </>
  ),
  plus: <path d="M9 3.4v11.2M3.4 9h11.2" />,
  "chevron-down": <path d="m4.6 7 4.4 4.2L13.4 7" />,
  "chevron-right": <path d="m7 4.6 4.2 4.4L7 13.4" />,
  "chevron-left": <path d="M11 4.6 6.8 9l4.2 4.4" />,
  dots: (
    <>
      <circle cx="4" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  trash: (
    <>
      <path d="M3.6 5.2h10.8" />
      <path d="M7 5.2V3.6h4v1.6" />
      <path d="M5 5.2l.7 9.1a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L13 5.2" />
    </>
  ),
  star: <path d="m9 3.2 1.8 3.7 4 .6-2.9 2.8.7 4L9 12.4l-3.6 1.9.7-4L3.2 7.5l4-.6L9 3.2Z" />,
  "star-filled": (
    <path
      d="m9 3.2 1.8 3.7 4 .6-2.9 2.8.7 4L9 12.4l-3.6 1.9.7-4L3.2 7.5l4-.6L9 3.2Z"
      fill="currentColor"
    />
  ),
  clock: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M9 5.6V9l2.4 1.5" />
    </>
  ),
  share: (
    <>
      <path d="M9 11.4V3.4" />
      <path d="m6 6.2 3-2.8 3 2.8" />
      <path d="M4 10.4v3.4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.4" />
    </>
  ),
  comment: (
    <>
      <path d="M3.4 6.2a2 2 0 0 1 2-2h7.2a2 2 0 0 1 2 2v4.2a2 2 0 0 1-2 2H8.2L5 15V12.4a2 2 0 0 1-1.6-2Z" />
    </>
  ),
  grip: (
    <>
      <circle cx="7" cy="5.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="5.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="12.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="m4 9.4 3.2 3.2L14 5.6" />,
  x: <path d="m5 5 8 8M13 5l-8 8" />,
  copy: (
    <>
      <rect x="6.4" y="6.4" width="8" height="8" rx="1.2" />
      <path d="M11.6 6.4V4.6a1.2 1.2 0 0 0-1.2-1.2H4.6a1.2 1.2 0 0 0-1.2 1.2v5.8a1.2 1.2 0 0 0 1.2 1.2h1.8" />
    </>
  ),
  link: (
    <>
      <path d="M7.4 10.6 10.6 7.4" />
      <path d="M8.6 5.4l1.2-1.2a2.8 2.8 0 0 1 4 4l-1.2 1.2" />
      <path d="M9.4 12.6l-1.2 1.2a2.8 2.8 0 0 1-4-4l1.2-1.2" />
    </>
  ),
  type: (
    <>
      <path d="M4.4 4.6h9.2M9 4.6v9.4M6.6 14h4.8" />
    </>
  ),
  heading1: (
    <>
      <path d="M3.4 4.6v9M9.4 4.6v9M3.4 9h6" />
      <path d="M12 8.2 13.8 7v6.6" />
    </>
  ),
  heading2: (
    <>
      <path d="M3 4.6v9M8.4 4.6v9M3 9h5.4" />
      <path d="M11 7.6a1.6 1.6 0 0 1 3 .6c0 1.4-3 2.2-3 4.2h3.2" />
    </>
  ),
  heading3: (
    <>
      <path d="M3 4.6v9M8.4 4.6v9M3 9h5.4" />
      <path d="M11 7.6a1.5 1.5 0 1 1 1.6 2.1 1.5 1.5 0 1 1-1.6 2.7" />
    </>
  ),
  "list-bulleted": (
    <>
      <circle cx="4" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="13" r="1" fill="currentColor" stroke="none" />
      <path d="M7 5h8M7 9h8M7 13h8" />
    </>
  ),
  "list-numbered": (
    <>
      <path d="M7 5h8M7 9h8M7 13h8" />
      <path d="M3 3.8 3.9 3.4v2.4M2.9 9.2a.9.9 0 1 1 1.5.9L3 11.6h1.7M3 12.4a.8.8 0 1 1 .8 1.2" />
    </>
  ),
  todo: (
    <>
      <rect x="2.8" y="2.8" width="6" height="6" rx="1.2" />
      <path d="M11 5.8h4.4M11 12.2h4.4" />
      <rect x="2.8" y="9.8" width="6" height="6" rx="1.2" />
      <path d="m4.2 12.8 1.2 1.2 2-2.4" />
    </>
  ),
  toggle: <path d="m6.6 4.8 4.6 4.2-4.6 4.2" />,
  quote: (
    <>
      <path d="M3.6 11.2V7.4c0-1.6 1-2.8 2.6-3M10.8 11.2V7.4c0-1.6 1-2.8 2.6-3" />
      <path d="M3.6 11.2h2.6M10.8 11.2h2.6" />
    </>
  ),
  callout: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M9 8.2v4M9 5.9v.2" />
    </>
  ),
  code: (
    <>
      <path d="m6.4 6-3 3 3 3M11.6 6l3 3-3 3" />
    </>
  ),
  divider: <path d="M3 9h12" />,
  database: (
    <>
      <ellipse cx="9" cy="4.8" rx="5.6" ry="2.2" />
      <path d="M3.4 4.8v8.4c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V4.8" />
      <path d="M3.4 9c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2" />
    </>
  ),
  table: (
    <>
      <rect x="2.8" y="3.6" width="12.4" height="10.8" rx="1.2" />
      <path d="M2.8 7h12.4M8 7v7.4M2.8 11h12.4" />
    </>
  ),
  board: (
    <>
      <rect x="2.6" y="3.6" width="3.6" height="10.8" rx="1" />
      <rect x="7.2" y="3.6" width="3.6" height="7.4" rx="1" />
      <rect x="11.8" y="3.6" width="3.6" height="9" rx="1" />
    </>
  ),
  list: (
    <>
      <path d="M3 5h12M3 9h12M3 13h8" />
    </>
  ),
  filter: <path d="M2.8 4.6h12.4l-4.8 5.2v4.6l-2.8-1.6V9.8L2.8 4.6Z" />,
  sort: (
    <>
      <path d="M5.4 15V3.6M5.4 3.6 3.2 6M5.4 3.6 7.6 6" />
      <path d="M12.6 3.4v11.4M12.6 14.8l2.2-2.4M12.6 14.8l-2.2-2.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.8" y="4.4" width="12.4" height="10" rx="1.2" />
      <path d="M2.8 7.6h12.4M6.2 3v2.6M11.8 3v2.6" />
    </>
  ),
  user: (
    <>
      <circle cx="9" cy="6.4" r="2.6" />
      <path d="M4 15c0-2.4 2.2-4 5-4s5 1.6 5 4" />
    </>
  ),
  panel: (
    <>
      <rect x="2.8" y="3.4" width="12.4" height="11.2" rx="1.4" />
      <path d="M7.2 3.4v11.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M9 1.8v1.6M9 14.6v1.6M1.8 9h1.6M14.6 9h1.6M4 4l1.1 1.1M12.9 12.9 14 14M14 4l-1.1 1.1M5.1 12.9 4 14" />
    </>
  ),
  moon: <path d="M14.4 11.2A5.8 5.8 0 0 1 6.8 3.6a6 6 0 1 0 7.6 7.6Z" />,
  image: (
    <>
      <rect x="2.8" y="3.6" width="12.4" height="10.8" rx="1.2" />
      <circle cx="6.4" cy="7" r="1.3" />
      <path d="m3.6 13 3.6-3.6L10 12l2-2 3.2 3" />
    </>
  ),
  "arrow-up": <path d="M9 14V4M4.8 8.2 9 4l4.2 4.2" />,
  "arrow-down": <path d="M9 4v10M13.2 9.8 9 14l-4.2-4.2" />,
  lock: (
    <>
      <rect x="3.8" y="8" width="10.4" height="7" rx="1.4" />
      <path d="M6.4 8V6.2a2.6 2.6 0 0 1 5.2 0V8" />
    </>
  ),
  template: (
    <>
      <rect x="2.8" y="3.4" width="12.4" height="11.2" rx="1.4" />
      <path d="M2.8 7h12.4M8 7v7.6" />
    </>
  ),
  upload: (
    <>
      <path d="M9 12V3.6M5.8 6.8 9 3.6l3.2 3.2" />
      <path d="M3.4 12v1.8a1.2 1.2 0 0 0 1.2 1.2h8.8a1.2 1.2 0 0 0 1.2-1.2V12" />
    </>
  ),
  /* ------------------------- reproducción / voz ------------------------- */
  play: <path d="M5.9 3.7 14.1 9 5.9 14.3V3.7Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="5" y="3.8" width="2.8" height="10.4" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="10.2" y="3.8" width="2.8" height="10.4" rx="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="4.9" y="4.9" width="8.2" height="8.2" rx="1.2" fill="currentColor" stroke="none" />,
  "skip-back": (
    <>
      <path d="M12.8 4.2 6.6 9l6.2 4.8V4.2Z" fill="currentColor" stroke="none" />
      <path d="M4.6 4.2v9.6" />
    </>
  ),
  "skip-forward": (
    <>
      <path d="M5.2 4.2 11.4 9l-6.2 4.8V4.2Z" fill="currentColor" stroke="none" />
      <path d="M13.4 4.2v9.6" />
    </>
  ),
  repeat: (
    <>
      <path d="M3.8 8.2a4.4 4.4 0 0 1 4.4-4h4.6M14.2 9.8a4.4 4.4 0 0 1-4.4 4H5.2" />
      <path d="m10.6 2.1 2.2 2.1-2.2 2.1M7.4 11.7l-2.2 2.1 2.2 2.1" />
    </>
  ),
  volume: (
    <>
      <path d="M3.4 7.1h2.3l3.4-3v9.8l-3.4-3H3.4V7.1Z" />
      <path d="M11.7 6.6a3.6 3.6 0 0 1 0 4.8" />
      <path d="M13.6 4.7a6.2 6.2 0 0 1 0 8.6" />
    </>
  ),
  /* ----------------------------- herramientas ---------------------------- */
  timer: (
    <>
      <circle cx="9" cy="9.8" r="5.4" />
      <path d="M9 7v2.9l1.9 1.3" />
      <path d="M6.9 2.6h4.2" />
    </>
  ),
  mindmap: (
    <>
      <circle cx="4.3" cy="9" r="1.9" />
      <circle cx="13.6" cy="4.8" r="1.6" />
      <circle cx="13.6" cy="13.2" r="1.6" />
      <path d="M6.1 8.3 12 5.6M6.1 9.7l5.9 2.7" />
    </>
  ),
  book: (
    <>
      <path d="M9 4.7C7.6 3.7 5.8 3.3 3.8 3.3v10c2 0 3.8.4 5.2 1.4 1.4-1 3.2-1.4 5.2-1.4v-10c-2 0-3.8.4-5.2 1.4Z" />
      <path d="M9 4.7v10" />
    </>
  ),
  download: (
    <>
      <path d="M9 3.6v8.2M5.8 8.6 9 11.8l3.2-3.2" />
      <path d="M3.4 12v1.8a1.2 1.2 0 0 0 1.2 1.2h8.8a1.2 1.2 0 0 0 1.2-1.2V12" />
    </>
  ),
  dock: (
    <>
      <rect x="2.8" y="3.8" width="12.4" height="10.4" rx="1.6" />
      <path d="M11.2 3.8v10.4" />
    </>
  ),
  target: (
    <>
      <circle cx="9" cy="9" r="5.2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="M9 1.6v2M9 14.4v2M1.6 9h2M14.4 9h2" />
    </>
  ),
  sliders: (
    <>
      <path d="M2.8 6.2h12.4M2.8 11.8h12.4" />
      <circle cx="6.4" cy="6.2" r="1.7" />
      <circle cx="11.6" cy="11.8" r="1.7" />
    </>
  ),
  folder: (
    <path d="M2.4 5.2c0-.7.6-1.2 1.2-1.2h3.2l1.6 1.8h6c.7 0 1.2.6 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3.6c-.7 0-1.2-.5-1.2-1.2V5.2Z" />
  ),
  file: (
    <>
      <path d="M4.6 2.4h5.2l3.6 3.6v9.6H4.6V2.4Z" />
      <path d="M9.6 2.6v3.6h3.6" />
    </>
  ),
  timeline: (
    <>
      <path d="M2.6 4.6h8.2M5.4 9h8.6M3.8 13.4h7" />
      <circle cx="12.6" cy="4.6" r="1.4" />
    </>
  ),
  paperclip: (
    <path d="M12.4 8.6 8 13a2.7 2.7 0 0 1-3.8-3.8l5-5a1.9 1.9 0 0 1 2.7 2.7l-5 5a1 1 0 0 1-1.5-1.3l4.4-4.4" />
  ),
};

interface Props extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 18, className, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {P[name]}
    </svg>
  );
}
