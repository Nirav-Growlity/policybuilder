"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Download,
  Edit3,
  FileText,
  Filter,
  Globe2,
  Info,
  Leaf,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  FileCheck,
  Flag,
  Hash,
  Lightbulb,
  Mail,
  MapPin,
  Pencil,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Tag,
  Trash,
  Type,
  User,
  Eye,
} from "lucide-react";
import * as React from "react";
import { clsx } from "clsx";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Download,
  Edit3,
  FileText,
  Filter,
  Globe2,
  Info,
  Leaf,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  FileCheck,
  Flag,
  Hash,
  Lightbulb,
  Mail,
  MapPin,
  Pencil,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Tag,
  Trash,
  Type,
  User,
  Eye,
};

export interface IconProps {
  name: keyof typeof ICONS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className }: IconProps) {
  const Cmp = ICONS[name as string] ?? Circle;
  return <Cmp size={size} className={className} />;
}

export const StepIcon = ({ id, size = 16, className }: { id: string; size?: number; className?: string }) => {
  return <Icon name={id} size={size} className={clsx("text-current", className)} />;
};
