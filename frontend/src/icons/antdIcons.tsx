/**
 * antdIcons.tsx — @ant-design/icons → Lucide 适配层
 *
 * 通过 vite alias 把 `@ant-design/icons` 整体指向本文件，60 个业务文件零改动
 * 即完成图标代际升级（16px 网格、1.75px 细描边、圆角端点，Linear/Raycast 同款语言）。
 *
 * 兼容 antd 图标 API：style / className / spin / rotate / twoToneColor（忽略色调参数）。
 * 尺寸用 1em，跟随 font-size 缩放，与 antd 图标行为一致。
 */
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpNarrowWide,
  BadgeCheck,
  Bell,
  Bot,
  ChartColumn,
  ChartLine,
  Check,
  CircleAlert,
  CircleCheck,
  CircleCheckBig,
  CircleHelp,
  CirclePause,
  CirclePlay,
  CircleStop,
  CircleX,
  Clock,
  Code,
  Command,
  Copy,
  Database,
  Download,
  Ellipsis,
  Eraser,
  Eye,
  EyeOff,
  FileDiff,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Folder,
  FolderKanban,
  FolderOpen,
  FunctionSquare,
  Funnel,
  Gauge,
  GitCompareArrows,
  Globe,
  GripVertical,
  HardDrive,
  History,
  House,
  Info,
  KeyRound,
  Languages,
  Laptop,
  LayoutGrid,
  Lightbulb,
  Link,
  List,
  LoaderCircle,
  Maximize,
  Maximize2,
  MessageSquare,
  Minus,
  Moon,
  PaintBucket,
  Paintbrush,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  Send,
  Server,
  Settings,
  Share,
  ShieldCheck,
  Sigma,
  SquareTerminal,
  Star,
  Sun,
  Table,
  Trash2,
  TriangleAlert,
  TriangleRight,
  Undo2,
  Unplug,
  Upload,
  User,
  Webhook,
  X,
  Zap,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';

interface AntdIconProps {
  style?: CSSProperties;
  className?: string;
  /** antd 的旋转动画开关 */
  spin?: boolean;
  rotate?: number;
  twoToneColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  title?: string;
  onClick?: MouseEventHandler<SVGSVGElement>;
  children?: ReactNode;
  [key: string]: unknown;
}

/** 生成一个兼容 antd 图标 props 的 Lucide 包装组件 */
function icon(Cmp: LucideIcon, opts?: { filled?: boolean; strokeWidth?: number }) {
  function Wrapped({
    style,
    className,
    spin,
    rotate,
    twoToneColor: _twoToneColor,
    primaryColor: _primaryColor,
    secondaryColor: _secondaryColor,
    ...rest
  }: AntdIconProps) {
    return (
      <Cmp
        size="1em"
        strokeWidth={opts?.strokeWidth ?? 1.8}
        fill={opts?.filled ? 'currentColor' : 'none'}
        className={className}
        style={{
          verticalAlign: '-0.125em',
          flexShrink: 0,
          ...(spin ? { animation: 'anticon-spin 1s linear infinite' } : null),
          ...(rotate ? { transform: `rotate(${rotate}deg)` } : null),
          ...style,
        }}
        {...(rest as Record<string, unknown>)}
      />
    );
  }
  Wrapped.displayName = `Lucide(${Cmp.displayName ?? 'Icon'})`;
  return Wrapped;
}

