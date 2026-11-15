import { Page, PageHeader, PageIntro } from '@/components/kit';
import { TryItPanel } from './TryItPanel';

/** /app/try — the judge challenges, one link away from the sandbox chip. */
export const TryItPage = () => (
  <Page header={<PageHeader trail={['Try it']} />} maxWidth="760px">
    <PageIntro title="Try it" description="Six quick challenges against live Valio — each opens the real screen with an example filled in." />
    <TryItPanel />
  </Page>
);
