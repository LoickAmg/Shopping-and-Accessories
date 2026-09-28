import type { Metadata } from "next";

import { CurrencyRateForm } from "@/components/CurrencyRateForm";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { rateToInput } from "@/lib/currency";
import { money } from "@/lib/format";
import { listAllCurrencies } from "@/server/currency";

export const metadata: Metadata = { title: "Devises" };

export default async function AdminCurrenciesPage({ searchParams }: PageProps<"/admin/devises">) {
  const query = await searchParams;
  const currencies = await listAllCurrencies(await getDb());
  const base = currencies.find((currency) => currency.isBase);
  const others = currencies.filter((currency) => !currency.isBase);

  return (
    <>
      <h1>Devises</h1>
      <p className="muted">
        Les prix du catalogue sont saisis en {base?.code ?? store.currency.code} (devise de base, définie par <code>SHOP_CURRENCY</code>).
        Activez une devise supplémentaire pour que les visiteurs puissent l&apos;afficher et payer avec ; aucun taux n&apos;est deviné, vous le réglez ici.
      </p>

      {query.enregistre && (
        <p className="notice notice-ok" role="status">
          Devise mise à jour.
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Devise</th>
              <th scope="col" className="num">
                Exemple
              </th>
              <th scope="col">État</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{base?.code ?? store.currency.code} (base)</td>
              <td className="num">{money(150000)}</td>
              <td>Toujours active — changez <code>SHOP_CURRENCY</code> pour en changer.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: "var(--space-6)" }}>Devises supplémentaires</h2>
      <ul className="lines">
        {others.map((currency) => (
          <li key={currency.code} style={{ padding: "var(--space-4) 0", borderBottom: "1px solid var(--rule)" }}>
            <CurrencyRateForm
              code={currency.code}
              baseCode={base?.code ?? store.currency.code}
              rate={rateToInput(currency.rateMicros)}
              active={currency.active}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
