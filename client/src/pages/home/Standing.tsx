import { Page, PageHeader } from '@/components/kit';
import { Automations } from './Automations';

/** /app/standing — standing orders an agent places on its own schedule. Linked from Home. */
export const StandingOrdersPage = () => (
  <Page header={<PageHeader trail={['Standing orders']} />} maxWidth="760px">
    <Automations />
  </Page>
);
