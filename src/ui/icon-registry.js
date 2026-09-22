import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CircleGauge,
  ClipboardList,
  createIcons,
  Download,
  Eye,
  EyeOff,
  LayoutDashboard,
  Library,
  ListChecks,
  Map as MapIcon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Upload,
  UserRound,
  X
} from "lucide";

const APP_ICONS = Object.freeze({
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CircleGauge,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  LayoutDashboard,
  Library,
  ListChecks,
  Map: MapIcon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Upload,
  UserRound,
  X
});

const NAV_ICON_NAMES = Object.freeze({
  home: "layout-dashboard",
  today: "list-checks",
  week: "calendar-days",
  path: "map",
  grid: "book-open-check",
  records: "clipboard-list",
  review: "rotate-ccw",
  scores: "bar-chart-3",
  resources: "library",
  settings: "settings"
});

export function navIconName(icon) {
  return NAV_ICON_NAMES[icon] || "circle-gauge";
}

export function hydrateIcons(root = document) {
  root.querySelectorAll(".nav-item[data-icon]").forEach((button) => {
    const node = button.querySelector(".nav-ico");
    if (!node || node.dataset.lucide) return;
    node.setAttribute("data-lucide", navIconName(button.dataset.icon || ""));
    node.setAttribute("aria-hidden", "true");
  });

  createIcons({
    icons: APP_ICONS,
    root,
    attrs: {
      width: 17,
      height: 17,
      strokeWidth: 1.9
    }
  });
}
