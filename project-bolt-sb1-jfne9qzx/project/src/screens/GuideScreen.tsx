import { useState } from 'react';
import { X, BookOpen, ShoppingCart, Boxes, BarChart3, Users, Wallet, Lock, PackageCheck, Smartphone, Wifi, Download, ChevronRight } from 'lucide-react';

type Role = 'owner' | 'manager';

export default function GuideScreen({ role, onClose }: { role: Role; onClose: () => void }) {
  const [page, setPage] = useState(0);

  const ownerPages = [
    {
      icon: <BookOpen className="w-10 h-10 text-sky-600" />,
      title: 'Bienvenue sur Buvette Pro',
      body: 'Ton application de gestion de buvette complète. Vendre, suivre le stock, gérer tes gérantes et connaître tes bénéfices — même hors ligne.',
    },
    {
      icon: <PackageCheck className="w-10 h-10 text-sky-600" />,
      title: 'Boissons & Stock',
      body: 'Ajoute tes boissons avec prix d\'achat et prix de vente. Suis ton stock en temps réel : l\'app te prévient quand une boisson est presque épuisée. Achète en bouteilles, vends en verres — la conversion est automatique.',
    },
    {
      icon: <BarChart3 className="w-10 h-10 text-sky-600" />,
      title: 'Rapports détaillés',
      body: 'Vois ton chiffre d\'affaires et ton bénéfice brut par période. Identifie tes boissons les plus vendues et les plus rentables, le pic d\'affluence, et les performances de chaque gérante. Exporte en CSV pour ta comptabilité.',
    },
    {
      icon: <Users className="w-10 h-10 text-sky-600" />,
      title: 'Gérantes',
      body: 'Crée un compte pour chaque gérante avec son nom et son mot de passe. Elle se connectera sur son propre téléphone. Tu peux désactiver un compte à tout moment.',
    },
    {
      icon: <ShoppingCart className="w-10 h-10 text-sky-600" />,
      title: 'Ventes & Annulations',
      body: 'Consulte l\'historique complet des ventes. Tu peux annuler une vente (avec motif obligatoire) — le stock est automatiquement restitué.',
    },
    {
      icon: <PackageCheck className="w-10 h-10 text-sky-600" />,
      title: 'Consignes',
      body: 'Suis les bouteilles et casiers consignés. Sors une consigne quand tu la remets au client, restitue-la quand il la rapporte. L\'app garde le compte de ce qui est en circulation.',
    },
    {
      icon: <Wifi className="w-10 h-10 text-sky-600" />,
      title: 'Fonctionne hors ligne',
      body: 'Tes gérantes peuvent vendre même sans internet. Tout est enregistré sur le téléphone et synchronisé automatiquement dès que la connexion revient. Le badge "X en attente" en haut indique les opérations à synchroniser.',
    },
    {
      icon: <Download className="w-10 h-10 text-sky-600" />,
      title: 'Installer l\'application',
      body: 'Pour une expérience optimale, installe Buvette Pro sur ton téléphone : dans le menu du navigateur (Chrome), choisis "Ajouter à l\'écran d\'accueil". L\'app se lancera comme une vraie application, plein écran.',
    },
  ];

  const managerPages = [
    {
      icon: <BookOpen className="w-10 h-10 text-sky-600" />,
      title: 'Bienvenue sur Buvette Pro',
      body: 'Ton outil de caisse rapide et simple. Vends des boissons, encaisses en espèces ou Mobile Money, et clôture ta caisse à la fin de la journée.',
    },
    {
      icon: <ShoppingCart className="w-10 h-10 text-sky-600" />,
      title: 'Vendre',
      body: 'Touche une boisson pour l\'ajouter au panier. Ajuste les quantités, puis touche "Encaisser". Choisis le mode de paiement (espèces, Mobile Money, ou mixte). L\'app calcule la monnaie à rendre. Un reçu s\'affiche, partageable par WhatsApp ou SMS.',
    },
    {
      icon: <Boxes className="w-10 h-10 text-sky-600" />,
      title: 'Stock',
      body: 'Vérifie le stock restant de chaque boisson. Tu peux signaler une perte ou une casse. Le propriétaire est notifié automatiquement.',
    },
    {
      icon: <PackageCheck className="w-10 h-10 text-sky-600" />,
      title: 'Consignes',
      body: 'Quand tu remets une bouteille consignée au client, enregistre une "sortie de consigne". Quand il la rapporte, enregistre une "restitution". L\'app garde le compte.',
    },
    {
      icon: <Wallet className="w-10 h-10 text-sky-600" />,
      title: 'Dépenses',
      body: 'Enregistre les dépenses de la journée (achat de glace, transport, électricité...). Elles seront déduites de la caisse lors de la clôture.',
    },
    {
      icon: <Lock className="w-10 h-10 text-sky-600" />,
      title: 'Clôture de caisse',
      body: 'À la fin de la journée, touche "Clôture". L\'app résume tes ventes (espèces, Mobile Money, par opérateur), calcule les espèces théoriques. Compte l\'argent réellement présent, note un éventuel écart, et clôture. Tout est envoyé au propriétaire.',
    },
    {
      icon: <Wifi className="w-10 h-10 text-sky-600" />,
      title: 'Hors ligne',
      body: 'Pas de réseau ? Aucun problème. Tes ventes sont enregistrées sur ton téléphone. Dès que tu retrouves une connexion, tout se synchronise automatiquement. Le badge en haut t\'indique ce qui est en attente.',
    },
    {
      icon: <Download className="w-10 h-10 text-sky-600" />,
      title: 'Installer l\'application',
      body: 'Installe Buvette Pro sur ton téléphone pour un accès rapide : menu Chrome → "Ajouter à l\'écran d\'accueil". L\'app se lancera comme une vraie application, sans le navigateur.',
    },
  ];

  const pages = role === 'owner' ? ownerPages : managerPages;
  const current = pages[page];
  const isLast = page === pages.length - 1;

  return (
    <div className="fixed inset-0 bg-white z-[70] flex flex-col">
      <div className="bg-sky-700 text-white px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium">Guide d'utilisation</span>
        <button onClick={onClose} className="p-1.5 hover:bg-sky-600 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div className="w-20 h-20 rounded-3xl bg-sky-50 flex items-center justify-center mb-6">
            {current.icon}
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-3">{current.title}</h2>
          <p className="text-slate-600 leading-relaxed">{current.body}</p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 my-6">
          {pages.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === page ? 'w-6 bg-sky-600' : 'w-1.5 bg-slate-300'}`}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 p-4 flex gap-2 safe-bottom">
        {page > 0 && (
          <button onClick={() => setPage(page - 1)} className="px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium">
            Précédent
          </button>
        )}
        <button
          onClick={() => isLast ? onClose() : setPage(page + 1)}
          className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
        >
          {isLast ? 'Commencer' : 'Suivant'}
          {!isLast && <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
