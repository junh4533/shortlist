/** All company source readers, in import order (higher-quality names first). */
import type { SourceReader } from "../registry";
import { feashliaa } from "./feashliaa";
import { openjobs, stateOfAts, yc } from "./json-sources";
import { lastround } from "./lastround";
import { onlynerds, openjobdata, stapply } from "./parquet";

export const SOURCE_READERS: SourceReader[] = [
  lastround,
  feashliaa,
  stapply,
  openjobdata,
  onlynerds,
  openjobs,
  stateOfAts,
  yc,
];
