import { createContext, useContext, useState, type ReactNode } from 'react';

export type OwnerTab = 'products' | 'stock' | 'reports' | 'sales' | 'consignments' | 'managers';
export type ManagerTab = 'sell' | 'today' | 'stock' | 'expenses' | 'consignments' | 'close';

interface NavValue {
  ownerTab: OwnerTab;
  managerTab: ManagerTab;
  setOwnerTab: (t: OwnerTab) => void;
  setManagerTab: (t: ManagerTab) => void;
}

const NavContext = createContext<NavValue | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [ownerTab, setOwnerTab] = useState<OwnerTab>('products');
  const [managerTab, setManagerTab] = useState<ManagerTab>('sell');
  return (
    <NavContext.Provider value={{ ownerTab, managerTab, setOwnerTab, setManagerTab }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
