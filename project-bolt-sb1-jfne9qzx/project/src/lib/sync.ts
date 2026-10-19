import { supabase } from '@/lib/supabase';
import {
  listPendingSales,
  listPendingExpenses,
  listPendingStock,
  listPendingConsignments,
  listPendingCashSessions,
  markSaleSynced,
  markExpenseSynced,
  markStockSynced,
  markConsignmentSynced,
  markCashSynced,
} from '@/lib/offline-db';

export interface SyncResult {
  ok: number;
  failed: number;
  errors: string[];
}

export async function syncAll(): Promise<SyncResult> {
  const result: SyncResult = { ok: 0, failed: 0, errors: [] };

  // Sales (+ items)
  const sales = await listPendingSales();
  for (const sale of sales) {
    const { items, ...saleRow } = sale;
    const { error } = await supabase.from('sales').upsert(saleRow, {
      onConflict: 'device_id,device_sale_id',
    });
    if (error) {
      result.failed++;
      result.errors.push(`Vente ${sale.device_sale_id}: ${error.message}`);
      continue;
    }
    if (items && items.length > 0) {
      const saleId = saleRow.id;
      if (saleId) {
        const rows = items.map((it) => ({ ...it, sale_id: saleId }));
        await supabase.from('sale_items').upsert(rows, { onConflict: 'id' });
      }
    }
    await markSaleSynced(sale.device_sale_id);
    result.ok++;
  }

  // Expenses
  const expenses = await listPendingExpenses();
  for (const e of expenses) {
    const { error } = await supabase.from('expenses').upsert(e, {
      onConflict: 'device_id,device_expense_id',
    });
    if (error) {
      result.failed++;
      result.errors.push(`Dépense ${e.device_expense_id}: ${error.message}`);
      continue;
    }
    await markExpenseSynced(e.device_expense_id);
    result.ok++;
  }

  // Stock movements
  const stocks = await listPendingStock();
  for (const m of stocks) {
    const { error } = await supabase.from('stock_movements').upsert(m, {
      onConflict: 'device_id,device_mvmt_id',
    });
    if (error) {
      result.failed++;
      result.errors.push(`Stock ${m.device_mvmt_id}: ${error.message}`);
      continue;
    }
    await markStockSynced(m.device_mvmt_id);
    result.ok++;
  }

  // Consignments
  const consignments = await listPendingConsignments();
  for (const c of consignments) {
    const { error } = await supabase.from('consignments').upsert(c, {
      onConflict: 'device_id,device_consignment_id',
    });
    if (error) {
      result.failed++;
      result.errors.push(`Consigne ${c.device_consignment_id}: ${error.message}`);
      continue;
    }
    await markConsignmentSynced(c.device_consignment_id);
    result.ok++;
  }

  // Cash sessions
  const sessions = await listPendingCashSessions();
  for (const cs of sessions) {
    const { error } = await supabase.from('cash_sessions').upsert(cs, {
      onConflict: 'device_id,device_session_id',
    });
    if (error) {
      result.failed++;
      result.errors.push(`Clôture ${cs.device_session_id}: ${error.message}`);
      continue;
    }
    await markCashSynced(cs.device_session_id);
    result.ok++;
  }

  return result;
}
