export function calculateStat(
  base: number,
  level: number,
  iv: number,
  ev: number,
): number {
  return Math.floor(((2 * base + iv + ev / 4) * level) / 100) + 5;
}

export function calculateHp(base: number, level: number, iv: number, ev: number): number {
  return Math.floor(((2 * base + iv + ev / 4) * level) / 100) + level + 10;
}

export function calculateDamage(
  attackerLevel: number,
  movePower: number,
  attack: number,
  defense: number,
): number {
  const baseDamage =
    (((2 * attackerLevel) / 5 + 2) * movePower * (attack / defense)) / 50 + 2;
  return Math.floor(baseDamage);
}

export function expToNextLevel(baseExp: number, level: number): number {
  return Math.floor((baseExp * level * level * level) / 4);
}
