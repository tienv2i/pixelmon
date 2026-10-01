/**
 * Type effectiveness chart — tạo từ data/types.json, không hard-code.
 *
 * Value semantics: multiplier khi ATTACK type đánh DEFENSE type.
 *   0 = miễn nhiễm, 0.5 = không hiệu quả, 1 = trung tính, 2 = siêu hiệu quả, 4 = cực hiệu quả
 */
import type { ElementType, TypeChart } from '../data/contracts.js';

/**
 * Type chart tĩnh (fallback khi chưa load data).
 * Giữ đồng bộ với types.json — dùng khi client cần chart mà không load được file.
 */
export const FALLBACK_TYPE_CHART: TypeChart = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

let activeChart: TypeChart = FALLBACK_TYPE_CHART;

/** Nạp chart thật từ data/types.json (gọi 1 lần lúc server boot). */
export function setTypeChart(chart: TypeChart): void {
  activeChart = chart;
}

export function getTypeChart(): TypeChart {
  return activeChart;
}

/**
 * Tổng hiệu quả của `attackType` lên `defenderTypes`.
 * Pokémon 2 hệ nhân các multiplier của từng hệ.
 */
export function typeEffectiveness(
  attackType: ElementType | string,
  defenderTypes: (ElementType | string)[],
): number {
  let multiplier = 1;
  const row: Record<string, number> = activeChart[attackType as ElementType] ?? {};
  for (const dt of defenderTypes) {
    const v = row[dt as ElementType];
    if (v !== undefined) multiplier *= v;
  }
  return multiplier;
}

/** Nhãn tiếng Việt/English cho hiệu quả hệ. */
export function effectivenessLabel(multiplier: number): string {
  if (multiplier === 0) return 'It had no effect...';
  if (multiplier >= 4) return "It's devastatingly effective!";
  if (multiplier > 1) return "It's super effective!";
  if (multiplier < 1) return "It's not very effective...";
  return '';
}

/** STAP: Same Type Attack Bonus */
export function stabMultiplier(moveType: string, pokemonTypes: string[]): number {
  return pokemonTypes.includes(moveType) ? 1.5 : 1.0;
}
