// 内联 SVG 图标（避免引入图标库依赖；currentColor 继承文字色）

interface IconProps {
  className?: string;
}

function base(className?: string) {
  return {
    className: className ?? 'h-5 w-5',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function IconHome({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg {...base(className)} fill="currentColor" stroke="none">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

export function IconHeart({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(className)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20.5s-8-4.7-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.1c0 5.7-8 10.4-8 10.4Z" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 4H5v16h4" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m9.5 5 7 7-7 7" />
    </svg>
  );
}

export function IconFilm({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.2 3H9.8L9.5 5.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.3 2.6h4.4l.3-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z" />
    </svg>
  );
}
