import { IconType } from 'react-icons';
import {
  LuBan,
  LuBot,
  LuCheck,
  LuDatabaseZap,
  LuHourglass,
  LuListOrdered,
  LuLoaderCircle,
  LuMilkOff,
  LuMinus,
  LuPackageSearch,
  LuScale,
  LuScrollText,
  LuShoppingCart,
  LuUserCheck,
} from 'react-icons/lu';
import { StepKind, StepStatus } from './graph';

export const stepIcon: Record<string, IconType> = {
  request: LuBot,
  lookup: LuDatabaseZap,
  stock: LuPackageSearch,
  substitutes: LuListOrdered,
  lactose: LuMilkOff,
  policy: LuScale,
  approval: LuUserCheck,
  order: LuShoppingCart,
  audit: LuScrollText,
};

export const kindLabel: Record<StepKind, string> = {
  trigger: 'Trigger',
  valio: 'Valio Aimo',
  rule: 'Hard rule',
  rank: 'Agent logic',
  policy: 'Signed policy',
  human: 'Human',
  action: 'Action',
  audit: 'Audit',
};

export const statusMeta: Record<StepStatus, { color: string; label: string; icon: IconType }> = {
  idle: { color: 'status.idle', label: 'Not run', icon: LuMinus },
  running: { color: 'status.running', label: 'Running', icon: LuLoaderCircle },
  auto: { color: 'status.auto', label: 'Passed', icon: LuCheck },
  pending: { color: 'status.pending', label: 'Needs a person', icon: LuHourglass },
  blocked: { color: 'status.blocked', label: 'Blocked', icon: LuBan },
  skipped: { color: 'status.idle', label: 'Skipped', icon: LuMinus },
};
