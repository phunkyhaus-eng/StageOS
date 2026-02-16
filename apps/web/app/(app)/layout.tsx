import { AppShell } from '@/components/shell/app-shell';

export default function StageOSLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
