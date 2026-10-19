import { useEffect, useState, useRef } from 'react';
import { LogOut, RefreshCw, Loader2, Wifi, WifiOff, Package, BarChart3, ShoppingCart, ClipboardList, Boxes, Receipt, Lock, Wallet, PackageCheck, History, Download, X, BookOpen } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NavProvider, useNav, type OwnerTab, type ManagerTab } from '@/context/NavContext';
import { ToastProvider } from '@/context/ToastContext';
import AuthScreen from '@/screens/AuthScreen';
import SaleScreen from '@/screens/SaleScreen';
import TodayScreen from '@/screens/TodayScreen';
import ProductsScreen from '@/screens/ProductsScreen';
import StockScreen from '@/screens/StockScreen';
import ReportsScreen from '@/screens/ReportsScreen';
import ManagersScreen from '@/screens/ManagersScreen';
import CloseScreen from '@/screens/CloseScreen';
import ExpensesScreen from '@/screens/ExpensesScreen';
import ConsignmentsScreen from '@/screens/ConsignmentsScreen';
import SalesHistoryScreen from '@/screens/SalesHistoryScreen';
import GuideScreen from '@/screens/GuideScreen';
import { usePwaInstall } from '@/lib/usePwaInstall';
import { syncAll, type SyncResult } from '@/lib/sync';
import { pendingCount } from '@/lib/offline-db';

