import type {
  Sale,
  Expense,
  StockMovement,
  Consignment,
  CashSession,
} from '@/types/db';

const DB_NAME = 'buvette_offline';
const DB_VERSION = 1;
const STORE_SALES = 'sales';
const STORE_EXPENSES = 'expenses';
const STORE_STOCK = 'stock_movements';
const STORE_CONSIGNMENTS = 'consignments';
const STORE_CASH = 'cash_sessions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        const s = db.createObjectStore(STORE_SALES, { keyPath: 'device_sale_id' });
        s.createIndex('synced', 'synced_at');
      }
      if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
        const s = db.createObjectStore(STORE_EXPENSES, { keyPath: 'device_expense_id' });
        s.createIndex('synced', 'synced_at');
      }
      if (!db.objectStoreNames.contains(STORE_STOCK)) {
        const s = db.createObjectStore(STORE_STOCK, { keyPath: 'device_mvmt_id' });
        s.createIndex('synced', 'synced_at');
      }
      if (!db.objectStoreNames.contains(STORE_CONSIGNMENTS)) {
        const s = db.createObjectStore(STORE_CONSIGNMENTS, { keyPath: 'device_consignment_id' });
        s.createIndex('synced', 'synced_at');
      }
      if (!db.objectStoreNames.contains(STORE_CASH)) {
        const s = db.createObjectStore(STORE_CASH, { keyPath: 'device_session_id' });
        s.createIndex('synced', 'synced_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest | IDBRequest[],
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve((Array.isArray(result) ? result[0] : result) as unknown as T);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise<T>(r: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

// ===== SALES =====

export async function putSale(sale: Sale): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_SALES, 'readwrite');
    t.objectStore(STORE_SALES).put(sale);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getSale(deviceSaleId: string): Promise<Sale | undefined> {
  return tx<Sale | undefined>(STORE_SALES, 'readonly', (s) => s.get(deviceSaleId));
}

export async function listSales(): Promise<Sale[]> {
  const db = await openDb();
  return reqToPromise<Sale[]>(db.transaction(STORE_SALES, 'readonly').objectStore(STORE_SALES).getAll());
}

export async function listPendingSales(): Promise<Sale[]> {
  const all = await listSales();
  return all.filter((s) => !s.synced_at && s.status !== 'cancelled');
}

export async function listHeldSales(): Promise<Sale[]> {
  const all = await listSales();
  return all.filter((s) => s.status === 'held');
}

export async function markSaleSynced(deviceSaleId: string): Promise<void> {
  const sale = await getSale(deviceSaleId);
  if (!sale) return;
  sale.synced_at = new Date().toISOString();
  await putSale(sale);
}

// ===== EXPENSES =====

export async function putExpense(e: Expense): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_EXPENSES, 'readwrite');
    t.objectStore(STORE_EXPENSES).put(e);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listExpenses(): Promise<Expense[]> {
  const db = await openDb();
  return reqToPromise<Expense[]>(db.transaction(STORE_EXPENSES, 'readonly').objectStore(STORE_EXPENSES).getAll());
}

export async function listPendingExpenses(): Promise<Expense[]> {
  return (await listExpenses()).filter((e) => !e.synced_at);
}

export async function markExpenseSynced(id: string): Promise<void> {
  const db = await openDb();
  const all = await listExpenses();
  const e = all.find((x) => x.device_expense_id === id);
  if (!e) return;
  e.synced_at = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_EXPENSES, 'readwrite');
    t.objectStore(STORE_EXPENSES).put(e);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ===== STOCK MOVEMENTS =====

export async function putStockMovement(m: StockMovement): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_STOCK, 'readwrite');
    t.objectStore(STORE_STOCK).put(m);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listPendingStock(): Promise<StockMovement[]> {
  const db = await openDb();
  const all = await reqToPromise<StockMovement[]>(db.transaction(STORE_STOCK, 'readonly').objectStore(STORE_STOCK).getAll());
  return all.filter((m) => !m.synced_at);
}

export async function markStockSynced(id: string): Promise<void> {
  const db = await openDb();
  const all = await reqToPromise<StockMovement[]>(db.transaction(STORE_STOCK, 'readonly').objectStore(STORE_STOCK).getAll());
  const m = all.find((x) => x.device_mvmt_id === id);
  if (!m) return;
  m.synced_at = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_STOCK, 'readwrite');
    t.objectStore(STORE_STOCK).put(m);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ===== CONSIGNMENTS =====

export async function putConsignment(c: Consignment): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_CONSIGNMENTS, 'readwrite');
    t.objectStore(STORE_CONSIGNMENTS).put(c);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listPendingConsignments(): Promise<Consignment[]> {
  const db = await openDb();
  const all = await reqToPromise<Consignment[]>(db.transaction(STORE_CONSIGNMENTS, 'readonly').objectStore(STORE_CONSIGNMENTS).getAll());
  return all.filter((c) => !c.synced_at);
}

export async function markConsignmentSynced(id: string): Promise<void> {
  const db = await openDb();
  const all = await reqToPromise<Consignment[]>(db.transaction(STORE_CONSIGNMENTS, 'readonly').objectStore(STORE_CONSIGNMENTS).getAll());
  const c = all.find((x) => x.device_consignment_id === id);
  if (!c) return;
  c.synced_at = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_CONSIGNMENTS, 'readwrite');
    t.objectStore(STORE_CONSIGNMENTS).put(c);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ===== CASH SESSIONS =====

export async function putCashSession(c: CashSession): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_CASH, 'readwrite');
    t.objectStore(STORE_CASH).put(c);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listPendingCashSessions(): Promise<CashSession[]> {
  const db = await openDb();
  const all = await reqToPromise<CashSession[]>(db.transaction(STORE_CASH, 'readonly').objectStore(STORE_CASH).getAll());
  return all.filter((c) => !c.synced_at);
}

export async function markCashSynced(id: string): Promise<void> {
  const db = await openDb();
  const all = await reqToPromise<CashSession[]>(db.transaction(STORE_CASH, 'readonly').objectStore(STORE_CASH).getAll());
  const c = all.find((x) => x.device_session_id === id);
  if (!c) return;
  c.synced_at = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_CASH, 'readwrite');
    t.objectStore(STORE_CASH).put(c);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ===== COUNT =====

export async function pendingCount(): Promise<number> {
  const [s, e, st, c, cs] = await Promise.all([
    listPendingSales(),
    listPendingExpenses(),
    listPendingStock(),
    listPendingConsignments(),
    listPendingCashSessions(),
  ]);
  return s.length + e.length + st.length + c.length + cs.length;
}
