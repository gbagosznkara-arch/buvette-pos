import { X, MessageCircle, Printer, Download } from 'lucide-react';
import type { Sale, MobileOperator } from '@/types/db';
import { fcfa, formatDateTime } from '@/lib/format';

export default function ReceiptModal({
  sale,
  operator,
  onClose,
}: {
  sale: Sale & { sale_items?: { product_name: string; qty: number; unit_price: number; discount: number }[] };
  operator?: MobileOperator;
  managerName: string;
  onClose: () => void;
}) {
  const items = sale.sale_items || [];
  const methodLabel = sale.payment_method === 'cash' ? 'Espèces' : sale.payment_method === 'mobile' ? `Mobile Money${operator ? ' - ' + operator.name : ''}` : sale.payment_method === 'mixed' ? 'Paiement mixte' : 'Crédit';

  const receiptText = buildReceiptText(sale, items, methodLabel);

  function shareWhatsApp() {
    const text = encodeURIComponent(receiptText);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  function shareSMS() {
    const body = encodeURIComponent(receiptText);
    window.location.href = `sms:?body=${body}`;
  }

  function printReceipt() {
    const w = window.open('', '_blank', 'width=380,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Reçu</title><style>
      body{font-family:monospace;font-size:12px;padding:10px;max-width:300px;margin:0 auto}
      h2{text-align:center;font-size:14px}
      .c{text-align:center}
      table{width:100%;border-collapse:collapse}
      td{padding:2px 0}
      .r{text-align:right}
      .t{border-top:1px dashed #000;padding-top:6px;margin-top:6px}
    </style></head><body>${receiptHtml()}</body></html>`);
    w.document.close();
    w.print();
  }

  function downloadReceipt() {
    const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recu_${sale.device_sale_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function receiptHtml() {
    return `
      <h2>Buvette Pro</h2>
      <p class="c">${formatDateTime(sale.created_at)}</p>
      <p class="c">Reçu #${sale.device_sale_id.slice(-6).toUpperCase()}</p>
      <hr>
      <table>
        ${items.map((it) => `<tr><td>${it.qty}x ${it.product_name}</td><td class="r">${fcfa(it.unit_price * it.qty - it.discount)}</td></tr>`).join('')}
      </table>
      <div class="t">
        <table>
          <tr><td><b>Total</b></td><td class="r"><b>${fcfa(sale.total)}</b></td></tr>
          <tr><td>Payment</td><td class="r">${methodLabel}</td></tr>
          ${sale.cash_amount > 0 ? `<tr><td>Espèces</td><td class="r">${fcfa(sale.cash_amount)}</td></tr>` : ''}
          ${sale.mobile_amount > 0 ? `<tr><td>Mobile</td><td class="r">${fcfa(sale.mobile_amount)}</td></tr>` : ''}
          ${sale.change_given > 0 ? `<tr><td>Monnaie</td><td class="r">${fcfa(sale.change_given)}</td></tr>` : ''}
          ${sale.customer_name ? `<tr><td>Client</td><td class="r">${sale.customer_name}</td></tr>` : ''}
        </table>
      </div>
      <p class="c">Merci !</p>
    `;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Reçu</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {/* Receipt content */}
        <div className="p-5 font-mono text-sm text-slate-800">
          <div className="text-center mb-3">
            <div className="font-bold text-base">Buvette Pro</div>
            <div className="text-xs text-slate-500">{formatDateTime(sale.created_at)}</div>
            <div className="text-xs text-slate-500">Reçu #{sale.device_sale_id.slice(-6).toUpperCase()}</div>
          </div>
          <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
            {items.map((it, i) => (
              <div key={i} className="flex justify-between">
                <span>{it.qty}x {it.product_name}</span>
                <span>{fcfa(it.unit_price * it.qty - it.discount)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-slate-300 pt-2 mt-2 space-y-1">
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{fcfa(sale.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Paiement</span>
              <span>{methodLabel}</span>
            </div>
            {sale.cash_amount > 0 && <div className="flex justify-between text-xs"><span>Espèces</span><span>{fcfa(sale.cash_amount)}</span></div>}
            {sale.mobile_amount > 0 && <div className="flex justify-between text-xs"><span>Mobile</span><span>{fcfa(sale.mobile_amount)}</span></div>}
            {sale.change_given > 0 && <div className="flex justify-between text-xs"><span>Monnaie rendue</span><span>{fcfa(sale.change_given)}</span></div>}
            {sale.customer_name && <div className="flex justify-between text-xs"><span>Client</span><span>{sale.customer_name}</span></div>}
          </div>
          <div className="text-center text-xs text-slate-400 mt-3">Merci de votre visite !</div>
        </div>

        {/* Share buttons */}
        <div className="p-4 border-t border-slate-100 grid grid-cols-4 gap-2">
          <ShareBtn onClick={shareWhatsApp} icon={<MessageCircle className="w-5 h-5" />} label="WhatsApp" color="emerald" />
          <ShareBtn onClick={shareSMS} icon={<MessageCircle className="w-5 h-5" />} label="SMS" color="sky" />
          <ShareBtn onClick={printReceipt} icon={<Printer className="w-5 h-5" />} label="Imprimer" color="slate" />
          <ShareBtn onClick={downloadReceipt} icon={<Download className="w-5 h-5" />} label="Télécharger" color="violet" />
        </div>
      </div>
    </div>
  );
}

function ShareBtn({ onClick, icon, label, color }: { onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    sky: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
    slate: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    violet: 'bg-violet-50 text-violet-700 hover:bg-violet-100',
  };
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium ${colors[color]}`}>
      {icon}
      {label}
    </button>
  );
}

function buildReceiptText(
  sale: Sale & { sale_items?: { product_name: string; qty: number; unit_price: number; discount: number }[] },
  items: { product_name: string; qty: number; unit_price: number; discount: number }[],
  methodLabel: string,
): string {
  const lines: string[] = [];
  lines.push('=== Buvette Pro ===');
  lines.push(formatDateTime(sale.created_at));
  lines.push(`Reçu #${sale.device_sale_id.slice(-6).toUpperCase()}`);
  lines.push('------------------');
  items.forEach((it) => {
    lines.push(`${it.qty}x ${it.product_name} - ${fcfa(it.unit_price * it.qty - it.discount)}`);
  });
  lines.push('------------------');
  lines.push(`Total: ${fcfa(sale.total)}`);
  lines.push(`Paiement: ${methodLabel}`);
  if (sale.cash_amount > 0) lines.push(`Espèces: ${fcfa(sale.cash_amount)}`);
  if (sale.mobile_amount > 0) lines.push(`Mobile: ${fcfa(sale.mobile_amount)}`);
  if (sale.change_given > 0) lines.push(`Monnaie: ${fcfa(sale.change_given)}`);
  if (sale.customer_name) lines.push(`Client: ${sale.customer_name}`);
  lines.push('Merci de votre visite !');
  return lines.join('\n');
}
