"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { setDisplayCurrencyAction } from "@/app/actions/currency";

interface Props {
  currencies: { code: string }[];
  current: string;
}

/** Un client component seulement pour connaître la page courante (retour après le changement). */
export function CurrencySwitcher({ currencies, current }: Props) {
  const pathname = usePathname();
  const query = useSearchParams().toString();

  if (currencies.length <= 1) return null;

  return (
    <form action={setDisplayCurrencyAction} className="currency-switcher">
      <label htmlFor="currency-select" className="sr-only">
        Devise
      </label>
      <input type="hidden" name="retour" value={query ? `${pathname}?${query}` : pathname} />
      <select
        id="currency-select"
        name="code"
        defaultValue={current}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {currencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code}
          </option>
        ))}
      </select>
      <button type="submit" className="currency-switcher-submit">
        OK
      </button>
    </form>
  );
}
