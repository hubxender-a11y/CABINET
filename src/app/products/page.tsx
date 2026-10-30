import { products } from "@/data/mock-data";

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Produits</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Catalogue de vente</h1>
        </div>
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white">Ajouter produit</button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {products.map((product) => (
          <div key={product.sku} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{product.sku}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${product.atRisk ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {product.atRisk ? "Rupture" : "Disponible"}
              </span>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">{product.name}</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div>
                <p className="text-slate-400">Stock</p>
                <p className="mt-1 font-semibold text-slate-900">{product.stock}</p>
              </div>
              <div>
                <p className="text-slate-400">Prix</p>
                <p className="mt-1 font-semibold text-slate-900">{product.price}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