function Shell() {
  const { session, profile, loading, signOut } = useAuth();
  const { ownerTab, managerTab, setOwnerTab, setManagerTab } = useNav();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const { canInstall, promptInstall, dismiss: dismissInstall } = usePwaInstall();
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshPending() {
    setPending(await pendingCount());
  }

  useEffect(() => {
    if (session) refreshPending();
    const onOnline = () => { setOnline(true); autoSync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Show guide on first login
  useEffect(() => {
    if (session && profile) {
      const key = `guide-seen-${profile.id}`;
      if (!localStorage.getItem(key)) {
        setShowGuide(true);
        localStorage.setItem(key, '1');
      }
    }
  }, [session, profile]);

  async function autoSync() {
    const count = await pendingCount();
    if (count === 0) return;
    await doSync();
  }

  async function doSync() {
    if (!navigator.onLine) {
      setSyncResult({ ok: 0, failed: 0, errors: ['Hors ligne — reconnecte-toi pour synchroniser.'] });
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => setSyncResult(null), 3000);
      return;
    }
    setSyncing(true);
    try {
      const r = await syncAll();
      setSyncResult(r);
      await refreshPending();
    } catch {
      setSyncResult({ ok: 0, failed: 0, errors: ['Erreur de synchronisation. Réessaie dans un moment.'] });
    } finally {
      setSyncing(false);
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => setSyncResult(null), 3500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!session || !profile) return <AuthScreen />;

  const isOwner = profile.role === 'owner';

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-sky-700 text-white px-4 py-2.5 flex items-center gap-3 shadow-md safe-top">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">Buvette Pro</div>
          <div className="text-xs text-sky-100 truncate">
            {profile.full_name || profile.id.slice(0, 8)} · {isOwner ? 'Propriétaire' : 'Gérante'}
          </div>
        </div>

        <button onClick={() => setShowGuide(true)} className="p-1.5 hover:bg-sky-600 rounded-lg" title="Guide d'utilisation">
          <BookOpen className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 text-xs">
          {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4 text-sky-200" />}
          <span className="hidden sm:inline">{online ? 'En ligne' : 'Hors ligne'}</span>
        </div>

        {pending > 0 && (
          <button
            onClick={doSync}
            disabled={syncing}
            className="bg-amber-400 text-amber-900 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1.5"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {pending} en attente
          </button>
        )}

        <button onClick={signOut} className="p-1.5 hover:bg-sky-600 rounded-lg">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-hidden">
        {isOwner ? <OwnerArea tab={ownerTab} /> : <ManagerArea tab={managerTab} onPendingChange={setPending} />}
      </div>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-slate-200 flex overflow-x-auto no-scrollbar safe-bottom">
        {isOwner ? (
          <>
            <TabBtn active={ownerTab === 'products'} onClick={() => setOwnerTab('products')} icon={<Package className="w-5 h-5" />} label="Boissons" />
            <TabBtn active={ownerTab === 'stock'} onClick={() => setOwnerTab('stock')} icon={<Boxes className="w-5 h-5" />} label="Stock" />
            <TabBtn active={ownerTab === 'reports'} onClick={() => setOwnerTab('reports')} icon={<BarChart3 className="w-5 h-5" />} label="Rapports" />
            <TabBtn active={ownerTab === 'sales'} onClick={() => setOwnerTab('sales')} icon={<History className="w-5 h-5" />} label="Ventes" />
            <TabBtn active={ownerTab === 'consignments'} onClick={() => setOwnerTab('consignments')} icon={<PackageCheck className="w-5 h-5" />} label="Consignes" />
            <TabBtn active={ownerTab === 'managers'} onClick={() => setOwnerTab('managers')} icon={<ClipboardList className="w-5 h-5" />} label="Gérantes" />
          </>
        ) : (
          <>
            <TabBtn active={managerTab === 'sell'} onClick={() => setManagerTab('sell')} icon={<ShoppingCart className="w-5 h-5" />} label="Vendre" />
            <TabBtn active={managerTab === 'today'} onClick={() => setManagerTab('today')} icon={<Receipt className="w-5 h-5" />} label="Ventes" />
            <TabBtn active={managerTab === 'stock'} onClick={() => setManagerTab('stock')} icon={<Boxes className="w-5 h-5" />} label="Stock" />
            <TabBtn active={managerTab === 'consignments'} onClick={() => setManagerTab('consignments')} icon={<PackageCheck className="w-5 h-5" />} label="Consignes" />
            <TabBtn active={managerTab === 'expenses'} onClick={() => setManagerTab('expenses')} icon={<Wallet className="w-5 h-5" />} label="Dépenses" />
            <TabBtn active={managerTab === 'close'} onClick={() => setManagerTab('close')} icon={<Lock className="w-5 h-5" />} label="Clôture" />
          </>
        )}
      </nav>

      {syncResult && (
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 max-w-[90vw] text-center ${
          syncResult.failed === 0 && (syncResult.errors?.length ?? 0) === 0 ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
        }`}>
          {syncResult.errors && syncResult.errors.length > 0
            ? syncResult.errors[0]
            : `${syncResult.ok} opération(s) synchronisée(s)${syncResult.failed > 0 ? `, ${syncResult.failed} échec(s)` : ''}`}
        </div>
      )}

      {/* PWA install banner */}
      {canInstall && (
        <div className="fixed bottom-16 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 bg-sky-600 text-white rounded-2xl shadow-xl p-3 z-40 flex items-center gap-3">
          <Download className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Installer Buvette Pro</div>
            <div className="text-xs text-sky-100">Accès rapide depuis l'écran d'accueil</div>
          </div>
          <button onClick={promptInstall} className="bg-white text-sky-700 px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap">
            Installer
          </button>
          <button onClick={dismissInstall} className="p-1 hover:bg-sky-500 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Guide */}
      {showGuide && profile && (
        <GuideScreen role={profile.role === 'owner' ? 'owner' : 'manager'} onClose={() => setShowGuide(false)} />
      )}
    </div>
  );
}

function OwnerArea({ tab }: { tab: OwnerTab }) {
  if (tab === 'products') return <ProductsScreen />;
  if (tab === 'stock') return <StockScreen />;
  if (tab === 'reports') return <ReportsScreen />;
  if (tab === 'sales') return <SalesHistoryScreen />;
  if (tab === 'consignments') return <ConsignmentsScreen />;
  if (tab === 'managers') return <ManagersScreen />;
  return null;
}

function ManagerArea({ tab, onPendingChange }: { tab: ManagerTab; onPendingChange: (n: number) => void }) {
  if (tab === 'sell') return <SaleScreen onPendingChange={onPendingChange} />;
  if (tab === 'today') return <TodayScreen />;
  if (tab === 'stock') return <StockScreen manager />;
  if (tab === 'consignments') return <ConsignmentsScreen />;
  if (tab === 'expenses') return <ExpensesScreen />;
  if (tab === 'close') return <CloseScreen />;
  return null;
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[72px] flex flex-col items-center gap-0.5 py-2.5 transition ${
        active ? 'text-sky-600' : 'text-slate-400'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <NavProvider>
          <Shell />
        </NavProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