/* ── 名称映射：antd 图标名 → Lucide 图标（业务代码 import 名称保持不变） ── */
export const ApiOutlined = icon(Webhook);
export const AppstoreOutlined = icon(LayoutGrid);
export const ArrowDownOutlined = icon(ArrowDown);
export const ArrowUpOutlined = icon(ArrowUp);
export const BarChartOutlined = icon(ChartColumn);
export const BellOutlined = icon(Bell);
export const BgColorsOutlined = icon(PaintBucket);
export const BookOutlined = icon(FileText);
export const BulbOutlined = icon(Lightbulb);
export const CaretRightOutlined = icon(TriangleRight);
export const CheckCircleFilled = icon(CircleCheckBig);
export const CheckCircleOutlined = icon(CircleCheck);
export const CheckOutlined = icon(Check);
export const ClearOutlined = icon(Eraser);
export const ClockCircleOutlined = icon(Clock);
export const CloseCircleFilled = icon(CircleX);
export const CloseCircleOutlined = icon(CircleX);
export const CloseOutlined = icon(X);
export const CloudServerOutlined = icon(Server);
export const CodeOutlined = icon(Code);
export const ColumnHeightOutlined = icon(Maximize2);
export const ColumnWidthOutlined = icon(PanelLeft);
export const CommentOutlined = icon(MessageSquare);
export const ConsoleSqlOutlined = icon(SquareTerminal);
export const CopyOutlined = icon(Copy);
export const DashboardOutlined = icon(Gauge);
export const DatabaseOutlined = icon(Database);
export const DeleteOutlined = icon(Trash2);
export const DiffOutlined = icon(FileDiff);
export const DisconnectOutlined = icon(Unplug);
export const DownOutlined = icon(ChevronDown);
export const DownloadOutlined = icon(Download);
export const DragOutlined = icon(GripVertical);
export const EditOutlined = icon(Pencil);
export const ExclamationCircleOutlined = icon(CircleAlert);
export const ExpandAltOutlined = icon(Maximize);
export const ExperimentOutlined = icon(FlaskConical);
export const ExportOutlined = icon(Share);
export const EyeInvisibleOutlined = icon(EyeOff);
export const EyeOutlined = icon(Eye);
export const FileExcelOutlined = icon(FileSpreadsheet);
export const FileTextOutlined = icon(FileText);
export const FilterOutlined = icon(Funnel);
export const FolderOpenOutlined = icon(FolderOpen);
export const FolderOutlined = icon(Folder);
export const FormatPainterOutlined = icon(Paintbrush);
export const FullscreenOutlined = icon(Maximize);
export const FunctionOutlined = icon(FunctionSquare);
export const GlobalOutlined = icon(Globe);
export const HddOutlined = icon(HardDrive);
export const HistoryOutlined = icon(History);
export const HomeOutlined = icon(House);
export const ImportOutlined = icon(Download);
export const InfoCircleOutlined = icon(Info);
export const KeyOutlined = icon(KeyRound);
export const LaptopOutlined = icon(Laptop);
export const LayoutOutlined = icon(PanelLeft);
export const LineChartOutlined = icon(ChartLine);
export const LinkOutlined = icon(Link);
export const LoadingOutlined = icon(LoaderCircle);
export const MacCommandOutlined = icon(Command);
export const MinusOutlined = icon(Minus);
export const MoonOutlined = icon(Moon);
export const MoreOutlined = icon(Ellipsis);
export const PauseCircleOutlined = icon(CirclePause);
export const PlayCircleOutlined = icon(CirclePlay);
export const PlusOutlined = icon(Plus);
export const ProjectOutlined = icon(FolderKanban);
export const PushpinFilled = icon(Pin, { filled: true });
export const PushpinOutlined = icon(Pin);
export const QuestionCircleOutlined = icon(CircleHelp);
export const ReloadOutlined = icon(RotateCw);
export const RobotOutlined = icon(Bot);
export const SafetyCertificateOutlined = icon(BadgeCheck);
export const SafetyOutlined = icon(ShieldCheck);
export const SaveOutlined = icon(Save);
export const SearchOutlined = icon(Search);
export const SendOutlined = icon(Send);
export const SettingOutlined = icon(Settings);
export const SortAscendingOutlined = icon(ArrowUpNarrowWide);
export const StarFilled = icon(Star, { filled: true });
export const StarOutlined = icon(Star);
export const StopOutlined = icon(CircleStop);
export const SunOutlined = icon(Sun);
export const SwapOutlined = icon(ArrowLeftRight);
export const SyncOutlined = icon(RefreshCw);
export const TableOutlined = icon(Table);
export const ThunderboltOutlined = icon(Zap);
export const TranslationOutlined = icon(Languages);
export const UndoOutlined = icon(Undo2);
export const UnorderedListOutlined = icon(List);
export const UpOutlined = icon(ChevronUp);
export const UploadOutlined = icon(Upload);
export const UserOutlined = icon(User);
export const WarningOutlined = icon(TriangleAlert);
export const RightOutlined = icon(ChevronRight);
export const DiffCompareOutlined = icon(GitCompareArrows);
export const SigmaOutlined = icon(Sigma);
