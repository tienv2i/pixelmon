/**
 * Type definitions cho Tiled Maps Editor JSON format (.tmj).
 * Theo spec: https://doc.mapeditor.org/en/stable/manual/json-map-format/
 */

export interface TiledLayer {
  id: number;
  name: string;
  type: 'tilelayer' | 'objectgroup' | 'imagelayer';
  /** Tilelayer only — array of GIDs, row-major order */
  data?: number[];
  /** Objectgroup only */
  objects?: unknown[];
  visible?: boolean;
  opacity?: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  columns: number;
  tilecount: number;
  margin?: number;
  spacing?: number;
}

export interface TiledMapJSON {
  version: string;
  tiledversion: string;
  type: 'map';
  orientation: 'orthogonal' | 'isometric' | 'staggered';
  renderorder: string;
  infinite: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  nextlayerid: number;
  nextobjectid: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}
