import type { ZxcvbnFactory as ZxcvbnFactoryType } from '@zxcvbn-ts/core';

let zxcvbnPromise: Promise<ZxcvbnFactoryType> | null = null;

// Import dinámico: el diccionario de zxcvbn-ts pesa varios cientos de KB y solo se necesita
// en las pantallas de cambio/reset de contraseña, no en el bundle inicial de la app.
function getZxcvbn(): Promise<ZxcvbnFactoryType> {
  if (!zxcvbnPromise) {
    zxcvbnPromise = Promise.all([
      import('@zxcvbn-ts/core'),
      import('@zxcvbn-ts/language-common'),
    ]).then(([core, zxcvbnCommonPackage]) => new core.ZxcvbnFactory({
      dictionary: {
        ...zxcvbnCommonPackage.dictionary,
      },
      graphs: zxcvbnCommonPackage.adjacencyGraphs,
    }));
  }
  return zxcvbnPromise;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  barColorClass: string;
  textColorClass: string;
  barPercent: number;
}

const LABELS: Record<number, string> = {
  0: 'Muy débil',
  1: 'Débil',
  2: 'Aceptable',
  3: 'Fuerte',
  4: 'Muy fuerte',
};

const BAR_COLOR_CLASSES: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
  4: 'bg-emerald-600',
};

const TEXT_COLOR_CLASSES: Record<number, string> = {
  0: 'text-red-500',
  1: 'text-orange-500',
  2: 'text-amber-500',
  3: 'text-emerald-500',
  4: 'text-emerald-600',
};

export async function evaluatePasswordStrength(password: string): Promise<PasswordStrength | null> {
  if (!password) return null;

  const zxcvbn = await getZxcvbn();
  const result = await zxcvbn.checkAsync(password);
  const score = result.score as 0 | 1 | 2 | 3 | 4;

  return {
    score,
    label: LABELS[score],
    barColorClass: BAR_COLOR_CLASSES[score],
    textColorClass: TEXT_COLOR_CLASSES[score],
    barPercent: (score + 1) * 20,
  };
}
