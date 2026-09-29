import type { AsyncHandler } from '../../types/index.js';

export const getPlayerHandler: AsyncHandler = async (req, res) => {
  res.json({ player: null });
};

export const updatePlayerHandler: AsyncHandler = async (req, res) => {
  res.json({ success: true });
};
