const units = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
];

function underHundred(value: number): string {
  if (value < 10) return units[value];
  if (value < 17)
    return ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'][
      value - 10
    ];
  if (value < 20) return `dix-${units[value - 10]}`;
  if (value < 70) {
    const tens = [
      '',
      '',
      'vingt',
      'trente',
      'quarante',
      'cinquante',
      'soixante',
    ][Math.floor(value / 10)];
    const rest = value % 10;
    return rest === 0
      ? tens
      : rest === 1
        ? `${tens} et un`
        : `${tens}-${units[rest]}`;
  }
  if (value < 80)
    return value === 71
      ? 'septante et un'
      : `septante ${underHundred(value - 70)}`;
  if (value < 90)
    return value === 80
      ? 'quatre-vingts'
      : `quatre-vingt${value === 81 ? '-un' : `-${underHundred(value - 80)}`}`;
  return value === 90 ? 'nonante' : `nonante ${underHundred(value - 90)}`;
}

function underThousand(value: number): string {
  if (value < 100) return underHundred(value);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const base =
    hundreds === 1 ? 'cent' : `${units[hundreds]} cent${rest === 0 ? 's' : ''}`;
  return rest ? `${base} ${underHundred(rest)}` : base;
}

function integerWords(value: number): string {
  const scaleWords = ['', 'mille', 'million', 'milliard'];
  const chunks: string[] = [];
  let rest = value;
  let scale = 0;
  while (rest > 0) {
    const group = rest % 1000;
    if (group) {
      const text = underThousand(group);
      if (scale === 1) chunks.unshift(group === 1 ? 'mille' : `${text} mille`);
      else if (scale > 1)
        chunks.unshift(`${text} ${scaleWords[scale]}${group > 1 ? 's' : ''}`);
      else chunks.unshift(text);
    }
    rest = Math.floor(rest / 1000);
    scale++;
  }
  return chunks.join(' ') || 'zéro';
}

export function amountInWords(
  amount: PrismaAmount,
  currency: 'CDF' | 'USD',
): string {
  const value = Number(amount.toString());
  const integer = Math.floor(value);
  const minor = Math.round((value - integer) * 100);
  const unit = currency === 'USD' ? 'dollar américain' : 'franc congolais';
  return `${integerWords(integer)} ${unit}${integer > 1 ? 's' : ''}${minor ? ` et ${integerWords(minor)} centime${minor > 1 ? 's' : ''}` : ''}`.toLocaleUpperCase(
    'fr-CD',
  );
}

type PrismaAmount = { toString(): string };
