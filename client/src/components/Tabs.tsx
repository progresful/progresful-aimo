import { Tabs as ChakraTabs } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router';

type TabItem = {
  icon?: ReactNode;
  id: string;
  label: string;
};
type Props = {
  items: TabItem[];
  active: string;
};

export const RoutedTabs = ({ items, active }: Props) => {
  const navigate = useNavigate();
  return (
    <ChakraTabs.Root value={active} onValueChange={({ value }) => navigate(value)}>
      <ChakraTabs.List>
        {items.map((item) => (
          <ChakraTabs.Trigger value={item.id} key={item.id}>
            {item.icon}
            {item.label}
          </ChakraTabs.Trigger>
        ))}
      </ChakraTabs.List>
      <ChakraTabs.Content value={active}>
        <Outlet />
      </ChakraTabs.Content>
    </ChakraTabs.Root>
  );
};
