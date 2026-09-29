export const POKEMON_DATABASE = {
  bulbasaur: {
    id: 'bulbasaur',
    name: 'Bulbasaur',
    types: ['grass', 'poison'],
    baseStats: {
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    },
  },
  charmander: {
    id: 'charmander',
    name: 'Charmander',
    types: ['fire'],
    baseStats: {
      hp: 39,
      attack: 52,
      defense: 43,
      spAttack: 60,
      spDefense: 50,
      speed: 65,
    },
  },
  squirtle: {
    id: 'squirtle',
    name: 'Squirtle',
    types: ['water'],
    baseStats: {
      hp: 44,
      attack: 48,
      defense: 65,
      spAttack: 50,
      spDefense: 64,
      speed: 43,
    },
  },
};

export type PokemonSpecies = (typeof POKEMON_DATABASE)[keyof typeof POKEMON_DATABASE];
