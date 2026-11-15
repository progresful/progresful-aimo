import { Box, Button, Flex, IconButton, Menu, Portal, Skeleton, Stack, Switch, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuEllipsis, LuPlus } from 'react-icons/lu';
import { Automation, useAutomations, useDeleteAutomation, useRunAutomation, useUpdateAutomation } from '@/api/gateway';
import { EmptyHint, Leader, PageIntro, Panel, Stamp } from '@/components/kit';
import { toaster } from '@/components/ui/toaster';
import { eur, num } from '@/pages/playbook/graph';
import { useNow } from '@/pages/playbook/useNow';
import { doneSentence } from '@/pages/workspace/model';
import { AutomationDialog } from './AutomationDialog';
import { DAYS, errorText, relative, shortName, when } from './format';

/** Standing orders an agent places on its own: the page body of /app/standing. */
export const Automations = () => {
  const automations = useAutomations();
  const [editing, setEditing] = useState<Automation | null>(null);
  const [open, setOpen] = useState(false);
  useNow(30_000); // keep "in 3 h" fresh

  const openDialog = (a: Automation | null) => {
    setEditing(a);
    setOpen(true);
  };

  const list = automations.data ?? [];
  return (
    <Box>
      <PageIntro
        title="Standing orders"
        description="Orders an agent places on its own schedule — each one still goes through your signed rules."
        actions={
          <Button size="sm" borderRadius="l2" onClick={() => openDialog(null)}>
            <LuPlus /> New standing order
          </Button>
        }
      />
      {automations.isLoading ? (
        <Skeleton height="220px" borderRadius="l3" />
      ) : automations.isError ? (
        <Text fontSize="13px" color="fg.subtle">
          Couldn’t load the schedule — {errorText(automations.error)}
        </Text>
      ) : !list.length ? (
        <EmptyHint>
          Nothing scheduled yet. Set up a standing order — say, lactose-free milk every Monday and Thursday at 06:00 — and an agent places it
          on time.
        </EmptyHint>
      ) : (
        <Stack gap={5}>
          {list.map((a) => (
            <AutomationRow key={a.id} automation={a} onEdit={() => openDialog(a)} />
          ))}
        </Stack>
      )}
      <AutomationDialog open={open} automation={editing} onClose={() => setOpen(false)} />
    </Box>
  );
};

