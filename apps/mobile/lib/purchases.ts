// RevenueCat wrapper. Doc 05 §subscription, Doc 08 §grant-logic.
//
// Slice F1: react-native-purchases configures with REVENUECAT_API_KEY at
// mount, identifies the account via the `revenuecat_app_user_id` field on
// the user's subscription row (set during signup), and exposes
// startPurchase/restorePurchases for the admin subscription screen.

import { ENV } from './env.js';

export type PurchasePackage = {
  identifier: string;
  product: { identifier: string; priceString: string };
};

type PurchasesLib = {
  configure: (opts: { apiKey: string; appUserID?: string }) => void;
  getOfferings: () => Promise<{
    current: null | {
      availablePackages: Array<PurchasePackage>;
    };
  }>;
  purchasePackage: (pkg: unknown) => Promise<unknown>;
  restorePurchases: () => Promise<unknown>;
  logIn: (appUserID: string) => Promise<unknown>;
};

let Purchases: PurchasesLib | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-purchases');
  Purchases = (mod.default ?? mod) as PurchasesLib;
} catch {
  Purchases = null;
}

let configured = false;

export function configurePurchases(appUserID: string): void {
  if (!Purchases) return;
  if (configured) return;
  if (!ENV.REVENUECAT_API_KEY) return;
  Purchases.configure({ apiKey: ENV.REVENUECAT_API_KEY, appUserID });
  configured = true;
}

export async function startPurchase(sku: 'standard' | 'plus'): Promise<void> {
  if (!Purchases) throw new Error('Purchases nicht verfügbar — bist du im Web?');
  if (!configured) throw new Error('Purchases nicht konfiguriert.');
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find(
    (p) => p.identifier === sku || p.product.identifier.includes(sku),
  );
  if (!pkg) throw new Error(`Paket "${sku}" nicht verfügbar`);
  await Purchases.purchasePackage(pkg);
}

export async function restorePurchases(): Promise<void> {
  if (!Purchases) throw new Error('Purchases nicht verfügbar');
  if (!configured) throw new Error('Purchases nicht konfiguriert.');
  await Purchases.restorePurchases();
}

export async function getOfferings(): Promise<Array<PurchasePackage>> {
  if (!Purchases || !configured) return [];
  const result = await Purchases.getOfferings();
  return result.current?.availablePackages ?? [];
}