const AutomationRow = ({ automation: a, onEdit }: { automation: Automation; onEdit: () => void }) => {
  const navigate = useNavigate();
  const update = useUpdateAutomation();
  const run = useRunAutomation();
  const del = useDeleteAutomation();

  const runNow = () =>
    run.mutate(a.id, {
      onSuccess: (r) =>
        toaster.create({
          type: r.decision === 'execute' ? 'success' : r.decision === 'needs_approval' ? 'warning' : 'error',
          title:
            r.decision === 'execute'
              ? `${a.name} — ordered`
              : r.decision === 'needs_approval'
                ? `${a.name} — waiting for approval`
                : `${a.name} — blocked`,
          description: eur(r.order.committedTotal || r.order.total),
          action: { label: 'Open run', onClick: () => navigate(`/app/runs/${r.order.id}`) },
        }),
      onError: (err) => toaster.create({ type: 'error', title: `Couldn’t run ${a.name}`, description: errorText(err) }),
    });

  const remove = () =>
    del.mutate(a.id, {
      onSuccess: () => toaster.create({ type: 'info', title: 'Automation deleted', description: a.name }),
      onError: (err) => toaster.create({ type: 'error', title: 'Couldn’t delete', description: errorText(err) }),
    });

  const lastTone = a.lastRun ? doneSentence({ status: a.lastRun.status, approval: null, committedTotal: a.lastRun.committedTotal }).tone : null;

  return (
    <Panel as="article" paddingX={6} paddingTop={5} paddingBottom={4}>
      <Flex align="start" gap={4}>
        <Box flex={1} minWidth={0}>
          <Text as="h2" textStyle="title" fontSize="24px" truncate color={a.enabled ? 'fg' : 'fg.muted'}>
            {a.name}
          </Text>
          <Text marginTop={1} fontSize="13px" color="fg.subtle" truncate>
            Placed by {a.agent.name} · {a.lines.length} product{a.lines.length === 1 ? '' : 's'}
          </Text>
        </Box>
        <Stamp tone={a.enabled ? 'auto' : 'idle'}>{a.enabled ? 'On schedule' : 'Paused'}</Stamp>
        <Switch.Root
          size="sm"
          checked={a.enabled}
          disabled={update.isPending}
          aria-label={a.enabled ? 'On' : 'Paused'}
          marginTop="1px"
          onCheckedChange={(e) =>
            update.mutate(
              { id: a.id, enabled: e.checked },
              { onError: (err) => toaster.create({ type: 'error', title: 'Couldn’t update', description: errorText(err) }) }
            )
          }
        >
          <Switch.HiddenInput />
          <Switch.Control />
        </Switch.Root>
        <Menu.Root
          positioning={{ placement: 'bottom-end' }}
          onSelect={({ value }) =>
            value === 'run'
              ? runNow()
              : value === 'builder'
                ? navigate(`/app/new?automation=${a.id}`)
                : value === 'edit'
                  ? onEdit()
                  : value === 'delete'
                    ? remove()
                    : value === 'last' && a.lastRun
                      ? navigate(`/app/runs/${a.lastRun.orderId}`)
                      : null
          }
        >
          <Menu.Trigger asChild>
            <IconButton aria-label="More" size="xs" variant="ghost" color="fg.muted" marginTop="-4px" loading={run.isPending || del.isPending}>
              <LuEllipsis />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minWidth="170px">
                <Menu.Item value="run">Run now</Menu.Item>
                <Menu.Item value="edit">Edit</Menu.Item>
                <Menu.Item value="builder">Open as a new order</Menu.Item>
                {a.lastRun ? <Menu.Item value="last">Open last run</Menu.Item> : null}
                <Menu.Separator />
                <Menu.Item value="delete" color="status.blocked" _hover={{ bg: 'status.blocked/8' }}>
                  Delete
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Flex>

      {/* The schedule as a printed week: the run days inked, the rest left blank. */}
      <Flex align="center" gap={5} marginTop={5} paddingY={3} borderTopWidth="1px" borderBottomWidth="1px" borderColor="border.strong" opacity={a.enabled ? 1 : 0.6}>
        <Flex gap={1}>
          {DAYS.map((d, i) => {
            const on = a.schedule.days.includes(i + 1);
            return (
              <Text
                key={d}
                className="tnum"
                fontSize="11.5px"
                width="38px"
                textAlign="center"
                paddingY={1}
                borderRadius="l1"
                borderWidth="1px"
                borderColor={on ? 'fg' : 'transparent'}
                color={on ? 'fg' : 'fg.subtle'}
                fontWeight={on ? '600' : '400'}
              >
                {d}
              </Text>
            );
          })}
        </Flex>
        <Text fontSize="20px" className="tnum" lineHeight="1">
          {a.schedule.time}
        </Text>
        <Box flex={1} />
        <Box textAlign="right" minWidth={0}>
          <Text textStyle="caps" color="fg.subtle">
            Next run
          </Text>
          <Text fontSize="12.5px" className="tnum" marginTop={0.5} truncate color={a.enabled ? 'fg' : 'fg.subtle'}>
            {a.enabled ? (a.nextRunAt ? `${when(a.nextRunAt)} · ${relative(a.nextRunAt)}` : '—') : 'paused'}
          </Text>
        </Box>
      </Flex>

      <Stack gap={1.5} marginTop={4}>
        {a.lines.map((l) => (
          <Leader key={l.code} label={shortName(l.name)} value={`${num(l.quantity)} ${l.unit}`} />
        ))}
      </Stack>

      <Flex align="center" gap={3} marginTop={4} fontSize="12px" color="fg.subtle" flexWrap="wrap">
        <Text>
          Delivery{' '}
          <Text as="span" color="fg.muted">
            {a.schedule.leadDays === 0 ? 'same day' : a.schedule.leadDays === 1 ? 'next day' : `${a.schedule.leadDays} days later`}
          </Text>
        </Text>
        <Text>·</Text>
        <Text>
          Checked against{' '}
          <Text as="span" fontFamily="mono" color="fg.muted">
            {a.policy.key} v{a.policy.version}
          </Text>
        </Text>
        <Box flex={1} />
        {a.lastRun && lastTone ? (
          <Flex align="center" gap={2}>
            <Text>Last run {relative(a.lastRun.at)}</Text>
            <Stamp tone={lastTone}>{a.lastRun.committedTotal ? eur(a.lastRun.committedTotal) : 'Nothing ordered'}</Stamp>
          </Flex>
        ) : (
          <Text fontWeight="550" fontSize="14px">
            Not run yet
          </Text>
        )}
      </Flex>
    </Panel>
  );
};
